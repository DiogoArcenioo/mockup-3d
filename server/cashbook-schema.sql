CREATE TABLE IF NOT EXISTS forma_finance.cash_transactions (
  id uuid PRIMARY KEY, request_id uuid NOT NULL UNIQUE,
  kind text NOT NULL CHECK(kind IN ('expense','partner_payment','income','adjustment')),
  occurred_at date NOT NULL CHECK(occurred_at BETWEEN '2000-01-01' AND '2100-12-31'),
  amount_cents bigint NOT NULL CHECK(amount_cents<>0 AND abs(amount_cents)<=10000000000),
  description varchar(160) NOT NULL, notes varchar(1000) NOT NULL DEFAULT '',
  recipient_id uuid, recipient_name varchar(100),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK((kind IN ('expense','partner_payment') AND amount_cents<0) OR (kind='income' AND amount_cents>0) OR kind='adjustment'),
  CHECK((kind='partner_payment' AND recipient_id IS NOT NULL AND recipient_name IS NOT NULL) OR (kind<>'partner_payment' AND recipient_id IS NULL AND recipient_name IS NULL))
);
CREATE INDEX IF NOT EXISTS cash_transactions_date ON forma_finance.cash_transactions(occurred_at,created_at,id);
CREATE TABLE IF NOT EXISTS forma_finance.activity_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity text NOT NULL, entity_id uuid NOT NULL, operation text NOT NULL,
  actor_id uuid, actor_name text NOT NULL,
  before_data jsonb, after_data jsonb, created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS activity_log_date ON forma_finance.activity_log(created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS activity_log_entity ON forma_finance.activity_log(entity,entity_id,operation);
CREATE OR REPLACE FUNCTION forma_finance.record_activity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE before_row jsonb; after_row jsonb; target_id uuid; action text := TG_OP;
BEGIN
  IF TG_OP<>'INSERT' THEN before_row=to_jsonb(OLD)-ARRAY['password_hash','content']; END IF;
  IF TG_OP<>'DELETE' THEN after_row=to_jsonb(NEW)-ARRAY['password_hash','content']; END IF;
  IF TG_TABLE_NAME='users' THEN
    IF TG_OP='UPDATE' THEN
      IF OLD.password_hash IS DISTINCT FROM NEW.password_hash THEN action='PASSWORD'; END IF;
    END IF;
  END IF;
  IF TG_OP='UPDATE' AND before_row=after_row AND action<>'PASSWORD' THEN RETURN NEW; END IF;
  target_id=coalesce(after_row->>'id',after_row->>'product_id',before_row->>'id',before_row->>'product_id')::uuid;
  INSERT INTO forma_finance.activity_log(entity,entity_id,operation,actor_id,actor_name,before_data,after_data)
  VALUES(TG_TABLE_NAME,target_id,action,nullif(current_setting('infinity.actor_id',true),'')::uuid,
    coalesce(nullif(current_setting('infinity.actor_name',true),''),'Sistema / responsável não informado'),before_row,after_row);
  RETURN coalesce(NEW,OLD);
END $$;
DO $$ DECLARE tab text; BEGIN
  FOREACH tab IN ARRAY ARRAY['products','product_colors','product_brands','product_photos','entries','sales','stock_movements','cash_transactions','sale_orders','product_sale_prices','product_cost_history'] LOOP
    EXECUTE format('CREATE OR REPLACE TRIGGER infinity_activity AFTER INSERT OR UPDATE OR DELETE ON forma_finance.%I FOR EACH ROW EXECUTE FUNCTION forma_finance.record_activity()',tab);
  END LOOP;
  IF to_regclass('forma_auth.users') IS NOT NULL THEN
    EXECUTE 'CREATE OR REPLACE TRIGGER infinity_activity AFTER INSERT OR UPDATE OR DELETE ON forma_auth.users FOR EACH ROW EXECUTE FUNCTION forma_finance.record_activity()';
  END IF;
END $$;
-- A view recognizes existing purchases/sales exactly once, without copying them.
CREATE OR REPLACE VIEW forma_finance.cashbook AS
SELECT e.id,'purchase'::text kind,e.purchased_at occurred_at,-e.total_cents amount_cents,
  ('Compra · '||e.product_name)::text description,e.supplier::text counterparty,e.notes::text notes,e.created_at,
  null::uuid recipient_id FROM forma_finance.entries e
UNION ALL SELECT s.id,'sale',s.sold_at,s.total_cents,'Venda · '||s.product_name,s.customer,s.notes,s.created_at,null::uuid FROM forma_finance.sales s WHERE s.order_id IS NULL
UNION ALL SELECT o.id,'sale',o.sold_at,o.total_cents,'Venda · '||o.summary,o.customer,o.notes,o.created_at,null::uuid FROM forma_finance.sale_orders o
UNION ALL SELECT c.id,c.kind,c.occurred_at,c.amount_cents,c.description,coalesce(c.recipient_name,''),c.notes,c.created_at,c.recipient_id FROM forma_finance.cash_transactions c;
