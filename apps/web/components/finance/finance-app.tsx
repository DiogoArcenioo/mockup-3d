'use client';
import { useCallback, useEffect, useState } from 'react';
import { Icon } from '../icons';
import { api, json, money, shortDate, stamp } from '../store/lib';
import { periodOptions, periodRange, type Period } from './periods';
import { Chips, ErrorText, Sheet } from '../store/ui';
import { AdjustSheet, DebtorSheet, ExpenseSheet, PartnerSheet, PaySheet } from './forms';
import { Reports } from './reports';
import '../store/store.css';
import './finance.css';

type Tab = 'extrato' | 'devedores' | 'relatorios';
type Kind = 'sale' | 'purchase' | 'partner_payment' | 'expense' | 'income' | 'adjustment' | 'debt_payment';
type Item = { id: string; kind: Kind; occurred_at: string; amount_cents: number | string; balance_cents: number | string; description: string; counterparty: string; notes: string; created_at: string; actor_name: string; category: string | null };
type Statement = { items: Item[]; totals: { opening: number; closing: number; income: number; outgoing: number; current: number }; count: number; page: number; pages: number };
type Debtor = { id: string; name: string; items: string; totalCents: number; owedAt: string; fromSale: boolean; createdBy: string; status: string; paidAt: string | null; paidBy: string | null };
type Modal = 'expense' | 'partner' | 'adjust' | 'debtor' | null;

export const kindInfo: Record<Kind, { label: string; icon: string }> = {
  sale: { label: 'Venda', icon: 'cart' }, purchase: { label: 'Compra', icon: 'box' }, partner_payment: { label: 'Sócio', icon: 'users' },
  expense: { label: 'Despesa', icon: 'wallet' }, income: { label: 'Entrada', icon: 'plus' }, adjustment: { label: 'Ajuste', icon: 'tag' }, debt_payment: { label: 'Recebimento', icon: 'check' },
};

export function FinanceApp({ initialTab }: { initialTab: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [modal, setModal] = useState<Modal>(null);
  const [version, setVersion] = useState(0);
  const [summary, setSummary] = useState<Statement['totals'] | null>(null);
  const [open, setOpen] = useState<{ cents: number; count: number } | null>(null);
  const refresh = useCallback(() => setVersion(v => v + 1), []);
  useEffect(() => {
    const { from, to } = periodRange('month');
    api<Statement>(`finance/statement?from=${from}&to=${to}`).then(s => setSummary(s.totals)).catch(() => {});
    api<{ openCents: number; openCount: number }>('finance/debtors').then(d => setOpen({ cents: d.openCents, count: d.openCount })).catch(() => {});
  }, [version]);
  function select(next: Tab) { setTab(next); try { history.replaceState(null, '', `/financeiro?aba=${next}`); } catch { /* ignore */ } }

  return <main className="app-content st-page fi-page">
    <section className="fi-balance">
      <span>Saldo em caixa</span>
      <strong className={summary && summary.current < 0 ? 'fi-neg' : ''}>{summary ? money(summary.current) : '—'}</strong>
      <div><small>Este mês</small><b className="fi-in">+{summary ? money(summary.income) : '—'}</b><b className="fi-out">−{summary ? money(summary.outgoing) : '—'}</b></div>
    </section>
    <div className="fi-actions">
      <button className="fi-main-action" onClick={() => setModal('expense')}><Icon name="minus" size={22} /><span>Nova despesa</span></button>
      <button onClick={() => setModal('partner')}><Icon name="users" size={20} /><span>Pagar sócio</span></button>
      <button onClick={() => setModal('adjust')}><Icon name="tag" size={20} /><span>Ajustar saldo</span></button>
    </div>
    <nav className="st-tabs" aria-label="Financeiro">
      <button aria-pressed={tab === 'extrato'} onClick={() => select('extrato')}><Icon name="history" size={18} /><span>Extrato</span></button>
      <button aria-pressed={tab === 'devedores'} onClick={() => select('devedores')}><Icon name="user" size={18} /><span>Devedores</span>{open && open.count > 0 && <b>{open.count}</b>}</button>
      <button aria-pressed={tab === 'relatorios'} onClick={() => select('relatorios')}><Icon name="trend" size={18} /><span>Relatórios</span></button>
    </nav>
    {tab === 'extrato' && <StatementView version={version} />}
    {tab === 'devedores' && <DebtorsView version={version} refresh={refresh} onNew={() => setModal('debtor')} />}
    {tab === 'relatorios' && <Reports />}
    {modal === 'expense' && <ExpenseSheet onClose={() => setModal(null)} onSaved={refresh} />}
    {modal === 'partner' && <PartnerSheet onClose={() => setModal(null)} onSaved={refresh} />}
    {modal === 'adjust' && <AdjustSheet onClose={() => setModal(null)} onSaved={refresh} />}
    {modal === 'debtor' && <DebtorSheet onClose={() => setModal(null)} onSaved={refresh} />}
  </main>;
}

type KindFilter = '' | 'in' | 'expense' | 'purchase' | 'partner_payment' | 'adjustment';
function StatementView({ version }: { version: number }) {
  const [period, setPeriod] = useState<Period>('month');
  const [kind, setKind] = useState<KindFilter>('');
  return <>
    <Chips label="Período" value={period} onChange={setPeriod} options={periodOptions} />
    <Chips label="Tipo" value={kind} onChange={setKind} options={[['', 'Tudo'], ['in', 'Entradas'], ['expense', 'Despesas'], ['purchase', 'Compras'], ['partner_payment', 'Sócios'], ['adjustment', 'Ajustes']]} />
    <StatementList key={`${period}-${kind}-${version}`} period={period} kind={kind} />
  </>;
}

function StatementList({ period, kind }: { period: Period; kind: KindFilter }) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Statement | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController(), { from, to } = periodRange(period);
    // "Entradas" junta vendas e recebimentos; os demais filtros usam o tipo direto da API.
    const kinds = kind === 'in' ? ['sale', 'debt_payment', 'income'] : kind ? [kind] : [''];
    setLoading(true); setError('');
    Promise.all(kinds.map(k => api<Statement>(`finance/statement?from=${from}&to=${to}&page=${page}${k ? '&kind=' + k : ''}`, { signal: controller.signal })))
      .then(results => {
        const merged = results.length === 1 ? results[0] : { ...results[0], items: results.flatMap(r => r.items).sort((a, b) => b.occurred_at.localeCompare(a.occurred_at) || b.created_at.localeCompare(a.created_at)), count: results.reduce((s, r) => s + r.count, 0), pages: Math.max(...results.map(r => r.pages)) };
        setData(prev => page > 1 && prev ? { ...merged, items: [...prev.items, ...merged.items] } : merged);
      })
      .catch(e => { if (!controller.signal.aborted) setError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [period, kind, page]);
  return <>
    {data && <div className="fi-period"><div><span>Entrou</span><strong className="fi-in">{money(data.totals.income)}</strong></div><div><span>Saiu</span><strong className="fi-out">{money(data.totals.outgoing)}</strong></div><div><span>Saldo no fim</span><strong>{money(data.totals.closing)}</strong></div></div>}
    <ErrorText>{error}</ErrorText>
    {data && data.items.length > 0 ? <div className="st-list">
      {data.items.map(item => {
        const amount = Number(item.amount_cents), out = amount < 0, info = kindInfo[item.kind] ?? kindInfo.adjustment, expanded = openId === item.id;
        return <div key={item.id} className="st-order">
          <button className="st-row" onClick={() => setOpenId(expanded ? null : item.id)} aria-expanded={expanded}>
            <span className={`st-order-icon ${out ? 'fi-icon-out' : 'fi-icon-in'}`}><Icon name={info.icon} size={17} /></span>
            <span className="st-row-info"><strong>{item.description}</strong><small>{shortDate(item.occurred_at)} · {info.label}{item.category ? ' · ' + item.category : ''}</small></span>
            <span className="st-row-stock"><strong className={out ? 'fi-out' : 'fi-in'}>{out ? '−' : '+'}{money(Math.abs(amount))}</strong></span>
          </button>
          {expanded && <div className="st-order-items">
            <div><span>Registrado por</span><span>{item.actor_name}</span></div>
            <div><span>Em</span><span>{stamp(item.created_at)}</span></div>
            {item.counterparty && <div><span>{item.kind === 'purchase' ? 'Fornecedor' : item.kind === 'partner_payment' ? 'Sócio' : 'Cliente'}</span><span>{item.counterparty}</span></div>}
            {item.notes && <div><span>Obs.</span><span>{item.notes}</span></div>}
            <div className="st-muted"><span>Saldo após</span><span>{money(Number(item.balance_cents))}</span></div>
          </div>}
        </div>;
      })}
    </div> : !loading && !error && <div className="st-empty"><Icon name="wallet" size={30} /><p>Nada no período.</p></div>}
    {loading && <p className="st-muted">Carregando…</p>}
    {data && !loading && page < data.pages && <button className="quiet st-block" onClick={() => setPage(page + 1)}>Ver mais</button>}
  </>;
}

function DebtorsView({ version, refresh, onNew }: { version: number; refresh: () => void; onNew: () => void }) {
  const [status, setStatus] = useState<'open' | 'paid'>('open');
  const [data, setData] = useState<{ debtors: Debtor[]; openCents: number; openCount: number } | null>(null);
  const [error, setError] = useState('');
  const [paying, setPaying] = useState<Debtor | null>(null);
  const [removing, setRemoving] = useState<Debtor | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  useEffect(() => { setData(null); api<typeof data & object>(`finance/debtors?status=${status}`).then(setData).catch(e => setError(e.message)); }, [status, version]);
  return <>
    <div className="fi-receivable"><div><span>A receber</span><strong>{data ? money(data.openCents) : '—'}</strong><small>{data ? `${data.openCount} ${data.openCount === 1 ? 'devedor' : 'devedores'}` : ' '}</small></div><button className="primary" onClick={onNew}><Icon name="plus" size={18} /> Devedor</button></div>
    <Chips label="Situação" value={status} onChange={setStatus} options={[['open', 'Em aberto'], ['paid', 'Pagos']]} />
    <ErrorText>{error}</ErrorText>
    {!data && !error && <p className="st-muted">Carregando…</p>}
    {data && (data.debtors.length ? <div className="fi-debtors">
      {data.debtors.map(d => {
        const lines = d.items.split('\n').filter(Boolean), long = lines.length > 2 || d.items.length > 90, more = expanded[d.id];
        return <article key={d.id} className="fi-debtor">
          <div className="fi-debtor-top"><div><strong>{d.name}</strong><small>{status === 'paid' ? `Pago em ${shortDate(d.paidAt!)}${d.paidBy ? ' · ' + d.paidBy : ''}` : `Desde ${shortDate(d.owedAt)}`}{d.fromSale && <span className="st-badge">Venda</span>}</small></div><b>{money(d.totalCents)}</b></div>
          {d.items && <div className={`fi-debtor-items${long && !more ? ' fi-clamp' : ''}`}>{lines.map((l, i) => <span key={i}>{l}</span>)}</div>}
          {long && <button className="st-link" onClick={() => setExpanded({ ...expanded, [d.id]: !more })}>{more ? 'Ver menos' : 'Ver mais'}</button>}
          {status === 'open' && <div className="fi-debtor-actions">
            {!d.fromSale && <button className="quiet" onClick={() => setRemoving(d)}>Remover</button>}
            <button className="primary" onClick={() => setPaying(d)}><Icon name="check" size={16} /> Recebi</button>
          </div>}
        </article>;
      })}
    </div> : <div className="st-empty"><Icon name="user" size={30} /><p>{status === 'open' ? 'Ninguém devendo.' : 'Nenhum pagamento ainda.'}</p></div>)}
    {paying && <PaySheet debtor={paying} onClose={() => setPaying(null)} onSaved={refresh} />}
    {removing && <RemoveSheet debtor={removing} onClose={() => setRemoving(null)} onSaved={refresh} />}
  </>;
}

function RemoveSheet({ debtor, onClose, onSaved }: { debtor: Debtor; onClose: () => void; onSaved: () => void }) {
  const [pending, setPending] = useState(false), [error, setError] = useState('');
  return <Sheet title="Remover devedor" onClose={onClose} busy={pending}>
    <p className="st-hint">Remover <strong>{debtor.name}</strong> ({money(debtor.totalCents)})? Use só se foi cadastrado por engano.</p>
    <ErrorText>{error}</ErrorText>
    <div className="st-two"><button className="quiet" onClick={onClose}>Cancelar</button><button className="primary fi-danger" disabled={pending} onClick={async () => {
      setPending(true); setError('');
      try { await api(`finance/debtors/${debtor.id}/cancel`, json('POST', {})); onSaved(); onClose(); } catch (e) { setError(e instanceof Error ? e.message : 'Erro'); } finally { setPending(false); }
    }}>Remover</button></div>
  </Sheet>;
}
