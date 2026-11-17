'use client';
import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../icons';
import { api, json, money, qty, today, units, unitNames, variant, costCents, isLow, margin, stamp, shortDate, uploadPhoto, categories, type CatalogItem, type Category, type Product, type Unit } from './lib';
import { Chips, ErrorText, MoneyInput, Sheet, Stepper, Thumb } from './ui';

type Filter = '' | 'low' | 'resale' | 'consumption';

export function ProductsView({ products, onOpen, onNew }: { products: Product[]; onOpen: (p: Product) => void; onNew: () => void }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('');
  const low = products.filter(p => isLow(p) || (p.type === 'resale' && p.stock <= 0)).length;
  const list = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR');
    return products.filter(p => (filter === 'low' ? isLow(p) || (p.type === 'resale' && p.stock <= 0) : !filter || p.type === filter)
      && (!term || `${p.name} ${variant(p)}`.toLocaleLowerCase('pt-BR').includes(term)));
  }, [products, search, filter]);
  return <>
    <div className="st-toolbar">
      <label className="st-search"><Icon name="search" size={18} /><input type="search" placeholder="Buscar produto" value={search} onChange={e => setSearch(e.target.value)} aria-label="Buscar produto" /></label>
      <button className="primary st-add" onClick={onNew}><Icon name="plus" size={18} /><span>Novo</span></button>
    </div>
    <Chips label="Filtro" value={filter} onChange={setFilter} options={[['', 'Todos'], ['low', low ? `Repor (${low})` : 'Repor'], ['resale', 'Revenda'], ['consumption', 'Insumos']]} />
    {list.length ? <div className="st-list">
      {list.map(p => <button key={p.id} className="st-row" onClick={() => onOpen(p)}>
        <Thumb product={p} />
        <span className="st-row-info"><strong>{p.name}</strong><small>{variant(p)}{p.salePriceCents !== null && <> · {money(p.salePriceCents)}</>}</small></span>
        <span className={`st-row-stock${p.stock <= 0 ? ' st-out' : isLow(p) ? ' st-warn' : ''}`}><strong>{qty(p.stock)}</strong><small>{units[p.unit]}</small></span>
      </button>)}
    </div> : <div className="st-empty"><Icon name={products.length ? 'search' : 'box'} size={30} /><p>{products.length ? 'Nada encontrado.' : 'Nenhum produto ainda.'}</p>{!products.length && <button className="primary" onClick={onNew}><Icon name="plus" size={18} /> Cadastrar produto</button>}</div>}
  </>;
}

type Mode = 'main' | 'entry' | 'price' | 'count' | 'edit';
type History = {
  costs: { id: string; source: string; unitCost: number; actorName: string; createdAt: string; quantity: number | null; supplier: string }[];
  prices: { id: string; priceCents: number; previousCents: number | null; actorName: string; createdAt: string }[];
  movements: { id: string; kind: string; quantity: number; occurredAt: string; customer: string }[];
};

export function ProductSheet({ product, colors, brands, onClose, onSaved, onCatalog, notice }: { product: Product; colors: CatalogItem[]; brands: CatalogItem[]; onClose: () => void; onSaved: (p: Product, message: string) => void; onCatalog: () => void; notice?: string }) {
  const [mode, setMode] = useState<Mode>('main');
  const [busy, setBusy] = useState(false);
  const titles: Record<Mode, string> = { main: product.name, entry: 'Entrada no estoque', price: 'Preço de venda', count: 'Contagem', edit: 'Editar produto' };
  const done = (p: Product, message: string) => { onSaved(p, message); setMode('main'); };
  return <Sheet title={titles[mode]} onClose={onClose} busy={busy} back={mode === 'main' ? undefined : () => setMode('main')}>
    {mode === 'main' && <Overview product={product} setMode={setMode} />}
    {mode === 'entry' && <EntryForm product={product} setBusy={setBusy} onDone={done} />}
    {mode === 'price' && <PriceForm product={product} setBusy={setBusy} onDone={done} />}
    {mode === 'count' && <CountForm product={product} setBusy={setBusy} onDone={done} />}
    {mode === 'edit' && <EditForm product={product} colors={colors} brands={brands} setBusy={setBusy} onDone={done} onCatalog={onCatalog} />}
    {notice && <div className="st-toast" role="status"><Icon name="check" size={16} /> {notice}</div>}
  </Sheet>;
}

function Overview({ product: p, setMode }: { product: Product; setMode: (m: Mode) => void }) {
  const [tab, setTab] = useState<'moves' | 'prices'>('moves');
  const [history, setHistory] = useState<History | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { setHistory(null); api<History>(`products/${p.id}/history`).then(setHistory).catch(e => setError(e.message)); }, [p]);
  const cost = costCents(p), m = margin(cost, p.salePriceCents);
  const kinds: Record<string, string> = { purchase: 'Entrada', sale: 'Venda', adjustment: 'Ajuste', consumption: 'Consumo' };
  return <>
    <div className="st-hero"><Thumb product={p} size={72} /><div><small>{variant(p)}</small>{isLow(p) && <span className="st-pill st-pill-warn"><Icon name="alert" size={13} /> Repor estoque</span>}</div></div>
    <div className="st-stats">
      <div><span>Estoque</span><strong>{qty(p.stock)} <small>{units[p.unit]}</small></strong></div>
      <div><span>Custo</span><strong>{cost === null ? '—' : money(cost)}</strong></div>
      {p.type === 'resale' && <div><span>Venda</span><strong>{p.salePriceCents === null ? '—' : money(p.salePriceCents)}</strong>{m !== null && <small className={m < 0 ? 'st-neg' : ''}>margem {m}%</small>}</div>}
    </div>
    <div className="st-actions">
      <button onClick={() => setMode('entry')}><Icon name="plus" size={20} /><span>Entrada</span></button>
      {p.type === 'resale' && <button onClick={() => setMode('price')}><Icon name="tag" size={20} /><span>Preço</span></button>}
      <button onClick={() => setMode('count')}><Icon name="clipboard" size={20} /><span>Contagem</span></button>
      <button onClick={() => setMode('edit')}><Icon name="edit" size={20} /><span>Editar</span></button>
    </div>
    <Chips label="Histórico" value={tab} onChange={setTab} options={[['moves', 'Movimentos'], ['prices', 'Preços']]} />
    <ErrorText>{error}</ErrorText>
    {!history && !error && <p className="st-muted">Carregando…</p>}
    {history && tab === 'moves' && (history.movements.length ? <ul className="st-history">
      {history.movements.map(m => <li key={m.id}><span className={`st-dot ${m.quantity < 0 ? 'st-dot-out' : ''}`} /><span><strong>{kinds[m.kind] || m.kind}</strong><small>{shortDate(m.occurredAt)}{m.customer ? ' · ' + m.customer : ''}</small></span><b className={m.quantity < 0 ? 'st-neg' : ''}>{m.quantity > 0 ? '+' : ''}{qty(m.quantity)}</b></li>)}
    </ul> : <p className="st-muted">Sem movimentos ainda.</p>)}
    {history && tab === 'prices' && (history.prices.length || history.costs.length ? <ul className="st-history">
      {[...history.prices.map(x => ({ id: x.id, at: x.createdAt, label: 'Venda', value: money(x.priceCents), detail: x.previousCents === null ? 'Preço inicial' : `antes ${money(x.previousCents)}`, who: x.actorName })),
        ...history.costs.map(x => ({ id: x.id, at: x.createdAt, label: 'Custo', value: money(Math.round(x.unitCost * 100)), detail: x.source === 'entry' ? `entrada${x.quantity ? ' de ' + qty(x.quantity) : ''}${x.supplier ? ' · ' + x.supplier : ''}` : 'cadastro', who: x.actorName }))]
        .sort((a, b) => b.at.localeCompare(a.at))
        .map(x => <li key={x.id}><span className={`st-dot ${x.label === 'Custo' ? 'st-dot-out' : ''}`} /><span><strong>{x.label} · {x.value}</strong><small>{stamp(x.at)} · {x.detail}{x.who ? ' · ' + x.who : ''}</small></span></li>)}
    </ul> : <p className="st-muted">Sem preços registrados.</p>)}
  </>;
}

type FormProps = { product: Product; setBusy: (b: boolean) => void; onDone: (p: Product, message: string) => void };

function useSubmit(setBusy: (b: boolean) => void) {
  const [pending, setPending] = useState(false), [error, setError] = useState('');
  async function run(task: () => Promise<void>) {
    if (pending) return;
    setPending(true); setBusy(true); setError('');
    try { await task(); } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível salvar.'); }
    finally { setPending(false); setBusy(false); }
  }
  return { pending, error, setError, run };
}

function EntryForm({ product: p, setBusy, onDone }: FormProps) {
  const [amount, setAmount] = useState(1);
  const [unitCost, setUnitCost] = useState<number | null>(costCents(p));
  const [date, setDate] = useState(today);
  const [supplier, setSupplier] = useState('');
  const [request] = useState(() => ({ key: '', id: '' }));
  const { pending, error, setError, run } = useSubmit(setBusy);
  const total = unitCost === null ? 0 : Math.round(unitCost * amount);
  const submit = () => {
    if (amount <= 0) return setError('Informe a quantidade.');
    if (!unitCost) return setError('Informe o custo por unidade.');
    const whole = Number.isInteger(amount);
    const body = { productId: p.id, purchasedAt: date, packaging: whole ? 'unit' : 'package', packageCount: whole ? amount : 1, unitsPerPackage: whole ? 1 : amount, totalCents: total, supplier: supplier.trim(), notes: '' };
    const key = JSON.stringify(body);
    if (request.key !== key) Object.assign(request, { key, id: crypto.randomUUID() });
    return run(async () => {
      await api('entries', json('POST', { ...body, requestId: request.id }));
      const { products } = await api<{ products: Product[] }>('products');
      onDone(products.find(x => x.id === p.id)!, `+${qty(amount)} ${units[p.unit]} no estoque`);
    });
  };
  return <form className="st-form" onSubmit={e => { e.preventDefault(); void submit(); }}>
    <div className="st-field"><span>Quantidade</span><Stepper label="Quantidade" value={amount} min={0} onChange={setAmount} decimals={p.unit !== 'un'} /></div>
    <div className="st-field"><span>Custo por {unitNames[p.unit]}</span><MoneyInput label="Custo por unidade" value={unitCost} onChange={setUnitCost} large /></div>
    <div className="st-total-box"><div className="st-total"><span>Total da compra</span><strong>{money(total)}</strong></div></div>
    <details className="st-more"><summary>Data e fornecedor</summary>
      <label className="st-field"><span>Data da compra</span><input type="date" value={date} min="2000-01-01" max="2100-12-31" onChange={e => setDate(e.target.value || today())} /></label>
      <label className="st-field"><span>Fornecedor</span><input value={supplier} maxLength={160} onChange={e => setSupplier(e.target.value)} placeholder="Opcional" /></label>
    </details>
    <p className="st-hint">A compra entra no financeiro e vira o custo atual do produto.</p>
    <ErrorText>{error}</ErrorText>
    <button className="primary st-block" disabled={pending}>{pending ? 'Salvando…' : 'Adicionar ao estoque'}</button>
  </form>;
}

function PriceForm({ product: p, setBusy, onDone }: FormProps) {
  const [price, setPrice] = useState<number | null>(p.salePriceCents);
  const { pending, error, setError, run } = useSubmit(setBusy);
  const cost = costCents(p), m = margin(cost, price);
  return <form className="st-form" onSubmit={e => {
    e.preventDefault();
    if (price === null) return setError('Informe o preço.');
    void run(async () => { const { product } = await api<{ product: Product }>(`products/${p.id}/price`, json('PUT', { salePriceCents: price })); onDone(product, 'Preço atualizado'); });
  }}>
    <div className="st-field"><span>Novo preço de venda</span><MoneyInput label="Preço de venda" value={price} onChange={setPrice} large autoFocus /></div>
    <div className="st-compare">
      <div><span>Atual</span><strong>{p.salePriceCents === null ? '—' : money(p.salePriceCents)}</strong></div>
      <div><span>Custo</span><strong>{cost === null ? '—' : money(cost)}</strong></div>
      <div><span>Margem</span><strong className={m !== null && m < 0 ? 'st-neg' : ''}>{m === null ? '—' : m + '%'}</strong></div>
    </div>
    <ErrorText>{error}</ErrorText>
    <button className="primary st-block" disabled={pending}>{pending ? 'Salvando…' : 'Salvar preço'}</button>
  </form>;
}

function CountForm({ product: p, setBusy, onDone }: FormProps) {
  const [counted, setCounted] = useState(Math.max(0, p.stock));
  const { pending, error, run } = useSubmit(setBusy);
  const diff = Math.round((counted - p.stock) * 1000) / 1000;
  return <form className="st-form" onSubmit={e => {
    e.preventDefault();
    void run(async () => { const { product } = await api<{ product: Product }>(`products/${p.id}/count`, json('POST', { counted })); onDone(product, diff ? `Estoque corrigido (${diff > 0 ? '+' : ''}${qty(diff)})` : 'Estoque conferido'); });
  }}>
    <p className="st-hint">Quantos você tem de verdade na loja?</p>
    <div className="st-field st-center"><Stepper label="Quantidade contada" value={counted} min={0} onChange={setCounted} decimals={p.unit !== 'un'} /></div>
    <div className="st-compare">
      <div><span>No sistema</span><strong>{qty(p.stock)}</strong></div>
      <div><span>Diferença</span><strong className={diff < 0 ? 'st-neg' : ''}>{diff > 0 ? '+' : ''}{qty(diff)}</strong></div>
    </div>
    <p className="st-hint">Use para quebras, perdas ou acertos. Não mexe no financeiro.</p>
    <ErrorText>{error}</ErrorText>
    <button className="primary st-block" disabled={pending}>{pending ? 'Salvando…' : 'Confirmar contagem'}</button>
  </form>;
}

function EditForm({ product: p, colors, brands, setBusy, onDone, onCatalog }: FormProps & { colors: CatalogItem[]; brands: CatalogItem[]; onCatalog: () => void }) {
  const [name, setName] = useState(p.name);
  const [category, setCategory] = useState<Category | ''>(p.category ?? '');
  const [colorId, setColorId] = useState(p.colorId ?? '');
  const [brandId, setBrandId] = useState(p.brandId ?? '');
  const [unit, setUnit] = useState<Unit>(p.unit);
  const [minStock, setMinStock] = useState(p.minStock);
  const { pending, error, run } = useSubmit(setBusy);
  async function photo(file: File | undefined) {
    if (!file) return;
    await run(async () => { await uploadPhoto(p.id, file); const { products } = await api<{ products: Product[] }>('products'); onDone(products.find(x => x.id === p.id)!, 'Foto salva'); });
  }
  return <form className="st-form" onSubmit={e => {
    e.preventDefault();
    void run(async () => {
      const { product } = await api<{ product: Product }>(`products/${p.id}`, json('PUT', { name, type: p.type, unit, category: category || null, colorId: colorId || null, brandId: category === 'tshirt' ? brandId || null : null, minStock, notes: p.notes }));
      onDone(product, 'Produto atualizado');
    });
  }}>
    <label className="st-photo-pick"><Thumb product={p} size={64} /><span><Icon name="camera" size={16} /> {p.photoUrl ? 'Trocar foto' : 'Adicionar foto'}</span><input type="file" accept="image/*" hidden onChange={e => void photo(e.target.files?.[0])} /></label>
    <label className="st-field"><span>Nome</span><input value={name} onChange={e => setName(e.target.value)} maxLength={120} required /></label>
    {p.type === 'resale' && <div className="st-field"><span>Categoria</span><Chips label="Categoria" value={category} onChange={setCategory} options={Object.entries(categories).map(([id, c]) => [id as Category, c.label])} /></div>}
    {category && <CatalogPicker label="Cor" resource="colors" items={colors} value={colorId} onChange={setColorId} onCreated={onCatalog} />}
    {category === 'tshirt' && <CatalogPicker label="Marca" resource="brands" items={brands} value={brandId} onChange={setBrandId} onCreated={onCatalog} />}
    {p.type === 'consumption' && <div className="st-field"><span>Unidade</span><Chips label="Unidade" value={unit} onChange={setUnit} options={Object.entries(units) as [Unit, string][]} /></div>}
    <div className="st-field"><span>Avisar quando tiver menos de</span><Stepper label="Estoque mínimo" value={minStock} min={0} onChange={setMinStock} /></div>
    <ErrorText>{error}</ErrorText>
    <button className="primary st-block" disabled={pending}>{pending ? 'Salvando…' : 'Salvar'}</button>
  </form>;
}

export function CatalogPicker({ label, resource, items, value, onChange, onCreated }: { label: string; resource: 'colors' | 'brands'; items: CatalogItem[]; value: string; onChange: (id: string) => void; onCreated: () => void }) {
  const [adding, setAdding] = useState(false), [name, setName] = useState(''), [error, setError] = useState(''), [pending, setPending] = useState(false);
  async function create() {
    if (!name.trim() || pending) return;
    setPending(true); setError('');
    try { const { item } = await api<{ item: CatalogItem }>(resource, json('POST', { name })); onCreated(); onChange(item.id); setAdding(false); setName(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'Erro'); } finally { setPending(false); }
  }
  return <div className="st-field"><span>{label}</span>
    <div className="st-chips st-chips-scroll" role="group" aria-label={label}>
      <button type="button" aria-pressed={!value} onClick={() => onChange('')}>Nenhuma</button>
      {items.map(i => <button type="button" key={i.id} aria-pressed={value === i.id} onClick={() => onChange(i.id)}>{i.name}</button>)}
      <button type="button" className="st-chip-add" onClick={() => setAdding(true)}><Icon name="plus" size={14} /> Nova</button>
    </div>
    {adding && <div className="st-inline-add"><input autoFocus value={name} maxLength={60} onChange={e => setName(e.target.value)} placeholder={`Nova ${label.toLowerCase()}`} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void create(); } }} /><button type="button" className="primary" onClick={() => void create()} disabled={pending}>OK</button><button type="button" className="st-icon-btn" onClick={() => setAdding(false)} aria-label="Cancelar"><Icon name="close" size={18} /></button></div>}
    <ErrorText>{error}</ErrorText>
  </div>;
}
