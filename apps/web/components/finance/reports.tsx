'use client';
import { useEffect, useState } from 'react';
import { Icon } from '../icons';
import { api, money, qty, shortDate, today } from '../store/lib';
import { Chips, ErrorText } from '../store/ui';
import { periodOptions, periodRange, type Period } from './periods';

type Row = { name: string; count?: number; total: number; quantity?: number; color?: string; method?: string };
type Report = {
  from: string; to: string;
  cash: { opening: number; closing: number; income: number; outgoing: number };
  byKind: Record<string, { total: number; count: number }>;
  sales: { count: number; total: number; discounts: number; credit: number; profit: number; cost: number; itemsWithoutCost: number };
  products: Row[]; sellers: Row[]; payments: Row[]; expenses: Row[]; partners: Row[];
  receivable: { total: number; count: number };
};
const methods: Record<string, string> = { pix: 'Pix', cash: 'Dinheiro', card: 'Cartão', credit: 'Devedor', none: 'Não informado' };

export function Reports() {
  const [period, setPeriod] = useState<Period | 'custom'>('month');
  const [custom, setCustom] = useState(() => periodRange('month'));
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState('');
  const range = period === 'custom' ? custom : periodRange(period);
  useEffect(() => {
    if (range.from > range.to) { setError('A data inicial deve ser anterior à final.'); return; }
    const controller = new AbortController();
    setData(null); setError('');
    api<Report>(`finance/report?from=${range.from}&to=${range.to}`, { signal: controller.signal }).then(setData).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [range.from, range.to]);

  const k = (kind: string) => Math.abs(data?.byKind[kind]?.total ?? 0);
  const adjustments = data?.byKind.adjustment?.total ?? 0;
  const result = data ? data.cash.income - data.cash.outgoing : 0;
  return <>
    <Chips label="Período" value={period} onChange={setPeriod} options={[...periodOptions.filter(([p]) => p !== 'all'), ['custom', 'Escolher']]} />
    {period === 'custom' && <div className="fi-custom"><input type="date" value={custom.from} max={today()} onChange={e => setCustom({ ...custom, from: e.target.value || custom.from })} aria-label="De" /><span>até</span><input type="date" value={custom.to} onChange={e => setCustom({ ...custom, to: e.target.value || custom.to })} aria-label="Até" /></div>}
    <ErrorText>{error}</ErrorText>
    {!data && !error && <p className="st-muted">Carregando…</p>}
    {data && <div className="fi-report">
      <div className="fi-report-head"><span>{data.from === '2000-01-01' ? 'Todo o período' : `${shortDate(data.from)}/${data.from.slice(0, 4)} a ${shortDate(data.to)}/${data.to.slice(0, 4)}`}</span><button className="quiet" onClick={() => window.print()}><Icon name="clipboard" size={16} /> Imprimir</button></div>

      <section className="fi-card fi-card-dark">
        <h3>Resultado do caixa</h3>
        <div className="fi-trio"><div><span>Entrou</span><strong>{money(data.cash.income)}</strong></div><div><span>Saiu</span><strong>{money(data.cash.outgoing)}</strong></div><div><span>Resultado</span><strong className={result < 0 ? 'fi-neg' : ''}>{result < 0 ? '−' : '+'}{money(Math.abs(result))}</strong></div></div>
        <p>Saldo no início {money(data.cash.opening)} · no fim {money(data.cash.closing)}</p>
      </section>

      <section className="fi-card">
        <h3>Vendas</h3>
        <div className="fi-grid">
          <Stat label="Faturamento" value={money(data.sales.total)} />
          <Stat label="Vendas" value={String(data.sales.count)} />
          <Stat label="Ticket médio" value={data.sales.count ? money(Math.round(data.sales.total / data.sales.count)) : '—'} />
          <Stat label="Lucro bruto" value={money(data.sales.profit)} hint={data.sales.itemsWithoutCost ? `${data.sales.itemsWithoutCost} item(ns) sem custo` : 'venda − custo'} />
          <Stat label="Descontos dados" value={money(data.sales.discounts)} />
          <Stat label="Vendido p/ devedores" value={money(data.sales.credit)} hint={`a receber hoje: ${money(data.receivable.total)}`} />
        </div>
      </section>

      <section className="fi-card">
        <h3>Para onde foi o dinheiro</h3>
        <Bars rows={[
          { name: 'Compras de produtos', total: k('purchase') },
          ...data.expenses.map(e => ({ name: `Despesa · ${e.name}`, total: e.total, count: e.count })),
          ...data.partners.map(p => ({ name: `Sócio · ${p.name}`, total: p.total, count: p.count })),
          ...(adjustments < 0 ? [{ name: 'Ajustes (retiradas)', total: -adjustments }] : []),
        ].filter(r => r.total > 0)} empty="Nenhuma saída no período." />
      </section>

      <section className="fi-card">
        <h3>Mais vendidos</h3>
        <Bars rows={data.products.map(p => ({ name: `${p.name}${p.color ? ' · ' + p.color : ''}`, total: p.total, sub: `${qty(p.quantity ?? 0)} un.` }))} empty="Nenhuma venda no período." />
      </section>

      <div className="fi-two-cards">
        <section className="fi-card"><h3>Por vendedor</h3><Bars rows={data.sellers.map(s => ({ name: s.name, total: s.total, count: s.count }))} empty="—" /></section>
        <section className="fi-card"><h3>Por pagamento</h3><Bars rows={data.payments.map(p => ({ name: methods[p.method ?? 'none'] ?? p.method ?? '', total: p.total, count: p.count }))} empty="—" /></section>
      </div>
    </div>}
  </>;
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return <div className="fi-stat"><span>{label}</span><strong>{value}</strong>{hint && <small>{hint}</small>}</div>;
}
function Bars({ rows, empty }: { rows: { name: string; total: number; count?: number; sub?: string }[]; empty: string }) {
  if (!rows.length) return <p className="st-muted">{empty}</p>;
  const max = Math.max(...rows.map(r => r.total), 1);
  return <ul className="fi-bars">{rows.map((r, i) => <li key={i}>
    <div><span>{r.name}</span><strong>{money(r.total)}</strong></div>
    <i style={{ width: `${Math.max(2, (r.total / max) * 100)}%` }} />
    {(r.sub || r.count !== undefined) && <small>{r.sub ?? `${r.count} ${r.count === 1 ? 'registro' : 'registros'}`}</small>}
  </li>)}</ul>;
}
