import { randomUUID } from 'node:crypto';
import { ValidationError, dateInput, debtorInput, uuid } from './finance.mjs';
import { actors } from './actor-pool.mjs';

const todaySP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const mapDebtor = d => ({ id: d.id, name: d.name, items: d.items, totalCents: Number(d.total_cents), owedAt: d.owed_at, fromSale: Boolean(d.order_id), notes: d.notes, createdBy: d.created_by_name, status: d.status, paidAt: d.paid_at, paidBy: d.paid_by_name, createdAt: d.created_at });
const debtorSelect = 'SELECT *,owed_at::text owed_at,paid_at::text paid_at FROM forma_finance.debtors';

function range(query) {
  const from = dateInput(query.from ?? '2000-01-01'), to = dateInput(query.to ?? '2100-12-31');
  if (from > to) throw new ValidationError('A data inicial deve ser anterior à final.');
  return { from, to };
}

export function registerMoney(app, pool) {
  // ---------- Devedores ----------
  app.get('/api/finance/debtors', async (req, res) => {
    const status = req.query.status === 'paid' ? 'paid' : 'open';
    const { rows } = await pool.query(debtorSelect + ` WHERE status=$1 ORDER BY ${status === 'paid' ? 'debtors.paid_at DESC,debtors.paid_registered_at DESC' : 'debtors.owed_at ASC,debtors.created_at ASC'} LIMIT 300`, [status]);
    const { rows: [open] } = await pool.query("SELECT coalesce(sum(total_cents),0) total,count(*) count FROM forma_finance.debtors WHERE status='open'");
    res.json({ debtors: rows.map(mapDebtor), openCents: Number(open.total), openCount: Number(open.count) });
  });
  app.post('/api/finance/debtors', async (req, res) => {
    const d = debtorInput(req.body), client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [d.requestId]);
      const previous = (await client.query(debtorSelect + ' WHERE request_id=$1', [d.requestId])).rows[0];
      if (previous) {
        if (previous.name !== d.name || Number(previous.total_cents) !== d.totalCents) throw new ValidationError('Este devedor já foi registrado com outros dados.', 409);
        await client.query('COMMIT'); return res.json({ debtor: mapDebtor(previous), repeated: true });
      }
      const { rows: [row] } = await client.query('INSERT INTO forma_finance.debtors(id,request_id,name,items,total_cents,owed_at,notes) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *,owed_at::text owed_at,paid_at::text paid_at',
        [randomUUID(), d.requestId, d.name, d.items, d.totalCents, d.owedAt, d.notes]);
      await client.query('COMMIT'); res.status(201).json({ debtor: mapDebtor(row) });
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  });
  // Recebimento: o valor entra no caixa na data informada. Repetir não duplica.
  app.post('/api/finance/debtors/:id/pay', async (req, res) => {
    const id = uuid(req.params.id), paidAt = dateInput(req.body?.paidAt ?? todaySP(), 'Data do pagamento');
    const actor = actors.getStore(), client = await pool.connect();
    try {
      await client.query('BEGIN');
      const current = (await client.query('SELECT status FROM forma_finance.debtors WHERE id=$1 FOR UPDATE', [id])).rows[0];
      if (!current) throw new ValidationError('Devedor não encontrado.', 404);
      if (current.status === 'cancelled') throw new ValidationError('Este registro foi removido.', 409);
      if (current.status === 'open') await client.query("UPDATE forma_finance.debtors SET status='paid',paid_at=$2,paid_by_name=$3,paid_registered_at=now() WHERE id=$1", [id, paidAt, actor?.name ?? '']);
      const row = (await client.query(debtorSelect + ' WHERE id=$1', [id])).rows[0];
      await client.query('COMMIT'); res.json({ debtor: mapDebtor(row) });
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  });
  // Só devedores lançados à mão e ainda em aberto podem ser removidos (os de venda mexeram no estoque).
  app.post('/api/finance/debtors/:id/cancel', async (req, res) => {
    const id = uuid(req.params.id), client = await pool.connect();
    try {
      await client.query('BEGIN');
      const current = (await client.query('SELECT status,order_id FROM forma_finance.debtors WHERE id=$1 FOR UPDATE', [id])).rows[0];
      if (!current) throw new ValidationError('Devedor não encontrado.', 404);
      if (current.order_id) throw new ValidationError('Devedor de venda não pode ser removido.', 409);
      if (current.status === 'paid') throw new ValidationError('Este devedor já pagou.', 409);
      if (current.status === 'open') await client.query("UPDATE forma_finance.debtors SET status='cancelled' WHERE id=$1", [id]);
      await client.query('COMMIT'); res.json({ ok: true });
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  });

  // ---------- Relatório por período ----------
  app.get('/api/finance/report', async (req, res) => {
    const { from, to } = range(req.query), p = [from, to];
    const one = async (sql, params = p) => (await pool.query(sql, params)).rows;
    const [balance] = await one(`SELECT coalesce(sum(amount_cents) FILTER(WHERE occurred_at<$1::date),0) opening,coalesce(sum(amount_cents) FILTER(WHERE occurred_at<=$2::date),0) closing,
      coalesce(sum(amount_cents) FILTER(WHERE occurred_at BETWEEN $1::date AND $2::date AND amount_cents>0),0) income,
      coalesce(-sum(amount_cents) FILTER(WHERE occurred_at BETWEEN $1::date AND $2::date AND amount_cents<0),0) outgoing FROM forma_finance.cashbook`);
    const byKind = await one(`SELECT kind,sum(amount_cents) total,count(*) count FROM forma_finance.cashbook WHERE occurred_at BETWEEN $1::date AND $2::date GROUP BY kind`);
    const [sales] = await one(`WITH o AS (SELECT total_cents,list_total_cents,on_credit FROM forma_finance.sale_orders WHERE sold_at BETWEEN $1::date AND $2::date
        UNION ALL SELECT total_cents,total_cents,false FROM forma_finance.sales WHERE order_id IS NULL AND sold_at BETWEEN $1::date AND $2::date)
      SELECT count(*) count,coalesce(sum(total_cents),0) total,coalesce(sum(greatest(list_total_cents-total_cents,0)),0) discounts,coalesce(sum(total_cents) FILTER(WHERE on_credit),0) credit FROM o`);
    const [profit] = await one(`SELECT coalesce(sum(total_cents-round(unit_cost*quantity*100)) FILTER(WHERE unit_cost IS NOT NULL),0) profit,count(*) FILTER(WHERE unit_cost IS NULL) without_cost,
      coalesce(sum(round(unit_cost*quantity*100)) FILTER(WHERE unit_cost IS NOT NULL),0) cost FROM forma_finance.sales WHERE sold_at BETWEEN $1::date AND $2::date`);
    const products = await one(`SELECT product_name name,product_color color,sum(quantity) quantity,sum(total_cents) total FROM forma_finance.sales WHERE sold_at BETWEEN $1::date AND $2::date GROUP BY 1,2 ORDER BY 4 DESC,3 DESC LIMIT 8`);
    const sellers = await one(`SELECT coalesce(nullif(seller_name,''),'Não informado') name,count(*) count,sum(total_cents) total FROM forma_finance.sale_orders WHERE sold_at BETWEEN $1::date AND $2::date GROUP BY 1 ORDER BY 3 DESC`);
    const payments = await one(`SELECT CASE WHEN on_credit THEN 'credit' WHEN payment_method='' THEN 'none' ELSE payment_method END method,count(*) count,sum(total_cents) total FROM forma_finance.sale_orders WHERE sold_at BETWEEN $1::date AND $2::date GROUP BY 1 ORDER BY 3 DESC`);
    const expenses = await one(`SELECT coalesce(nullif(category,''),'Outros') name,count(*) count,sum(-amount_cents) total FROM forma_finance.cash_transactions WHERE kind='expense' AND occurred_at BETWEEN $1::date AND $2::date GROUP BY 1 ORDER BY 3 DESC`);
    const partners = await one(`SELECT recipient_name name,count(*) count,sum(-amount_cents) total FROM forma_finance.cash_transactions WHERE kind='partner_payment' AND occurred_at BETWEEN $1::date AND $2::date GROUP BY 1 ORDER BY 3 DESC`);
    const [receivable] = await one("SELECT coalesce(sum(total_cents),0) total,count(*) count FROM forma_finance.debtors WHERE status='open'", []);
    const n = v => Number(v);
    const rows = list => list.map(r => ({ ...r, count: r.count === undefined ? undefined : n(r.count), total: n(r.total), quantity: r.quantity === undefined ? undefined : n(r.quantity) }));
    res.json({
      from, to,
      cash: { opening: n(balance.opening), closing: n(balance.closing), income: n(balance.income), outgoing: n(balance.outgoing) },
      byKind: Object.fromEntries(byKind.map(r => [r.kind, { total: n(r.total), count: n(r.count) }])),
      sales: { count: n(sales.count), total: n(sales.total), discounts: n(sales.discounts), credit: n(sales.credit), profit: n(profit.profit), cost: n(profit.cost), itemsWithoutCost: n(profit.without_cost) },
      products: rows(products), sellers: rows(sellers), payments: rows(payments), expenses: rows(expenses), partners: rows(partners),
      receivable: { total: n(receivable.total), count: n(receivable.count) },
    });
  });

  // ---------- Log do sistema ----------
  app.get('/api/finance/log', async (req, res) => {
    const days = Math.min(31, Math.max(1, Number.parseInt(req.query.days ?? '7', 10) || 7));
    const { rows } = await pool.query(`SELECT l.id,l.entity,l.operation,l.actor_name,l.created_at,l.before_data,l.after_data,l.op_id,pn.name product_name
      FROM forma_finance.activity_log l
      LEFT JOIN forma_finance.products pn ON l.entity IN ('product_sale_prices','stock_movements','product_photos','product_cost_history') AND pn.id=(coalesce(l.after_data,l.before_data)->>'product_id')::uuid
      WHERE l.created_at >= now() - ($1::int * interval '1 day')
      ORDER BY l.created_at DESC,l.id DESC LIMIT 4000`, [days]);
    const groups = new Map();
    for (const row of rows) {
      const key = row.op_id || 'row-' + row.id;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }
    const events = [];
    for (const [key, group] of groups) {
      const event = describeGroup(group);
      if (event) events.push({ id: key, at: group[0].created_at, actor: group[0].actor_name, ...event });
    }
    res.json({ days, events });
  });
}

// Prioridade: o evento "principal" de cada operação.
const PRIORITY = ['sale_orders', 'sales', 'entries', 'cash_transactions', 'debtors', 'products:INSERT', 'product_sale_prices', 'stock_movements', 'products', 'product_photos', 'product_colors', 'product_brands', 'users'];
const IGNORED_PRODUCT_FIELDS = ['updated_at', 'sale_price_cents', 'cost_price'];
const kindLabels = { expense: 'Despesa', partner_payment: 'Pagamento de sócio', income: 'Entrada de dinheiro' };
const qty = v => Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 3 });

function describeGroup(group) {
  for (const target of PRIORITY) {
    const [entity, op] = target.split(':');
    for (const row of group) {
      if (row.entity !== entity || (op && row.operation !== op)) continue;
      const event = describe(row);
      if (event) return event;
    }
  }
  return null;
}

function describe(r) {
  const d = r.after_data || r.before_data || {}, b = r.before_data || {}, op = r.operation;
  switch (r.entity) {
    case 'sale_orders': return op === 'INSERT' ? { type: 'sale', title: d.on_credit ? 'Venda para devedor' : 'Venda', detail: `${d.customer} · ${d.summary}`, amountCents: Number(d.total_cents), pending: Boolean(d.on_credit) } : null;
    case 'sales': return op === 'INSERT' && !d.order_id ? { type: 'sale', title: 'Venda', detail: `${d.customer ? d.customer + ' · ' : ''}${d.product_name}`, amountCents: Number(d.total_cents) } : null;
    case 'entries': return op === 'INSERT' ? { type: 'stock', title: 'Compra de produto', detail: `${d.product_name} · +${qty(d.quantity ?? d.package_count * d.units_per_package)}`, amountCents: -Number(d.total_cents) } : null;
    case 'cash_transactions': {
      if (op !== 'INSERT') return null;
      const amount = Number(d.amount_cents);
      if (d.kind === 'adjustment') return { type: 'money', title: amount > 0 ? 'Saldo adicionado' : 'Saldo removido', detail: d.description, amountCents: amount };
      const detail = d.kind === 'partner_payment' ? d.recipient_name : `${d.description}${d.category ? ' · ' + d.category : ''}`;
      return { type: 'money', title: kindLabels[d.kind] || 'Lançamento', detail, amountCents: amount };
    }
    case 'debtors': {
      if (op === 'INSERT') return { type: 'money', title: 'Devedor cadastrado', detail: d.name, amountCents: Number(d.total_cents), pending: true };
      if (op === 'UPDATE' && b.status === 'open' && d.status === 'paid') return { type: 'money', title: 'Devedor pagou', detail: d.name, amountCents: Number(d.total_cents) };
      if (op === 'UPDATE' && d.status === 'cancelled') return { type: 'money', title: 'Devedor removido', detail: d.name };
      return null;
    }
    case 'products': {
      if (op === 'INSERT') return { type: 'product', title: 'Produto cadastrado', detail: d.name };
      if (op === 'UPDATE') {
        const changed = Object.keys(d).some(k => !IGNORED_PRODUCT_FIELDS.includes(k) && JSON.stringify(d[k]) !== JSON.stringify(b[k]));
        return changed ? { type: 'product', title: 'Produto editado', detail: d.name } : null;
      }
      return op === 'DELETE' ? { type: 'product', title: 'Produto excluído', detail: b.name } : null;
    }
    case 'product_sale_prices':
      return op === 'INSERT' && d.previous_cents != null ? { type: 'product', title: 'Preço alterado', detail: `${r.product_name || 'Produto'}: ${brl(d.previous_cents)} → ${brl(d.price_cents)}` } : null;
    case 'stock_movements':
      return op === 'INSERT' && d.kind === 'adjustment' ? { type: 'stock', title: 'Estoque ajustado', detail: `${r.product_name || 'Produto'} · ${Number(d.quantity) > 0 ? '+' : ''}${qty(d.quantity)}` } : null;
    case 'product_photos': return { type: 'product', title: op === 'DELETE' ? 'Foto removida' : 'Foto atualizada', detail: r.product_name || '' };
    case 'product_colors': return op === 'INSERT' ? { type: 'product', title: 'Cor cadastrada', detail: d.name } : null;
    case 'product_brands': return op === 'INSERT' ? { type: 'product', title: 'Marca cadastrada', detail: d.name } : null;
    case 'users':
      if (op === 'INSERT') return { type: 'user', title: 'Usuário criado', detail: d.name };
      if (op === 'PASSWORD') return { type: 'user', title: 'Senha alterada', detail: d.name };
      return op === 'UPDATE' ? { type: 'user', title: 'Usuário alterado', detail: d.name } : null;
    default: return null;
  }
}
const brl = cents => (Number(cents) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
