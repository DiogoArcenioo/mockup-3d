export type ProductType = 'resale' | 'consumption';
export type Category = 'mug' | 'tshirt' | 'mobile_accessory';
export interface CatalogItem { id: string; name: string }
export type Unit = 'un' | 'folha' | 'rolo' | 'ml' | 'l' | 'g' | 'kg';
export interface Product {
  id: string; name: string; type: ProductType; unit: Unit; minStock: number; notes: string;
  category: Category | null; colorId: string | null; colorName: string | null; brandId: string | null; brandName: string | null;
  photoUrl:string|null;
  stock: number; purchaseTotalCents: number; purchasedQuantity: number;
  averageCost: number | null; lastCost: number | null; lastPurchaseDate: string | null; hasEntries: boolean;
}
export interface Entry {
  id: string; productId: string; productName: string; productType: ProductType; unit: Unit;
  productCategory: Category | null; productColor: string; productBrand: string;
  purchasedAt: string; packaging: string; packageCount: number; unitsPerPackage: number;
  quantity: number; totalCents: number; unitCost: number; supplier: string; notes: string;
}
export interface EntryPage { entries: Entry[]; count: number; totalCents: number; page: number; pages: number }
export interface Sale { id:string;productId:string;productName:string;quantity:number;totalCents:number;unitPrice:number;soldAt:string }
export interface Movement extends Entry { kind:'purchase'|'sale';customer:string }
export interface MovementPage { entries:Movement[];count:number;purchaseTotalCents:number;salesTotalCents:number;page:number;pages:number }
