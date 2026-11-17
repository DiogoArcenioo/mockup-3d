'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '../icons';
import { api, available, type Cart, type CatalogItem, type Product } from './lib';
import { SellView } from './sell';
import { ProductSheet, ProductsView } from './products';
import { ProductWizard } from './wizard';
import { OrdersView } from './orders';
import './store.css';

export type Tab = 'vender' | 'produtos' | 'vendas';
const tabs: [Tab, string, string][] = [['vender', 'Vender', 'cart'], ['produtos', 'Produtos', 'box'], ['vendas', 'Vendas', 'history']];
const CART_KEY = 'infinity-cart';

export function StockApp({ initialTab, openWizard }: { initialTab: Tab; openWizard: boolean }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [products, setProducts] = useState<Product[] | null>(null);
  const [colors, setColors] = useState<CatalogItem[]>([]);
  const [brands, setBrands] = useState<CatalogItem[]>([]);
  const [error, setError] = useState('');
  const [wizard, setWizard] = useState(openWizard);
  const [selected, setSelected] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [salesVersion, setSalesVersion] = useState(0);
  const [cart, setCartState] = useState<Cart>({});
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // O carrinho sobrevive a uma troca de tela durante o atendimento.
  useEffect(() => { try { const saved = sessionStorage.getItem(CART_KEY); if (saved) setCartState(JSON.parse(saved)); } catch { /* sem armazenamento */ } }, []);
  const setCart = useCallback((next: Cart) => { setCartState(next); try { sessionStorage.setItem(CART_KEY, JSON.stringify(next)); } catch { /* sem armazenamento */ } }, []);

  const load = useCallback(async () => {
    try {
      const [p, c, b] = await Promise.all([api<{ products: Product[] }>('products'), api<{ colors: CatalogItem[] }>('colors'), api<{ brands: CatalogItem[] }>('brands')]);
      setProducts(p.products); setColors(c.colors); setBrands(b.brands); setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível carregar.'); }
  }, []);
  const loadCatalog = useCallback(() => { void Promise.all([api<{ colors: CatalogItem[] }>('colors'), api<{ brands: CatalogItem[] }>('brands')]).then(([c, b]) => { setColors(c.colors); setBrands(b.brands); }).catch(() => {}); }, []);
  useEffect(() => { void load(); }, [load]);

  // Remove do carrinho o que não existe mais ou ficou sem estoque.
  useEffect(() => {
    if (!products) return;
    const byId = new Map(products.map(p => [p.id, p]));
    let changed = false; const next: Cart = {};
    for (const [id, line] of Object.entries(cart)) {
      const p = line.productId ? byId.get(line.productId) : undefined;
      const q = p ? Math.min(line.quantity, available(p, line.size ?? null)) : 0;
      if (q > 0) next[id] = q === line.quantity ? line : { ...line, quantity: q };
      if (q !== line.quantity) changed = true;
    }
    if (changed) setCart(next);
  }, [products]); // eslint-disable-line react-hooks/exhaustive-deps

  function notify(message: string) { clearTimeout(toastTimer.current); setToast(message); toastTimer.current = setTimeout(() => setToast(''), 3000); }
  function select(next: Tab) { setTab(next); try { history.replaceState(null, '', `/estoque?aba=${next}`); } catch { /* ignore */ } }
  const replace = (p: Product) => setProducts(list => list ? (list.some(x => x.id === p.id) ? list.map(x => x.id === p.id ? p : x) : [...list, p].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))) : [p]);
  const current = products?.find(p => p.id === selected) ?? null;
  const cartCount = Object.values(cart).reduce((s, l) => s + l.quantity, 0);

  return <main className="app-content st-page">
    <nav className="st-tabs" aria-label="Estoque">
      {tabs.map(([id, label, icon]) => <button key={id} aria-pressed={tab === id} onClick={() => select(id)}><Icon name={icon} size={18} /><span>{label}</span>{id === 'vender' && cartCount > 0 && <b>{cartCount}</b>}</button>)}
    </nav>
    {error && <div className="st-error" role="alert">{error} <button className="quiet" onClick={() => void load()}>Tentar de novo</button></div>}
    {!products && !error && <p className="st-muted">Carregando…</p>}
    {products && tab === 'vender' && <SellView products={products} cart={cart} setCart={setCart} onNewProduct={() => setWizard(true)} onSold={() => { setSalesVersion(v => v + 1); void load(); }} />}
    {products && tab === 'produtos' && <ProductsView products={products} onOpen={p => setSelected(p.id)} onNew={() => setWizard(true)} />}
    {tab === 'vendas' && <OrdersView refresh={salesVersion} />}
    {wizard && <ProductWizard colors={colors} brands={brands} onCatalog={loadCatalog} onClose={() => setWizard(false)} onCreated={replace} />}
    {current && <ProductSheet product={current} colors={colors} brands={brands} onCatalog={loadCatalog} onClose={() => setSelected(null)} onSaved={(p, message) => { replace(p); notify(message); }} notice={toast} />}
    {toast && !current && <div className="st-toast" role="status"><Icon name="check" size={16} /> {toast}</div>}
  </main>;
}
