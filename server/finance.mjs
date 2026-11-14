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
  return { name, type: body.type, unit: body.unit, category, colorId, brandId, minStock: quantity(body.minStock ?? 0, 'Estoque mínimo', true), notes: textField(body.notes, 'Observações', 1000) };
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
  return { productId: uuid(body.productId), requestId: uuid(body.requestId), purchasedAt: dateInput(body.purchasedAt), packageCount, unitsPerPackage, totalQuantity, totalCents: body.totalCents, packaging: body.packaging, supplier: textField(body.supplier, 'Fornecedor', 160), notes: textField(body.notes, 'Observações', 1000) };
}

export function saleInput(body = {}) {
  if(!body||typeof body!=='object'||Array.isArray(body))throw new ValidationError('Dados de venda inválidos.');
  const amount=quantity(body.quantity,'Quantidade vendida');
  if (!Number.isSafeInteger(body.totalCents) || body.totalCents<=0 || body.totalCents>10000000000) throw new ValidationError('Informe o valor total da venda, maior que zero.');
  return { productId:uuid(body.productId),requestId:uuid(body.requestId),soldAt:dateInput(body.soldAt,'Data da venda'),quantity:amount,totalCents:body.totalCents,customer:textField(body.customer,'Cliente',160),notes:textField(body.notes,'Observações',1000) };
}
