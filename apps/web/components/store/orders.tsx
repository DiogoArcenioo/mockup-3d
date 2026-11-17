'use client';
import { useEffect, useState } from 'react';
import { Icon } from '../icons';
import { api, money, qty, today, shiftDate, shortDate, time, payments, type OrdersPage } from './lib';
import { Chips, ErrorText } from './ui';

type Period = 'today' | 'week' | 'month' | 'all';
const ranges = (p: Period) => {
  const t = today();
  return p === 'today' ? { from: t, to: t } : p === 'week' ? { from: shiftDate(t, -6), to: t } : p === 'month' ? { from: t.slice(0, 8) + '01', to: t } : { from: '2000-01-01', to: '2100-12-31' };
};

export function OrdersView({ refresh }: { refresh: number }) {
  const [period, setPeriod] = useState<Period>('today');
  const [data, setData] = useState<OrdersPage | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  const select = (p: Period) => { setPeriod(p); setPage(1); setData(null); setOpen(null); };
  useEffect(() => { setPage(1); }, [refresh]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    const { from, to } = ranges(period);
    api<OrdersPage>(`orders?from=${from}&to=${to}&page=${page}`, { signal: controller.signal })
      .then(d => setData(prev => page > 1 && prev ? { ...d, orders: [...prev.orders, ...d.orders] } : d))
      .catch(e => { if (!controller.signal.aborted) setError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [period, page, refresh]);

  return <>
    <Chips label="Período" value={period} onChange={select} options={[['today', 'Hoje'], ['week', '7 dias'], ['month', 'Mês'], ['all', 'Tudo']]} />
    <div className="st-stats st-stats-orders">
      <div className="st-stat-dark"><span>Vendido</span><strong>{data ? money(data.totalCents) : '—'}</strong></div>
      <div><span>Vendas</span><strong>{data ? data.count : '—'}</strong></div>
      <div><span>Lucro estimado</span><strong className={data && data.profitCents < 0 ? 'st-neg' : ''}>{data ? money(data.profitCents) : '—'}</strong>{data && data.itemsWithoutCost > 0 && <small>{data.itemsWithoutCost} item(ns) sem custo</small>}</div>
    </div>
    <ErrorText>{error}</ErrorText>
    {data && data.orders.length > 0 ? <div className="st-list">
      {data.orders.map(o => {
        const items = o.items.reduce((s, i) => s + i.quantity, 0), discount = o.listTotalCents - o.totalCents, expanded = open === o.id;
        return <div key={o.id} className={`st-order${expanded ? ' st-order-open' : ''}`}>
          <button className="st-row" onClick={() => setOpen(expanded ? null : o.id)} aria-expanded={expanded}>
            <span className="st-order-icon"><Icon name="cart" size={18} /></span>
            <span className="st-row-info"><strong>{o.customer || 'Cliente não informado'}</strong><small>{qty(items)} {items === 1 ? 'item' : 'itens'}{o.sellerName ? ' · ' + o.sellerName.split(' ')[0] : ''}{o.paymentMethod ? ' · ' + payments[o.paymentMethod] : ''}</small></span>
            <span className="st-row-stock"><strong>{money(o.totalCents)}</strong><small>{period === 'today' ? time(o.createdAt) : shortDate(o.soldAt)}</small></span>
          </button>
          {expanded && <div className="st-order-items">
            {o.items.map((i, n) => <div key={n}><span>{qty(i.quantity)}× {i.name}{i.color ? ` · ${i.color}` : ''}</span><span>{money(i.totalCents)}</span></div>)}
            {discount > 0 && <div className="st-discount"><span>Desconto</span><span>−{money(discount)}</span></div>}
            {o.sellerName && <div className="st-muted"><span>Vendido por {o.sellerName}</span><span>{shortDate(o.soldAt)}</span></div>}
          </div>}
        </div>;
      })}
    </div> : !loading && !error && <div className="st-empty"><Icon name="cart" size={30} /><p>Nenhuma venda {period === 'today' ? 'hoje' : 'no período'}.</p></div>}
    {loading && <p className="st-muted">Carregando…</p>}
    {data && !loading && page < data.pages && <button className="quiet st-block" onClick={() => setPage(page + 1)}>Ver mais</button>}
  </>;
}
