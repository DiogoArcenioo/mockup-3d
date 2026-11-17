'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../icons';
import { api, json, money, today, variant, qty, units, type Product } from '../store/lib';
import { Chips, ErrorText, MoneyInput, Sheet, Thumb } from '../store/ui';
import { EntryForm } from '../store/products';

export const EXPENSE_CATEGORIES = ['Insumos', 'Embalagem', 'Frete', 'Aluguel', 'Contas', 'Marketing', 'Taxas', 'Outros'];

/** Envia uma vez: o mesmo conteúdo reaproveita o identificador, então reenviar não duplica. */
function useOnce() {
  const ref = useRef({ key: '', id: '' });
  return (payload: unknown) => { const key = JSON.stringify(payload); if (ref.current.key !== key) ref.current = { key, id: crypto.randomUUID() }; return ref.current.id; };
}
function useSave() {
  const [pending, setPending] = useState(false), [error, setError] = useState('');
  async function run(task: () => Promise<void>) {
    if (pending) return; setPending(true); setError('');
    try { await task(); } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível salvar.'); } finally { setPending(false); }
  }
  return { pending, error, setError, run };
}
function DateField({ value, onChange, label = 'Data' }: { value: string; onChange: (v: string) => void; label?: string }) {
  const [open, setOpen] = useState(value !== today());
  return <div className="st-date-row">
    {open ? <input type="date" value={value} min="2000-01-01" max="2100-12-31" onChange={e => onChange(e.target.value || today())} aria-label={label} /> : <span>{label}: hoje</span>}
    <button type="button" className="st-link" onClick={() => { if (open) onChange(today()); setOpen(!open); }}>{open ? 'Usar hoje' : 'Outra data'}</button>
  </div>;
}
function Done({ title, value, onAgain, again, onClose }: { title: string; value?: string; onAgain?: () => void; again?: string; onClose: () => void }) {
  return <div className="st-success">
    <span className="st-success-mark"><Icon name="check" size={40} /></span>
    {value && <strong className="st-success-total">{value}</strong>}
    <p>{title}</p>
    <div className="st-two">{onAgain ? <button className="quiet" onClick={onAgain}><Icon name="plus" size={16} /> {again}</button> : <span />}<button className="primary" onClick={onClose}>Concluir</button></div>
  </div>;
}

// ---------- Nova despesa: compra de produto ou outra despesa ----------
export function ExpenseSheet({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [mode, setMode] = useState<'choose' | 'purchase' | 'other'>('choose');
  const [done, setDone] = useState<{ title: string; value?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const finish = (title: string, value?: string) => { setDone({ title, value }); onSaved(); };
  const title = done ? 'Despesa registrada' : mode === 'purchase' ? 'Compra de produtos' : mode === 'other' ? 'Outra despesa' : 'Nova despesa';
  return <Sheet title={title} onClose={onClose} busy={busy} back={!done && mode !== 'choose' ? () => setMode('choose') : undefined}>
    {done ? <Done title={done.title} value={done.value} again="Outra despesa" onAgain={() => { setDone(null); setMode('choose'); }} onClose={onClose} />
      : mode === 'choose' ? <>
        <h3 className="st-q">O que você pagou?</h3>
        <div className="st-kinds">
          <button onClick={() => setMode('purchase')}><Icon name="box" size={30} /><span>Compra de produtos</span><small>entra no estoque</small></button>
          <button onClick={() => setMode('other')}><Icon name="wallet" size={30} /><span>Outra despesa</span><small>frete, aluguel, contas…</small></button>
        </div>
      </> : mode === 'purchase' ? <PurchaseFlow setBusy={setBusy} onDone={finish} />
        : <OtherExpense setBusy={setBusy} onDone={finish} />}
  </Sheet>;
}

function PurchaseFlow({ setBusy, onDone }: { setBusy: (b: boolean) => void; onDone: (title: string) => void }) {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Product | null>(null);
  useEffect(() => { api<{ products: Product[] }>('products').then(d => setProducts(d.products)).catch(e => setError(e.message)); }, []);
  const list = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR');
    return (products ?? []).filter(p => !term || `${p.name} ${variant(p)}`.toLocaleLowerCase('pt-BR').includes(term));
  }, [products, search]);
  if (selected) return <>
    <div className="st-picked"><Thumb product={selected} size={44} /><div><strong>{selected.name}</strong><small>{variant(selected)} · {qty(selected.stock)} {units[selected.unit]} em estoque</small></div><button className="st-link" onClick={() => setSelected(null)}>Trocar</button></div>
    <EntryForm product={selected} setBusy={setBusy} onDone={(_p, message) => onDone(`${selected.name}: ${message}`)} />
  </>;
  return <>
    <ErrorText>{error}</ErrorText>
    <label className="st-search"><Icon name="search" size={18} /><input type="search" autoFocus placeholder="Qual produto você comprou?" value={search} onChange={e => setSearch(e.target.value)} aria-label="Buscar produto" /></label>
    {!products && !error && <p className="st-muted">Carregando…</p>}
    <div className="st-list st-pick-list">
      {list.slice(0, 40).map(p => <button key={p.id} className="st-row" onClick={() => setSelected(p)}><Thumb product={p} size={40} /><span className="st-row-info"><strong>{p.name}</strong><small>{variant(p)}</small></span><Icon name="arrow" size={16} /></button>)}
      {products && !list.length && <p className="st-muted">Nenhum produto. Cadastre no Estoque.</p>}
    </div>
  </>;
}

function OtherExpense({ setBusy, onDone }: { setBusy: (b: boolean) => void; onDone: (title: string, value: string) => void }) {
  const [amount, setAmount] = useState<number | null>(null);
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [date, setDate] = useState(today);
  const once = useOnce();
  const { pending, error, setError, run } = useSave();
  useEffect(() => setBusy(pending), [pending, setBusy]);
  return <form className="st-form" onSubmit={e => {
    e.preventDefault();
    if (!amount) return setError('Informe o valor.');
    if (!description.trim()) return setError('Diga com o que foi o gasto.');
    const body = { kind: 'expense', amountCents: -amount, description: description.trim(), category, occurredAt: date };
    void run(async () => { await api('finance/transactions', json('POST', { ...body, requestId: once(body) })); onDone(description.trim(), money(amount)); });
  }}>
    <div className="st-field"><span>Valor</span><MoneyInput label="Valor da despesa" value={amount} onChange={setAmount} large autoFocus /></div>
    <label className="st-field"><span>Com o quê?</span><input value={description} onChange={e => setDescription(e.target.value)} maxLength={160} placeholder="Ex.: Frete dos Correios" /></label>
    <div className="st-field"><span>Categoria</span><Chips label="Categoria" value={category} onChange={v => setCategory(v === category ? '' : v)} options={EXPENSE_CATEGORIES.map(c => [c, c] as [string, string])} /></div>
    <DateField value={date} onChange={setDate} />
    <ErrorText>{error}</ErrorText>
    <button className="primary st-block" disabled={pending}>{pending ? 'Salvando…' : 'Registrar despesa'}</button>
  </form>;
}

// ---------- Pagamento de sócio ----------
type Member = { id: string; name: string; login: string };
export function PartnerSheet({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState<number | null>(null);
  const [date, setDate] = useState(today);
  const [notes, setNotes] = useState('');
  const [done, setDone] = useState('');
  const once = useOnce();
  const { pending, error, setError, run } = useSave();
  useEffect(() => { api<{ users: Member[] }>('finance/users').then(d => setMembers(d.users)).catch(e => setError(e.message)); }, [setError]);
  return <Sheet title={done ? 'Pagamento registrado' : 'Pagar sócio'} onClose={onClose} busy={pending}>
    {done ? <Done title={done} value={money(amount ?? 0)} onClose={onClose} /> : <form className="st-form" onSubmit={e => {
      e.preventDefault();
      if (!recipient) return setError('Escolha quem recebeu.');
      if (!amount) return setError('Informe o valor.');
      const body = { kind: 'partner_payment', recipientId: recipient, amountCents: -amount, occurredAt: date, notes: notes.trim() };
      void run(async () => { await api('finance/transactions', json('POST', { ...body, requestId: once(body) })); setDone(`Pago para ${members?.find(m => m.id === recipient)?.name}`); onSaved(); });
    }}>
      <div className="st-field"><span>Para quem?</span>{members ? <Chips label="Sócio" value={recipient} onChange={setRecipient} options={members.map(m => [m.id, m.name] as [string, string])} /> : <p className="st-muted">Carregando…</p>}</div>
      <div className="st-field"><span>Valor</span><MoneyInput label="Valor do pagamento" value={amount} onChange={setAmount} large /></div>
      <DateField value={date} onChange={setDate} />
      <label className="st-field"><span>Observação</span><input value={notes} maxLength={1000} onChange={e => setNotes(e.target.value)} placeholder="Opcional" /></label>
      <ErrorText>{error}</ErrorText>
      <button className="primary st-block" disabled={pending}>{pending ? 'Salvando…' : 'Registrar pagamento'}</button>
    </form>}
  </Sheet>;
}

// ---------- Ajuste manual de saldo ----------
export function AdjustSheet({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [direction, setDirection] = useState<'in' | 'out'>('in');
  const [amount, setAmount] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const [date, setDate] = useState(today);
  const [done, setDone] = useState(false);
  const once = useOnce();
  const { pending, error, setError, run } = useSave();
  return <Sheet title={done ? 'Saldo ajustado' : 'Ajustar saldo'} onClose={onClose} busy={pending}>
    {done ? <Done title={reason} value={`${direction === 'in' ? '+' : '−'}${money(amount ?? 0)}`} onClose={onClose} /> : <form className="st-form" onSubmit={e => {
      e.preventDefault();
      if (!amount) return setError('Informe o valor.');
      if (!reason.trim()) return setError('Informe o motivo.');
      const body = { kind: 'adjustment', amountCents: direction === 'in' ? amount : -amount, description: reason.trim(), occurredAt: date };
      void run(async () => { await api('finance/transactions', json('POST', { ...body, requestId: once(body) })); setDone(true); onSaved(); });
    }}>
      <div className="st-segment" role="group" aria-label="Tipo de ajuste">
        <button type="button" aria-pressed={direction === 'in'} onClick={() => setDirection('in')}><Icon name="plus" size={18} /> Adicionar</button>
        <button type="button" aria-pressed={direction === 'out'} onClick={() => setDirection('out')}><Icon name="minus" size={18} /> Remover</button>
      </div>
      <div className="st-field"><span>Valor</span><MoneyInput label="Valor do ajuste" value={amount} onChange={setAmount} large /></div>
      <label className="st-field"><span>Motivo</span><input value={reason} onChange={e => setReason(e.target.value)} maxLength={160} placeholder={direction === 'in' ? 'Ex.: Aporte dos sócios' : 'Ex.: Retirada para troco'} /></label>
      <DateField value={date} onChange={setDate} />
      <p className="st-hint">Fica registrado no extrato e no log com seu nome.</p>
      <ErrorText>{error}</ErrorText>
      <button className="primary st-block" disabled={pending}>{pending ? 'Salvando…' : direction === 'in' ? 'Adicionar ao saldo' : 'Remover do saldo'}</button>
    </form>}
  </Sheet>;
}

// ---------- Devedor manual ----------
export function DebtorSheet({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [items, setItems] = useState('');
  const [amount, setAmount] = useState<number | null>(null);
  const [date, setDate] = useState(today);
  const once = useOnce();
  const { pending, error, setError, run } = useSave();
  return <Sheet title="Novo devedor" onClose={onClose} busy={pending}>
    <form className="st-form" onSubmit={e => {
      e.preventDefault();
      if (!name.trim()) return setError('Informe o nome.');
      if (!amount) return setError('Informe o valor total.');
      const body = { name: name.trim(), items: items.trim(), totalCents: amount, owedAt: date };
      void run(async () => { await api('finance/debtors', json('POST', { ...body, requestId: once(body) })); onSaved(); onClose(); });
    }}>
      <label className="st-field"><span>Nome</span><input autoFocus value={name} onChange={e => setName(e.target.value)} maxLength={160} placeholder="Quem está devendo?" /></label>
      <label className="st-field"><span>Produtos</span><textarea rows={3} value={items} onChange={e => setItems(e.target.value)} maxLength={2000} placeholder={'Ex.: 2 canecas\n1 camiseta M'} /></label>
      <div className="st-field"><span>Valor total</span><MoneyInput label="Valor total" value={amount} onChange={setAmount} large /></div>
      <DateField value={date} onChange={setDate} />
      <p className="st-hint">Não mexe no estoque. Para baixar estoque, venda pelo Estoque marcando “Devedor”.</p>
      <ErrorText>{error}</ErrorText>
      <button className="primary st-block" disabled={pending}>{pending ? 'Salvando…' : 'Cadastrar devedor'}</button>
    </form>
  </Sheet>;
}

// ---------- Receber de devedor ----------
export function PaySheet({ debtor, onClose, onSaved }: { debtor: { id: string; name: string; totalCents: number }; onClose: () => void; onSaved: () => void }) {
  const [date, setDate] = useState(today);
  const { pending, error, run } = useSave();
  return <Sheet title="Receber pagamento" onClose={onClose} busy={pending}>
    <div className="st-success">
      <strong className="st-success-total">{money(debtor.totalCents)}</strong>
      <p>{debtor.name}</p>
    </div>
    <DateField value={date} onChange={setDate} label="Pago" />
    <p className="st-hint">O valor entra no caixa nesta data.</p>
    <ErrorText>{error}</ErrorText>
    <button className="primary st-block" disabled={pending} onClick={() => void run(async () => { await api(`finance/debtors/${debtor.id}/pay`, json('POST', { paidAt: date })); onSaved(); onClose(); })}>{pending ? 'Salvando…' : <><Icon name="check" size={18} /> Confirmar recebimento</>}</button>
  </Sheet>;
}
