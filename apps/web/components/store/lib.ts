export type Category = 'mug' | 'tshirt' | 'mobile_accessory';
export type Unit = 'un' | 'folha' | 'rolo' | 'ml' | 'l' | 'g' | 'kg';
export type Product = {
  id: string; name: string; type: 'resale' | 'consumption'; unit: Unit; category: Category | null;
  colorId: string | null; colorName: string | null; brandId: string | null; brandName: string | null;
  photoUrl: string | null; minStock: number; notes: string; stock: number;
  salePriceCents: number | null; costPrice: number | null;
  sizes: string[]; sizeStock: Record<string, number>;
};
export type CatalogItem = { id: string; name: string };
export type OrderItem = { productId: string; name: string; size: string | null; color: string; brand: string; unit: Unit; quantity: number; totalCents: number; listPriceCents: number | null; unitCost: number | null };
export type Order = { id: string; soldAt: string; customer: string; paymentMethod: '' | 'pix' | 'cash' | 'card'; notes: string; totalCents: number; listTotalCents: number; sellerName: string; createdAt: string; onCredit: boolean; debtorStatus: 'open' | 'paid' | 'cancelled' | null; items: OrderItem[] };
export type OrdersPage = { orders: Order[]; count: number; totalCents: number; profitCents: number; itemsWithoutCost: number; page: number; pages: number };
export type CartLine = { productId: string; size: string | null; quantity: number; priceCents: number };
export type Cart = Record<string, CartLine>;

export const categories: Record<Category, { label: string; short: string; icon: string }> = {
  mug: { label: 'Canecas', short: 'Caneca', icon: 'mug' },
  tshirt: { label: 'Camisetas', short: 'Camiseta', icon: 'shirt' },
  mobile_accessory: { label: 'Acessórios', short: 'Acessório', icon: 'phone' },
};
export const units: Record<Unit, string> = { un: 'un.', folha: 'folhas', rolo: 'rolos', ml: 'ml', l: 'l', g: 'g', kg: 'kg' };
export const unitNames: Record<Unit, string> = { un: 'unidade', folha: 'folha', rolo: 'rolo', ml: 'ml', l: 'litro', g: 'grama', kg: 'kg' };
export const payments = { pix: 'Pix', cash: 'Dinheiro', card: 'Cartão' } as const;

export function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = init.body && !(init.body instanceof Blob) ? { 'Content-Type': 'application/json', ...init.headers } : init.headers;
  return fetch('/api/' + path, { cache: 'no-store', signal: AbortSignal.timeout(20000), ...init, headers })
    .catch(() => { throw new Error('Sem conexão. Confira a internet e tente de novo.'); })
    .then(async response => {
      if (response.status === 401) { window.location.replace('/login'); throw new Error('Sua sessão expirou.'); }
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Não foi possível concluir. Tente de novo.');
      return data as T;
    });
}
export const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const money = (cents: number) => brl.format(cents / 100);
export const qty = (value: number) => value.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
export const shiftDate = (iso: string, days: number) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
export const shortDate = (iso: string) => iso.slice(0, 10).split('-').reverse().slice(0, 2).join('/');
export const time = (value: string) => new Intl.DateTimeFormat('pt-BR', { timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(value));
export const stamp = (value: string) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(value));
export const variant = (p: { category: Category | null; colorName?: string | null; brandName?: string | null; type?: string }) =>
  [p.category ? categories[p.category].short : p.type === 'consumption' ? 'Insumo' : null, p.colorName, p.brandName].filter(Boolean).join(' · ');
export const costCents = (p: Product) => p.costPrice === null ? null : Math.round(p.costPrice * 100);
export const isLow = (p: Product) => p.minStock > 0 && p.stock < p.minStock;
/** Margem sobre o preço de venda, em %. */
export const margin = (cost: number | null, price: number | null) => cost === null || !price ? null : Math.round(((price - cost) / price) * 100);

export async function compressImage(file: File): Promise<Blob> {
  if (file.size < 600_000 && ['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Não foi possível ler a foto.')), 'image/jpeg', 0.85));
}
export async function uploadPhoto(productId: string, file: File) {
  const blob = await compressImage(file);
  return api<{ photoUrl: string }>(`products/${productId}/photo`, { method: 'PUT', body: blob, headers: { 'Content-Type': blob.type || 'image/jpeg' } });
}

export const SIZE_PRESETS = ['PP', 'P', 'M', 'G', 'GG', 'XG', 'XGG'];
export const cartKey = (productId: string, size: string | null) => productId + '|' + (size ?? '');
/** Saldo disponível: do tamanho, quando o produto controla tamanhos. */
export const available = (p: Product, size: string | null) => p.sizes.length ? p.sizeStock[size ?? ''] ?? 0 : p.stock;
/** Tamanhos que podem ser vendidos; inclui o saldo antigo sem tamanho, se houver. */
export const sellSizes = (p: Product): (string | null)[] => [...p.sizes, ...((p.sizeStock[''] ?? 0) > 0 ? [null] : [])];
export const sizeLabel = (size: string | null) => size ?? 'Sem tamanho';
