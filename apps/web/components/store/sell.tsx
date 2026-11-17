'use client';
import { useMemo, useRef, useState } from 'react';
import { Icon } from '../icons';
import { api, json, money, qty, today, units, variant, categories, payments, type Cart, type Category, type Order, type Product } from './lib';
import { Chips, ErrorText, MoneyInput, Sheet, Stepper, Thumb } from './ui';

type Filter = '' | Category;

export function SellView({ products, cart, setCart, onSold, onNewProduct }: { products: Product[]; cart: Cart; setCart: (c: Cart) => void; onSold: () => void; onNewProduct: () => void }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('');
  const [checkout, setCheckout] = useState(false);
  const forSale = useMemo(() => products.filter(p => p.type === 'resale'), [products]);
  const list = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR');
    return forSale
      .filter(p => (!filter || p.category === filter) && (!term || `${p.name} ${variant(p)}`.toLocaleLowerCase('pt-BR').includes(term)))
      .sort((a, b) => Number(b.stock > 0) - Number(a.stock > 0) || a.name.localeCompare(b.name, 'pt-BR'));
  }, [forSale, search, filter]);
  const lines = Object.entries(cart);
  const count = lines.reduce((sum, [, l]) => sum + l.quantity, 0);
  const total = lines.reduce((sum, [, l]) => sum + Math.round(l.priceCents * l.quantity), 0);

  function change(p: Product, delta: number) {
    const current = cart[p.id]?.quantity ?? 0;
    const next = Math.min(p.stock, current + delta);
    const copy = { ...cart };
    if (next <= 0) delete copy[p.id]; else copy[p.id] = { quantity: next, priceCents: cart[p.id]?.priceCents ?? p.salePriceCents ?? 0 };
    setCart(copy);
  }

  if (!forSale.length) return <div className="st-empty">
    <Icon name="box" size={34} /><h3>Nenhum produto à venda</h3><p>Cadastre o primeiro para começar a vender.</p>
    <button className="primary" onClick={onNewProduct}><Icon name="plus" size={18} /> Cadastrar produto</button>
  </div>;

  return <>
    <div className="st-toolbar">
      <label className="st-search"><Icon name="search" size={18} /><input type="search" placeholder="Buscar produto" value={search} onChange={e => setSearch(e.target.value)} aria-label="Buscar produto" /></label>
    </div>
    <Chips label="Categoria" value={filter} onChange={setFilter} options={[['', 'Todos'], ...Object.entries(categories).map(([id, c]) => [id, c.label] as [Category, string])]} />
    {list.length ? <div className="st-grid">
      {list.map(p => {
        const inCart = cart[p.id]?.quantity ?? 0, out = p.stock <= 0;
        return <article key={p.id} className={`st-card${inCart ? ' st-card-on' : ''}${out ? ' st-card-out' : ''}`}>
          <button className="st-card-main" onClick={() => change(p, 1)} disabled={out || inCart >= p.stock} aria-label={`Adicionar ${p.name}`}>
            <Thumb product={p} size={64} />
            {inCart > 0 && <span className="st-card-badge">{qty(inCart)}</span>}
            <strong>{p.name}</strong>
            <small>{variant(p) || ' '}</small>
            <span className="st-card-price">{p.salePriceCents === null ? <em>Sem preço</em> : money(p.salePriceCents)}</span>
            <span className={`st-card-stock${p.stock > 0 && p.stock <= Math.max(p.minStock, 2) ? ' st-warn' : ''}`}>{out ? 'Esgotado' : `${qty(p.stock)} ${units[p.unit]}`}</span>
          </button>
          {inCart > 0 && <div className="st-card-qty">
            <button onClick={() => change(p, -1)} aria-label={`Remover um ${p.name}`}><Icon name="minus" size={16} /></button>
            <span>{qty(inCart)}</span>
            <button onClick={() => change(p, 1)} disabled={inCart >= p.stock} aria-label={`Adicionar mais um ${p.name}`}><Icon name="plus" size={16} /></button>
          </div>}
        </article>;
      })}
    </div> : <div className="st-empty"><Icon name="search" size={30} /><p>Nada encontrado.</p></div>}

    {count > 0 && <div className="st-cartbar">
      <button className="st-cartbar-clear" onClick={() => setCart({})} aria-label="Esvaziar carrinho"><Icon name="close" size={18} /></button>
      <div className="st-cartbar-info"><span><Icon name="cart" size={16} /> {qty(count)} {count === 1 ? 'item' : 'itens'}</span><strong>{money(total)}</strong></div>
      <button className="st-cartbar-go" onClick={() => setCheckout(true)}>Fechar venda <Icon name="arrow" size={18} /></button>
    </div>}
    {checkout && <Checkout products={products} cart={cart} setCart={setCart} onClose={() => setCheckout(false)} onDone={() => { setCheckout(false); setCart({}); onSold(); }} />}
  </>;
}

function Checkout({ products, cart, setCart, onClose, onDone }: { products: Product[]; cart: Cart; setCart: (c: Cart) => void; onClose: () => void; onDone: () => void }) {
  const [customer, setCustomer] = useState('');
  const [payment, setPayment] = useState<'' | keyof typeof payments>('');
  const [date, setDate] = useState(today);
  const [editDate, setEditDate] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ order: Order; todayCount: number } | null>(null);
  const request = useRef({ key: '', id: '' });
  const byId = new Map(products.map(p => [p.id, p]));
  const lines = Object.entries(cart).filter(([id]) => byId.has(id));
  const total = lines.reduce((s, [, l]) => s + Math.round(l.priceCents * l.quantity), 0);
  const list = lines.reduce((s, [id, l]) => s + Math.round((byId.get(id)!.salePriceCents ?? l.priceCents) * l.quantity), 0);
  const discount = list - total;

  function update(id: string, patch: Partial<Cart[string]>) {
    const copy = { ...cart, [id]: { ...cart[id], ...patch } };
    if (copy[id].quantity <= 0) delete copy[id];
    setCart(copy);
    if (Object.keys(copy).length === 0) onClose();
  }

  async function confirm() {
    if (pending) return;
    setError('');
    if (!customer.trim()) { setError('Informe o nome do cliente.'); document.getElementById('st-customer')?.focus(); return; }
    const noPrice = lines.find(([, l]) => l.priceCents <= 0);
    if (noPrice) { setError(`Informe o preço de ${byId.get(noPrice[0])!.name}.`); return; }
    const payload = { soldAt: date, customer: customer.trim(), paymentMethod: payment, items: lines.map(([productId, l]) => ({ productId, quantity: l.quantity, unitPriceCents: l.priceCents })) };
    // Mesmo conteúdo reaproveita o identificador: reenviar após falha de rede não duplica a venda.
    const key = JSON.stringify(payload);
    if (request.current.key !== key) request.current = { key, id: crypto.randomUUID() };
    setPending(true);
    try {
      const { order } = await api<{ order: Order }>('orders', json('POST', { ...payload, requestId: request.current.id }));
      const day = await api<{ count: number }>(`orders?from=${today()}&to=${today()}`).catch(() => ({ count: 0 }));
      setDone({ order, todayCount: day.count });
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível registrar.'); }
    finally { setPending(false); }
  }

  if (done) return <Sheet title="Venda registrada" onClose={onDone}>
    <div className="st-success">
      <span className="st-success-mark"><Icon name="check" size={40} /></span>
      <strong className="st-success-total">{money(done.order.totalCents)}</strong>
      <p>{done.order.customer} · {done.order.items.length} {done.order.items.length === 1 ? 'produto' : 'produtos'}</p>
      {done.todayCount > 0 && <span className="st-streak"><Icon name="spark" size={15} /> {done.todayCount}ª venda de hoje</span>}
      <button className="primary st-block" onClick={onDone}><Icon name="cart" size={18} /> Nova venda</button>
    </div>
  </Sheet>;

  return <Sheet title="Fechar venda" onClose={onClose} busy={pending}>
    <label className="st-field"><span>Cliente</span><input id="st-customer" value={customer} onChange={e => { setCustomer(e.target.value); setError(''); }} maxLength={160} placeholder="Nome do cliente" autoComplete="off" enterKeyHint="done" /></label>
    <div className="st-lines">
      {lines.map(([id, l]) => {
        const p = byId.get(id)!, changed = p.salePriceCents !== null && p.salePriceCents !== l.priceCents;
        return <div className="st-line" key={id}>
          <div className="st-line-top"><Thumb product={p} size={40} /><div><strong>{p.name}</strong><small>{variant(p)}</small></div><span className="st-line-total">{money(Math.round(l.priceCents * l.quantity))}</span></div>
          <div className="st-line-controls">
            <Stepper label={`Quantidade de ${p.name}`} value={l.quantity} min={0} max={p.stock} onChange={v => update(id, { quantity: v })} />
            <div className="st-line-price">
              <MoneyInput label={`Preço de ${p.name}`} value={l.priceCents} onChange={v => update(id, { priceCents: v ?? 0 })} />
              {changed && <small><s>{money(p.salePriceCents!)}</s></small>}
            </div>
          </div>
        </div>;
      })}
    </div>
    <div className="st-field"><span>Pagamento</span><Chips label="Forma de pagamento" value={payment} onChange={v => setPayment(v === payment ? '' : v)} options={Object.entries(payments) as [keyof typeof payments, string][]} /></div>
    <div className="st-date-row">
      {editDate ? <input type="date" value={date} max="2100-12-31" min="2000-01-01" onChange={e => setDate(e.target.value || today())} aria-label="Data da venda" /> : <span>Venda de hoje</span>}
      <button type="button" className="st-link" onClick={() => { setEditDate(!editDate); if (editDate) setDate(today()); }}>{editDate ? 'Usar hoje' : 'Outra data'}</button>
    </div>
    <div className="st-total-box">
      {discount !== 0 && <div><span>Preço de tabela</span><span>{money(list)}</span></div>}
      {discount !== 0 && <div className={discount > 0 ? 'st-discount' : ''}><span>{discount > 0 ? 'Desconto' : 'Acréscimo'}</span><span>{discount > 0 ? '−' : '+'}{money(Math.abs(discount))}</span></div>}
      <div className="st-total"><span>Total</span><strong>{money(total)}</strong></div>
    </div>
    <ErrorText>{error}</ErrorText>
    <button className="primary st-block st-confirm" onClick={confirm} disabled={pending}>{pending ? 'Registrando…' : <><Icon name="check" size={18} /> Confirmar venda</>}</button>
  </Sheet>;
}
