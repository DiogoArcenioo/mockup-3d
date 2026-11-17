export class ValidationError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

export const UNITS = ['un', 'folha', 'rolo', 'ml', 'l', 'g', 'kg'];
export const TYPES = ['resale', 'consumption'];
export const CATEGORIES = ['mug', 'tshirt', 'mobile_accessory'];
export function textField(value, label, max, required = false) {
  if (value === undefined || value === null) value = '';
  if (typeof value !== 'string') throw new ValidationError(`${label} inválido.`);
  const result = value.trim();
  if ((required && !result) || result.length > max) throw new ValidationError(`${label}: ${required ? 'preencha até' : 'use até'} ${max} caracteres.`);
  return result;
}
export function quantity(value, label, allowZero = false) {
  if (!['number', 'string'].includes(typeof value) || !/^\d+(\.\d{1,3})?$/.test(String(value))) throw new ValidationError(`${label}: use até 3 casas decimais.`);
  const n = Number(value);
  if (!Number.isFinite(n) || n < (allowZero ? 0 : 0.001) || n > 1000000) throw new ValidationError(`${label} fora do limite permitido.`);
  return n;
}
export function productInput(body = {}) {
  const name = textField(body.name, 'Nome', 120, true);
  if (!TYPES.includes(body.type)) throw new ValidationError('Escolha Revenda ou Uso e consumo.');
  if (!UNITS.includes(body.unit)) throw new ValidationError('Escolha uma unidade válida.');
  const category = body.category === '' || body.category == null ? null : body.category;
  if (category !== null && !CATEGORIES.includes(category)) throw new ValidationError('Escolha uma categoria válida.');
  if (body.type === 'resale' && !category) throw new ValidationError('Escolha a categoria do produto.');
  const colorId = body.colorId === '' || body.colorId == null ? null : uuid(body.colorId);
  const brandId = body.brandId === '' || body.brandId == null ? null : uuid(body.brandId);
  if (colorId && !category) throw new ValidationError('Escolha uma categoria antes de informar a cor.');
  if (brandId && category !== 'tshirt') throw new ValidationError('Marca está disponível apenas para camisetas.');
  return { name, type: body.type, unit: body.unit, category, colorId, brandId, sizes: sizesInput(body.sizes, category), minStock: quantity(body.minStock ?? 0, 'Estoque mínimo', true), notes: textField(body.notes, 'Observações', 1000) };
}
export function sizeInput(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 10) throw new ValidationError('Tamanho inválido.');
  return value.trim().toUpperCase();
}
function sizesInput(value, category) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 15) throw new ValidationError('Tamanhos inválidos.');
  const sizes = [...new Set(value.map(sizeInput).filter(Boolean))];
  if (sizes.length && category !== 'tshirt') throw new ValidationError('Tamanhos estão disponíveis apenas para camisetas.');
  return sizes;
}
export function dateInput(value, label = 'Data') {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(`${value}T12:00:00Z`)) || new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) !== value || value < '2000-01-01' || value > '2100-12-31') throw new ValidationError(`${label} inválida.`);
  return value;
}
export function uuid(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new ValidationError('Identificador inválido.');
  return value;
}
export function entryInput(body = {}) {
  const packageCount = quantity(body.packageCount, 'Quantidade de embalagens');
  if (!Number.isInteger(packageCount)) throw new ValidationError('Quantidade de embalagens deve ser inteira.');
  const unitsPerPackage = quantity(body.unitsPerPackage, 'Quantidade por embalagem');
  const totalQuantity = Math.round(packageCount * Math.round(unitsPerPackage * 1000)) / 1000;
  if (totalQuantity > 1000000) throw new ValidationError('A entrada deve ter até 1.000.000 de unidades.');
  if (!Number.isSafeInteger(body.totalCents) || body.totalCents <= 0 || body.totalCents > 10000000000) throw new ValidationError('Informe um valor total válido, maior que zero.');
  if (!['unit', 'box', 'package'].includes(body.packaging)) throw new ValidationError('Embalagem inválida.');
  if (body.packaging === 'unit' && unitsPerPackage !== 1) throw new ValidationError('Para entrada avulsa, a quantidade por embalagem é 1.');
  return { productId: uuid(body.productId), requestId: uuid(body.requestId), purchasedAt: dateInput(body.purchasedAt), packageCount, unitsPerPackage, totalQuantity, totalCents: body.totalCents, packaging: body.packaging, size: sizeInput(body.size), supplier: textField(body.supplier, 'Fornecedor', 160), notes: textField(body.notes, 'Observações', 1000) };
}

export function saleInput(body = {}) {
  if(!body||typeof body!=='object'||Array.isArray(body))throw new ValidationError('Dados de venda inválidos.');
  const amount=quantity(body.quantity,'Quantidade vendida');
  if (!Number.isSafeInteger(body.totalCents) || body.totalCents<=0 || body.totalCents>10000000000) throw new ValidationError('Informe o valor total da venda, maior que zero.');
  return { productId:uuid(body.productId),requestId:uuid(body.requestId),soldAt:dateInput(body.soldAt,'Data da venda'),quantity:amount,totalCents:body.totalCents,customer:textField(body.customer,'Cliente',160),notes:textField(body.notes,'Observações',1000) };
}

export function cents(value, label, allowNull = false) {
  if (allowNull && (value === null || value === undefined || value === '')) return null;
  if (!Number.isSafeInteger(value) || value < 0 || value > 10000000000) throw new ValidationError(`${label}: informe um valor válido.`);
  return value;
}
// Custos unitários podem ter frações de centavo (ex.: caixa de R$ 100,00 com 7 unidades).
export function unitCost(value, label = 'Preço de custo', allowNull = true) {
  if (allowNull && (value === null || value === undefined || value === '')) return null;
  if (!['number', 'string'].includes(typeof value) || !/^\d+(\.\d{1,6})?$/.test(String(value))) throw new ValidationError(`${label}: informe um valor válido.`);
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 100000000) throw new ValidationError(`${label} fora do limite permitido.`);
  return n;
}
export const PAYMENTS = ['', 'pix', 'cash', 'card'];
export function orderInput(body = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ValidationError('Dados de venda inválidos.');
  if (!Array.isArray(body.items) || !body.items.length) throw new ValidationError('Adicione pelo menos um produto ao carrinho.');
  if (body.items.length > 100) throw new ValidationError('Use até 100 itens por venda.');
  const items = body.items.map(item => {
    if (!item || typeof item !== 'object') throw new ValidationError('Item inválido.');
    const amount = quantity(item.quantity, 'Quantidade');
    const price = cents(item.unitPriceCents, 'Preço do item');
    const total = Math.round(price * amount);
    return { productId: uuid(item.productId), size: sizeInput(item.size), quantity: amount, unitPriceCents: price, totalCents: total };
  });
  const totalCents = items.reduce((sum, item) => sum + item.totalCents, 0);
  if (totalCents > 10000000000) throw new ValidationError('O total da venda passou do limite permitido.');
  const paymentMethod = body.paymentMethod ?? '';
  if (!PAYMENTS.includes(paymentMethod)) throw new ValidationError('Forma de pagamento inválida.');
  const onCredit = body.onCredit === true;
  if (onCredit && totalCents <= 0) throw new ValidationError('Venda para devedor precisa ter valor maior que zero.');
  return { requestId: uuid(body.requestId), soldAt: dateInput(body.soldAt, 'Data da venda'), customer: textField(body.customer, 'Cliente', 160, true), paymentMethod: onCredit ? '' : paymentMethod, onCredit, notes: textField(body.notes, 'Observações', 1000), items, totalCents };
}

export const EXPENSE_CATEGORIES = ['Insumos', 'Embalagem', 'Frete', 'Aluguel', 'Contas', 'Marketing', 'Taxas', 'Outros'];
export function debtorInput(body = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ValidationError('Dados inválidos.');
  if (!Number.isSafeInteger(body.totalCents) || body.totalCents <= 0 || body.totalCents > 10000000000) throw new ValidationError('Informe o valor total, maior que zero.');
  return { requestId: uuid(body.requestId), name: textField(body.name, 'Nome', 160, true), items: textField(body.items, 'Produtos', 2000), totalCents: body.totalCents, owedAt: dateInput(body.owedAt ?? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()), 'Data'), notes: textField(body.notes, 'Observação', 1000) };
}
