CREATE SCHEMA IF NOT EXISTS forma_finance;
CREATE TABLE IF NOT EXISTS forma_finance.products (
  id uuid PRIMARY KEY,
  name varchar(120) NOT NULL CHECK (length(trim(name)) > 0),
  type varchar(20) NOT NULL CHECK (type IN ('resale', 'consumption')),
  unit varchar(10) NOT NULL CHECK (unit IN ('un', 'folha', 'rolo', 'ml', 'l', 'g', 'kg')),
  min_stock numeric(14,3) NOT NULL DEFAULT 0 CHECK (min_stock >= 0),
  notes varchar(1000) NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS forma_finance.entries (
  id uuid PRIMARY KEY,
  request_id uuid NOT NULL UNIQUE,
  product_id uuid NOT NULL REFERENCES forma_finance.products(id),
  product_name varchar(120) NOT NULL,
  product_type varchar(20) NOT NULL CHECK (product_type IN ('resale', 'consumption')),
  unit varchar(10) NOT NULL,
  purchased_at date NOT NULL,
  packaging varchar(20) NOT NULL CHECK (packaging IN ('unit', 'box', 'package')),
  package_count integer NOT NULL CHECK (package_count > 0),
  units_per_package numeric(14,3) NOT NULL CHECK (units_per_package > 0),
  quantity numeric(14,3) GENERATED ALWAYS AS (package_count * units_per_package) STORED,
  total_cents bigint NOT NULL CHECK (total_cents > 0 AND total_cents <= 10000000000),
  unit_cost numeric(20,6) GENERATED ALWAYS AS (total_cents::numeric / 100 / (package_count * units_per_package)) STORED,
  supplier varchar(160) NOT NULL DEFAULT '',
  notes varchar(1000) NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (package_count * units_per_package <= 1000000),
  CHECK (packaging <> 'unit' OR units_per_package = 1)
);
CREATE INDEX IF NOT EXISTS entries_product_date ON forma_finance.entries (product_id, purchased_at DESC, created_at DESC);
CREATE TABLE IF NOT EXISTS forma_finance.stock_movements (
  id uuid PRIMARY KEY,
  product_id uuid NOT NULL REFERENCES forma_finance.products(id),
  entry_id uuid UNIQUE REFERENCES forma_finance.entries(id),
  kind varchar(20) NOT NULL CHECK (kind IN ('purchase', 'sale', 'consumption', 'adjustment')),
  quantity numeric(14,3) NOT NULL CHECK (quantity <> 0),
  occurred_at date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind = 'purchase' AND entry_id IS NOT NULL AND quantity > 0) OR
         (kind IN ('sale', 'consumption') AND entry_id IS NULL AND quantity < 0) OR
         (kind = 'adjustment' AND entry_id IS NULL))
);
CREATE INDEX IF NOT EXISTS movements_product ON forma_finance.stock_movements (product_id);

-- Shared catalogs; case-insensitive names also make quick-create retries idempotent.
CREATE TABLE IF NOT EXISTS forma_finance.product_colors (
  id uuid PRIMARY KEY,
  name varchar(60) NOT NULL CHECK (length(trim(name)) > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS product_colors_name_unique ON forma_finance.product_colors (lower(trim(name)));
CREATE TABLE IF NOT EXISTS forma_finance.product_brands (
  id uuid PRIMARY KEY,
  name varchar(60) NOT NULL CHECK (length(trim(name)) > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS product_brands_name_unique ON forma_finance.product_brands (lower(trim(name)));
INSERT INTO forma_finance.product_colors(id,name)
SELECT gen_random_uuid(), name FROM unnest(ARRAY['Branco','Preto','Azul','Vermelho','Verde','Amarelo','Rosa','Roxo','Cinza','Bege','Marrom','Laranja','Transparente']) AS name
ON CONFLICT (lower(trim(name))) DO NOTHING;
INSERT INTO forma_finance.product_brands(id,name)
SELECT gen_random_uuid(), name FROM unnest(ARRAY['Nike','Adidas']) AS name
ON CONFLICT (lower(trim(name))) DO NOTHING;

-- Existing products stay unclassified until the team explicitly chooses a category.
ALTER TABLE forma_finance.products ADD COLUMN IF NOT EXISTS category varchar(20) CHECK (category IN ('mug','tshirt','mobile_accessory'));
ALTER TABLE forma_finance.products ADD COLUMN IF NOT EXISTS color_id uuid REFERENCES forma_finance.product_colors(id);
ALTER TABLE forma_finance.products ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES forma_finance.product_brands(id);
CREATE INDEX IF NOT EXISTS products_category ON forma_finance.products(category);
CREATE UNIQUE INDEX IF NOT EXISTS products_variant_unique ON forma_finance.products (
  lower(trim(name)), coalesce(category,''),
  coalesce(color_id,'00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(brand_id,'00000000-0000-0000-0000-000000000000'::uuid)
);
DROP INDEX IF EXISTS forma_finance.products_name_unique;
ALTER TABLE forma_finance.entries ADD COLUMN IF NOT EXISTS product_category varchar(20);
ALTER TABLE forma_finance.entries ADD COLUMN IF NOT EXISTS product_color varchar(60) NOT NULL DEFAULT '';
ALTER TABLE forma_finance.entries ADD COLUMN IF NOT EXISTS product_brand varchar(60) NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS forma_finance.sales (
  id uuid PRIMARY KEY,
  request_id uuid NOT NULL UNIQUE,
  product_id uuid NOT NULL REFERENCES forma_finance.products(id),
  product_name varchar(120) NOT NULL,
  product_type varchar(20) NOT NULL CHECK (product_type='resale'),
  product_category varchar(20),
  product_color varchar(60) NOT NULL DEFAULT '',
  product_brand varchar(60) NOT NULL DEFAULT '',
  unit varchar(10) NOT NULL,
  sold_at date NOT NULL,
  quantity numeric(14,3) NOT NULL CHECK (quantity>0 AND quantity<=1000000),
  total_cents bigint NOT NULL CHECK (total_cents>0 AND total_cents<=10000000000),
  customer varchar(160) NOT NULL DEFAULT '',
  notes varchar(1000) NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sales_product_date ON forma_finance.sales(product_id,sold_at DESC,created_at DESC);
ALTER TABLE forma_finance.stock_movements ADD COLUMN IF NOT EXISTS sale_id uuid UNIQUE REFERENCES forma_finance.sales(id) CHECK (sale_id IS NULL OR kind='sale');

CREATE TABLE IF NOT EXISTS forma_finance.product_photos (
  product_id uuid PRIMARY KEY REFERENCES forma_finance.products(id) ON DELETE CASCADE,
  version uuid NOT NULL,
  mime_type varchar(20) NOT NULL CHECK (mime_type IN ('image/jpeg','image/png','image/webp')),
  content bytea NOT NULL CHECK (octet_length(content)>0 AND octet_length(content)<=3145728),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Preços: o cadastro guarda o custo mais recente e o preço de venda atual; cada variação fica em sua própria tabela.
ALTER TABLE forma_finance.products ADD COLUMN IF NOT EXISTS sale_price_cents bigint CHECK (sale_price_cents IS NULL OR (sale_price_cents>=0 AND sale_price_cents<=10000000000));
ALTER TABLE forma_finance.products ADD COLUMN IF NOT EXISTS cost_price numeric(20,6) CHECK (cost_price IS NULL OR cost_price>=0);
CREATE TABLE IF NOT EXISTS forma_finance.product_cost_history (
  id uuid PRIMARY KEY,
  product_id uuid NOT NULL REFERENCES forma_finance.products(id),
  entry_id uuid UNIQUE REFERENCES forma_finance.entries(id),
  source varchar(10) NOT NULL CHECK (source IN ('entry','register')),
  unit_cost numeric(20,6) NOT NULL CHECK (unit_cost>=0),
  actor_name varchar(100) NOT NULL DEFAULT coalesce(nullif(current_setting('infinity.actor_name',true),''),''),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS product_cost_history_product ON forma_finance.product_cost_history(product_id,created_at DESC);
CREATE TABLE IF NOT EXISTS forma_finance.product_sale_prices (
  id uuid PRIMARY KEY,
  product_id uuid NOT NULL REFERENCES forma_finance.products(id),
  price_cents bigint NOT NULL CHECK (price_cents>=0 AND price_cents<=10000000000),
  previous_cents bigint,
  actor_name varchar(100) NOT NULL DEFAULT coalesce(nullif(current_setting('infinity.actor_name',true),''),''),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS product_sale_prices_product ON forma_finance.product_sale_prices(product_id,created_at DESC);
-- Entradas anteriores passam a compor o histórico de custo uma única vez.
INSERT INTO forma_finance.product_cost_history(id,product_id,entry_id,source,unit_cost,actor_name,created_at)
SELECT gen_random_uuid(),e.product_id,e.id,'entry',e.unit_cost,'',e.created_at FROM forma_finance.entries e
ON CONFLICT (entry_id) DO NOTHING;
UPDATE forma_finance.products p SET cost_price=l.unit_cost
FROM (SELECT DISTINCT ON (product_id) product_id,unit_cost FROM forma_finance.product_cost_history ORDER BY product_id,created_at DESC,id DESC) l
WHERE l.product_id=p.id AND p.cost_price IS NULL;

-- Venda com carrinho: um pedido reúne os itens (linhas de sales) e quem vendeu.
CREATE TABLE IF NOT EXISTS forma_finance.sale_orders (
  id uuid PRIMARY KEY,
  request_id uuid NOT NULL UNIQUE,
  sold_at date NOT NULL,
  customer varchar(160) NOT NULL DEFAULT '',
  payment_method varchar(10) NOT NULL DEFAULT '' CHECK (payment_method IN ('','pix','cash','card')),
  notes varchar(1000) NOT NULL DEFAULT '',
  summary varchar(200) NOT NULL,
  item_count integer NOT NULL CHECK (item_count>0),
  list_total_cents bigint NOT NULL CHECK (list_total_cents>=0),
  total_cents bigint NOT NULL CHECK (total_cents>=0 AND total_cents<=10000000000),
  seller_id uuid,
  seller_name varchar(100) NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sale_orders_date ON forma_finance.sale_orders(sold_at DESC,created_at DESC);
ALTER TABLE forma_finance.sales ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES forma_finance.sale_orders(id);
ALTER TABLE forma_finance.sales ADD COLUMN IF NOT EXISTS list_price_cents bigint;
ALTER TABLE forma_finance.sales ADD COLUMN IF NOT EXISTS unit_cost numeric(20,6);
CREATE INDEX IF NOT EXISTS sales_order ON forma_finance.sales(order_id);
-- Itens de cortesia podem sair por R$ 0,00.
ALTER TABLE forma_finance.sales DROP CONSTRAINT IF EXISTS sales_total_cents_check;
ALTER TABLE forma_finance.sales ADD CONSTRAINT sales_total_cents_check CHECK (total_cents>=0 AND total_cents<=10000000000);
