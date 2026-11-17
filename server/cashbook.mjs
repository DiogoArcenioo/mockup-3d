import { randomUUID } from 'node:crypto';
import { ValidationError, dateInput, textField, uuid } from './finance.mjs';

export function cashInput(body={}) {
  if(!body||typeof body!=='object'||Array.isArray(body))throw new ValidationError('Lançamento inválido.');
  if(!['expense','partner_payment','income','adjustment'].includes(body.kind))throw new ValidationError('Selecione o tipo de lançamento.');
  if(!Number.isSafeInteger(body.amountCents)||body.amountCents===0||Math.abs(body.amountCents)>10000000000)throw new ValidationError('Informe um valor válido, diferente de zero.');
  if((['expense','partner_payment'].includes(body.kind)&&body.amountCents>0)||(body.kind==='income'&&body.amountCents<0))throw new ValidationError('O valor não corresponde ao tipo de lançamento.');
  return {requestId:uuid(body.requestId),kind:body.kind,occurredAt:dateInput(body.occurredAt),amountCents:body.amountCents,
    description:body.kind==='partner_payment'?'Pagamento de sócio':textField(body.description,'Descrição',160,true),notes:textField(body.notes,'Observação',1000),
    recipientId:body.kind==='partner_payment'?uuid(body.recipientId):null};
}
function period(query) {
  const from=dateInput(query.from??'2000-01-01'),to=dateInput(query.to??'2100-12-31');
  if(from>to)throw new ValidationError('A data inicial deve ser anterior à final.');
  const page=Number(query.page??1);
  if(!Number.isInteger(page)||page<1||page>100000)throw new ValidationError('Página inválida.');
  return {from,to,page};
}
export function registerCashbook(app,pool) {
  app.get('/api/finance/users',async(_req,res)=>res.json({users:(await pool.query('SELECT id,name,login FROM forma_auth.users WHERE active=true ORDER BY lower(name),id')).rows}));
  app.post('/api/finance/transactions',async(req,res)=>{
    const input=cashInput(req.body),client=await pool.connect();
    try{
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[input.requestId]);
      const previous=(await client.query('SELECT *,occurred_at::text AS date_text FROM forma_finance.cash_transactions WHERE request_id=$1',[input.requestId])).rows[0];
      if(previous){
        const same=previous.kind===input.kind&&previous.date_text===input.occurredAt&&Number(previous.amount_cents)===input.amountCents&&previous.description===input.description&&previous.notes===input.notes&&previous.recipient_id===input.recipientId;
        if(!same)throw new ValidationError('Este lançamento já foi registrado com outros dados. Abra um novo lançamento.',409);
        await client.query('COMMIT');return res.json({id:previous.id,repeated:true});
      }
      let name=null;
      if(input.recipientId){const user=(await client.query('SELECT name FROM forma_auth.users WHERE id=$1 AND active=true FOR SHARE',[input.recipientId])).rows[0];if(!user)throw new ValidationError('Selecione um usuário ativo.');name=user.name;}
      const id=randomUUID();
      await client.query(`INSERT INTO forma_finance.cash_transactions(id,request_id,kind,occurred_at,amount_cents,description,notes,recipient_id,recipient_name) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[id,input.requestId,input.kind,input.occurredAt,input.amountCents,input.description,input.notes,input.recipientId,name]);
      await client.query('COMMIT');res.status(201).json({id});
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  });
  app.get('/api/finance/statement',async(req,res)=>{
    const {from,to,page}=period(req.query),kind=req.query.kind||null;
    if(kind&&!['purchase','sale','expense','partner_payment','income','adjustment'].includes(kind))throw new ValidationError('Tipo inválido.');
    // One statement snapshot keeps totals and running balances consistent during concurrent writes.
    const {rows:[result]}=await pool.query(`WITH ledger AS (
      SELECT b.*,sum(amount_cents) OVER(ORDER BY occurred_at,created_at,id ROWS UNBOUNDED PRECEDING) balance_cents FROM forma_finance.cashbook b
    ), selected AS (SELECT * FROM ledger WHERE occurred_at BETWEEN $1::date AND $2::date AND ($3::text IS NULL OR kind=$3)),
    totals AS (SELECT coalesce(sum(amount_cents) FILTER(WHERE occurred_at<$1::date),0) opening,
      coalesce(sum(amount_cents) FILTER(WHERE occurred_at<=$2::date),0) closing,
      coalesce(sum(amount_cents) FILTER(WHERE occurred_at BETWEEN $1::date AND $2::date AND amount_cents>0),0) income,
      coalesce(-sum(amount_cents) FILTER(WHERE occurred_at BETWEEN $1::date AND $2::date AND amount_cents<0),0) outgoing,
      coalesce(sum(amount_cents) FILTER(WHERE occurred_at<=(now() AT TIME ZONE 'America/Sao_Paulo')::date),0) current FROM ledger),
    page_rows AS (SELECT s.*,coalesce(a.actor_name,'Registro anterior / responsável não informado') actor_name FROM selected s
      LEFT JOIN LATERAL(SELECT actor_name FROM forma_finance.activity_log WHERE entity_id=s.id AND entity IN ('entries','sales','cash_transactions','sale_orders') AND operation='INSERT' ORDER BY id LIMIT 1) a ON true
      ORDER BY occurred_at DESC,created_at DESC,id DESC LIMIT 20 OFFSET $4)
    SELECT (SELECT row_to_json(totals) FROM totals) totals,(SELECT count(*) FROM selected) count,
      coalesce((SELECT jsonb_agg(to_jsonb(p)||jsonb_build_object('occurred_at',p.occurred_at::text) ORDER BY p.occurred_at DESC,p.created_at DESC,p.id DESC) FROM page_rows p),'[]') items,
      coalesce((SELECT jsonb_agg(g) FROM (SELECT kind,sum(amount_cents)::text amount_cents,count(*) count FROM ledger WHERE occurred_at BETWEEN $1::date AND $2::date GROUP BY kind) g),'[]') breakdown`,[from,to,kind,(page-1)*20]);
    res.json({...result,totals:Object.fromEntries(Object.entries(result.totals).map(([k,v])=>[k,Number(v)])),count:Number(result.count),page,pages:Math.ceil(Number(result.count)/20),from,to});
  });
  app.get('/api/finance/activity',async(req,res)=>{
    const {from,to,page}=period(req.query);
    const {rows:[result]}=await pool.query(`WITH selected AS(SELECT * FROM forma_finance.activity_log WHERE (created_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $1::date AND $2::date),
      page_rows AS(SELECT * FROM selected ORDER BY created_at DESC,id DESC LIMIT 20 OFFSET $3)
      SELECT (SELECT count(*) FROM selected) count,coalesce((SELECT jsonb_agg(p ORDER BY p.id DESC) FROM page_rows p),'[]') items`,[from,to,(page-1)*20]);
    res.json({...result,count:Number(result.count),page,pages:Math.ceil(Number(result.count)/20)});
  });
}
