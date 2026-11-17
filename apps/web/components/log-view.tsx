'use client';
import { useEffect, useMemo, useState } from 'react';
import { Icon } from './icons';
import { api, money, time, today, shiftDate } from './store/lib';
import { Chips, ErrorText } from './store/ui';
import './store/store.css';
import './finance/finance.css';

type Event = { id: string; at: string; actor: string; type: 'sale' | 'stock' | 'money' | 'product' | 'user'; title: string; detail: string; amountCents?: number; pending?: boolean };
type Filter = '' | Event['type'];
const icons: Record<Event['type'], string> = { sale: 'cart', stock: 'box', money: 'wallet', product: 'tag', user: 'users' };
const dayOf = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(iso));

export function LogView() {
  const [events, setEvents] = useState<Event[] | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('');
  const [reload, setReload] = useState(0);
  useEffect(() => { setEvents(null); setError(''); api<{ events: Event[] }>('finance/log?days=7').then(d => setEvents(d.events)).catch(e => setError(e.message)); }, [reload]);
  const groups = useMemo(() => {
    const out: [string, Event[]][] = [];
    for (const e of (events ?? []).filter(e => !filter || e.type === filter)) {
      const d = dayOf(e.at), last = out[out.length - 1];
      if (last && last[0] === d) last[1].push(e); else out.push([d, [e]]);
    }
    return out;
  }, [events, filter]);
  const label = (d: string) => d === today() ? 'Hoje' : d === shiftDate(today(), -1) ? 'Ontem' : new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', timeZone: 'UTC' }).format(new Date(d + 'T12:00:00Z'));

  return <main className="app-content st-page fi-log">
    <div className="fi-log-head"><h1 className="page-title">Log do sistema</h1><button className="st-icon-btn" onClick={() => setReload(v => v + 1)} aria-label="Atualizar"><Icon name="history" size={18} /></button></div>
    <p className="st-hint">Tudo que aconteceu nos últimos 7 dias, do mais recente ao mais antigo.</p>
    <Chips label="Tipo" value={filter} onChange={setFilter} options={[['', 'Tudo'], ['sale', 'Vendas'], ['stock', 'Estoque'], ['money', 'Financeiro'], ['product', 'Produtos'], ['user', 'Usuários']]} />
    <ErrorText>{error}</ErrorText>
    {!events && !error && <p className="st-muted">Carregando…</p>}
    {events && !groups.length && <div className="st-empty"><Icon name="history" size={30} /><p>Nada registrado no período.</p></div>}
    {groups.map(([day, list]) => <section key={day} className="fi-log-day">
      <h2>{label(day)}</h2>
      <div className="st-list">{list.map(e => <div key={e.id} className="st-row st-row-static">
        <span className={`st-order-icon fi-log-${e.type}`}><Icon name={icons[e.type]} size={17} /></span>
        <span className="st-row-info"><strong>{e.title}</strong><small>{e.detail}</small><small className="fi-log-meta">{e.actor} · {time(e.at)}</small></span>
        {e.amountCents !== undefined && <span className="st-row-stock"><strong className={e.pending ? 'fi-pending' : e.amountCents < 0 ? 'fi-out' : 'fi-in'}>{e.amountCents < 0 ? '−' : e.pending ? '' : '+'}{money(Math.abs(e.amountCents))}</strong>{e.pending && <small>a receber</small>}</span>}
      </div>)}</div>
    </section>)}
  </main>;
}
