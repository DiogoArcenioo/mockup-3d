'use client';
import { useMemo, useRef, useState } from 'react';
import { Icon } from '../icons';
import { api, json, money, qty, today, units, variant, categories, payments, cartKey, available, sellSizes, sizeLabel, type Cart, type Category, type Order, type Product } from './lib';
import { Chips, ErrorText, MoneyInput, Sheet, Stepper, Thumb } from './ui';

type Filter = '' | Category;

export function SellView({ products, cart, setCart, onSold, onNewProduct }: { products: Product[]; cart: Cart; setCart: (c: Cart) => void; onSold: () => void; onNewProduct: () => void }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('');
  const [checkout, setCheckout] = useState(false);
  const [picking, setPicking] = useState<Product | null>(null);
  const forSale = useMemo(() => products.filter(p => p.type === 'resale'), [products]);
  const list = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR');
    return forSale
      .filter(p => (!filter || p.category === filter) && (!term || `${p.name} ${variant(p)}`.toLocaleLowerCase('pt-BR').includes(term)))
      .sort((a, b) => Number(b.stock > 0) - Number(a.stock > 0) || a.name.localeCompare(b.name, 'pt-BR'));
  }, [forSale, search, filter]);
  const lines = Object.values(cart);
  const count = lines.reduce((sum, l) => sum + l.quantity, 0);
  const total = lines.reduce((sum, l) => sum + Math.round(l.priceCents * l.quantity), 0);
  const inCartOf = (id: string) => lines.filter(l => l.productId === id);

  function change(p: Product, size: string | null, delta: number) {
    const key = cartKey(p.id, size), current = cart[key]?.quantity ?? 0;
    const next = Math.min(available(p, size), current + delta);
    const copy = { ...cart };
    if (next <= 0) delete copy[key]; else copy[key] = { productId: p.id, size, quantity: next, priceCents: cart[key]?.priceCents ?? p.salePriceCents ?? 0 };
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
        const mine = inCartOf(p.id), inCart = mine.reduce((s, l) => s + l.quantity, 0), out = p.stock <= 0, sized = p.sizes.length > 0;
        return <article key={p.id} className={`st-card${inCart ? ' st-card-on' : ''}${out ? ' st-card-out' : ''}`}>
          <button className="st-card-main" onClick={() => sized ? setPicking(p) : change(p, null, 1)} disabled={out || (!sized && inCart >= p.stock)} aria-label={sized ? `Escolher tamanho de ${p.name}` : `Adicionar ${p.name}`}>
            <Thumb product={p} size={64} />
            {inCart > 0 && <span className="st-card-badge">{qty(inCart)}</span>}
            <strong>{p.name}</strong>
            <small>{variant(p) || ' '}</small>
            <span className="st-card-price">{p.salePriceCents === null ? <em>Sem preço</em> : money(p.salePriceCents)}</span>
            <span className={`st-card-stock${p.stock > 0 && p.stock <= Math.max(p.minStock, 2) ? ' st-warn' : ''}`}>{out ? 'Esgotado' : sized ? p.sizes.filter(s => (p.sizeStock[s] ?? 0) > 0).join(' · ') || `${qty(p.stock)} ${units[p.unit]}` : `${qty(p.stock)} ${units[p.unit]}`}</span>
          </button>
          {inCart > 0 && (sized
            ? <button className="st-card-sizes" onClick={() => setPicking(p)}>{mine.map(l => `${l.size ?? '—'} ×${qty(l.quantity)}`).join('  ')}<Icon name="edit" size={14} /></button>
            : <div className="st-card-qty">
              <button onClick={() => change(p, null, -1)} aria-label={`Remover um ${p.name}`}><Icon name="minus" size={16} /></button>
              <span>{qty(inCart)}</span>
              <button onClick={() => change(p, null, 1)} disabled={inCart >= p.stock} aria-label={`Adicionar mais um ${p.name}`}><Icon name="plus" size={16} /></button>
            </div>)}
        </article>;
      })}
    </div> : <div className="st-empty"><Icon name="search" size={30} /><p>Nada encontrado.</p></div>}

    {count > 0 && <div className="st-cartbar">
      <button className="st-cartbar-clear" onClick={() => setCart({})} aria-label="Esvaziar carrinho"><Icon name="close" size={18} /></button>
      <div className="st-cartbar-info"><span><Icon name="cart" size={16} /> {qty(count)} {count === 1 ? 'item' : 'itens'}</span><strong>{money(total)}</strong></div>
      <button className="st-cartbar-go" onClick={() => setCheckout(true)}>Fechar venda <Icon name="arrow" size={18} /></button>
    </div>}
    {picking && <SizePicker product={products.find(p => p.id === picking.id) ?? picking} cart={cart} change={change} onClose={() => setPicking(null)} />}
    {checkout && <Checkout products={products} cart={cart} setCart={setCart} onClose={() => setCheckout(false)} onDone={() => { setCheckout(false); setCart({}); onSold(); }} />}
  </>;
}

function SizePicker({ product: p, cart, change, onClose }: { product: Product; cart: Cart; change: (p: Product, size: string | null, delta: number) => void; onClose: () => void }) {
  return <Sheet title={p.name} onClose={onClose}>
    <p className="st-hint">Escolha o tamanho</p>
    <div className="st-sizes-pick">
      {sellSizes(p).map(size => {
        const stock = available(p, size), inCart = cart[cartKey(p.id, size)]?.quantity ?? 0;
        return <div key={size ?? '-'} className={`st-size-row${stock <= 0 ? ' st-size-out' : ''}${inCart ? ' st-size-on' : ''}`}>
          <button className="st-size-tag" onClick={() => change(p, size, 1)} disabled={stock <= inCart}>{size ?? '—'}</button>
          <span className="st-size-info"><strong>{sizeLabel(size)}</strong><small>{stock > 0 ? `${qty(stock)} em estoque` : 'Esgotado'}</small></span>
          {inCart > 0
            ? <Stepper label={`Quantidade ${sizeLabel(size)}`} value={inCart} min={0} max={stock} onChange={v => change(p, size, v - inCart)} />
            : <button className="quiet st-size-add" onClick={() => change(p, size, 1)} disabled={stock <= 0}><Icon name="plus" size={16} /> Adicionar</button>}
        </div>;
      })}
    </div>
    <button className="primary st-block" onClick={onClose}>Pronto</button>
  </Sheet>;
}

function Checkout({ products, cart, setCart, onClose, onDone }: { products: Product[]; cart: Cart; setCart: (c: Cart) => void; onClose: () => void; onDone: () => void }) {
  const [customer, setCustomer] = useState('');
  const [payment, setPayment] = useState<'' | keyof typeof payments>('');
  const [onCredit, setOnCredit] = useState(false);
  const [date, setDate] = useState(today);
  const [editDate, setEditDate] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ order: Order; todayCount: number } | null>(null);
  const request = useRef({ key: '', id: '' });
  const byId = new Map(products.map(p => [p.id, p]));
  const lines = Object.entries(cart).filter(([, l]) => byId.has(l.productId));
  const total = lines.reduce((s, [, l]) => s + Math.round(l.priceCents * l.quantity), 0);
  const list = lines.reduce((s, [, l]) => s + Math.round((byId.get(l.productId)!.salePriceCents ?? l.priceCents) * l.quantity), 0);
  const discount = list - total;

  function update(key: string, patch: Partial<Cart[string]>) {
    const copy = { ...cart, [key]: { ...cart[key], ...patch } };
    if (copy[key].quantity <= 0) delete copy[key];
    setCart(copy);
    if (Object.keys(copy).length === 0) onClose();
  }

  async function confirm() {
    if (pending) return;
    setError('');
    if (!customer.trim()) { setError('Informe o nome do cliente.'); document.getElementById('st-customer')?.focus(); return; }
    const noPrice = lines.find(([, l]) => l.priceCents <= 0);
    if (noPrice) { setError(`Informe o preço de ${byId.get(noPrice[1].productId)!.name}.`); return; }
    const payload = { soldAt: date, customer: customer.trim(), paymentMethod: onCredit ? '' : payment, onCredit, items: lines.map(([, l]) => ({ productId: l.productId, size: l.size, quantity: l.quantity, unitPriceCents: l.priceCents })) };
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
      {done.order.onCredit && <span className="st-pill st-pill-warn"><Icon name="alert" size={13} /> Ficou como devedor no financeiro</span>}
      {done.todayCount > 0 && <span className="st-streak"><Icon name="spark" size={15} /> {done.todayCount}ª venda de hoje</span>}
      <button className="primary st-block" onClick={onDone}><Icon name="cart" size={18} /> Nova venda</button>
    </div>
  </Sheet>;

  return <Sheet title="Fechar venda" onClose={onClose} busy={pending}>
    <label className="st-field"><span>Cliente</span><input id="st-customer" value={customer} onChange={e => { setCustomer(e.target.value); setError(''); }} maxLength={160} placeholder="Nome do cliente" autoComplete="off" enterKeyHint="done" /></label>
    <div className="st-lines">
      {lines.map(([key, l]) => {
        const p = byId.get(l.productId)!, changed = p.salePriceCents !== null && p.salePriceCents !== l.priceCents;
        return <div className="st-line" key={key}>
          <div className="st-line-top"><Thumb product={p} size={40} /><div><strong>{p.name}{p.sizes.length > 0 && <span className="st-size-chip">{l.size ?? '—'}</span>}</strong><small>{variant(p)}</small></div><span className="st-line-total">{money(Math.round(l.priceCents * l.quantity))}</span></div>
          <div className="st-line-controls">
            <Stepper label={`Quantidade de ${p.name}`} value={l.quantity} min={0} max={available(p, l.size)} onChange={v => update(key, { quantity: v })} />
            <div className="st-line-price">
              <MoneyInput label={`Preço de ${p.name}`} value={l.priceCents} onChange={v => update(key, { priceCents: v ?? 0 })} />
              {changed && <small><s>{money(p.salePriceCents!)}</s></small>}
            </div>
          </div>
        </div>;
      })}
    </div>
    <label className={`st-check${onCredit ? ' st-check-on' : ''}`}>
      <input type="checkbox" checked={onCredit} onChange={e => setOnCredit(e.target.checked)} />
      <span><strong>Devedor</strong><small>O cliente ainda não pagou</small></span>
    </label>
    {!onCredit && <div className="st-field"><span>Pagamento</span><Chips label="Forma de pagamento" value={payment} onChange={v => setPayment(v === payment ? '' : v)} options={Object.entries(payments) as [keyof typeof payments, string][]} /></div>}
    <div className="st-date-row">
      {editDate ? <input type="date" value={date} max="2100-12-31" min="2000-01-01" onChange={e => setDate(e.target.value || today())} aria-label="Data da venda" /> : <span>Venda de hoje</span>}
      <button type="button" className="st-link" onClick={() => { setEditDate(!editDate); if (editDate) setDate(today()); }}>{editDate ? 'Usar hoje' : 'Outra data'}</button>
    </div>
    <div className="st-total-box">
      {discount !== 0 && <div><span>Preço de tabela</span><span>{money(list)}</span></div>}
      {discount !== 0 && <div className={discount > 0 ? 'st-discount' : ''}><span>{discount > 0 ? 'Desconto' : 'Acréscimo'}</span><span>{discount > 0 ? '−' : '+'}{money(Math.abs(discount))}</span></div>}
      <div className="st-total"><span>{onCredit ? 'A receber' : 'Total'}</span><strong>{money(total)}</strong></div>
    </div>
    <ErrorText>{error}</ErrorText>
    <button className="primary st-block st-confirm" onClick={confirm} disabled={pending}>{pending ? 'Registrando…' : <><Icon name="check" size={18} /> {onCredit ? 'Confirmar venda para devedor' : 'Confirmar venda'}</>}</button>
  </Sheet>;
}
