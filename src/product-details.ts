import type { Product, EntryPage, Unit, Category } from './finance-types';
import { icon } from './icons';
import { photoMarkup, bindProductPhoto } from './product-photo';
const esc=(value:unknown)=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const number=(value:number)=>value.toLocaleString('pt-BR',{maximumFractionDigits:3});
const money=(value:number)=>value.toLocaleString('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:value>0&&value<.01?6:2});
const date=(value:string)=>new Date(value.slice(0,10)+'T12:00:00').toLocaleDateString('pt-BR');

export function openProductDetails({product:p,units,shortUnits,categories,api,onEdit,onHistory,onEntry,onSale,onPhotoChanged}:{product:Product;units:Record<Unit,string>;shortUnits:Record<Unit,string>;categories:Record<Category,string>;api:<T>(path:string,options?:RequestInit)=>Promise<T>;onEdit:()=>void;onHistory:()=>void;onEntry:()=>void;onSale:()=>void;onPhotoChanged:(url:string|null)=>void}){
  const dialog=document.getElementById('detail-dialog') as HTMLDialogElement;
  dialog.classList.add('f-product-details');
  const low=p.minStock>0&&p.stock<p.minStock;
  dialog.innerHTML=`<div class="f-detail-cover">${photoMarkup(p,true)}<button class="f-detail-close" id="close-detail" aria-label="Fechar detalhes">${icon('close')}</button></div><div class="f-detail-body"><div class="f-eyebrow">DETALHES DO PRODUTO</div><h2 id="detail-title">${esc(p.name)}</h2><p class="f-detail-subtitle">${esc([p.category?categories[p.category]:'Sem categoria',p.colorName,p.brandName].filter(Boolean).join(' · '))}</p>
    <div class="f-photo-actions"><input id="product-photo-input" type="file" accept="image/jpeg,image/png,image/webp" hidden/><button class="f-secondary" id="change-product-photo">${icon('image')} ${p.photoUrl?'Trocar foto':'Adicionar foto'}</button><button class="f-secondary" id="remove-product-photo" ${p.photoUrl?'':'hidden'}>${icon('close')} Remover foto</button></div><p class="f-photo-help">JPG, PNG ou WebP · até 10 MB</p><p id="product-photo-status" class="f-photo-status" role="status"></p><p id="product-photo-error" class="f-form-error" role="alert" hidden></p>
    <div class="f-detail-balance"><div><span>Em estoque</span><strong>${number(p.stock)} <small>${shortUnits[p.unit]}</small></strong></div><div><span>Estoque mínimo</span><strong>${number(p.minStock)} <small>${shortUnits[p.unit]}</small></strong></div></div>${low?`<div class="f-low">${icon('alert')} Abaixo do estoque mínimo de ${number(p.minStock)} ${shortUnits[p.unit]}</div>`:''}
    <h3 class="f-detail-section-title">Custos e compras</h3><div class="f-detail-numbers"><div><span>Último custo</span><strong>${p.lastCost===null?'—':money(p.lastCost)}</strong></div><div><span>Custo médio de compra</span><strong>${p.averageCost===null?'—':money(p.averageCost)}</strong></div><div><span>Total em compras</span><strong>${money(p.purchaseTotalCents/100)}</strong></div><div><span>Quantidade comprada</span><strong>${number(p.purchasedQuantity)} <small>${shortUnits[p.unit]}</small></strong></div></div><p class="f-detail-explanation">A média considera o valor e a quantidade de todas as compras.</p>
    <dl class="f-detail-specs"><div><dt>Categoria</dt><dd>${esc(p.category?categories[p.category]:'Sem categoria')}</dd></div><div><dt>Finalidade</dt><dd>${p.type==='resale'?'Revenda':'Uso e consumo'}</dd></div><div><dt>Cor</dt><dd>${esc(p.colorName||'Sem cor')}</dd></div>${p.category==='tshirt'?`<div><dt>Marca</dt><dd>${esc(p.brandName||'Sem marca')}</dd></div>`:''}<div><dt>Unidade</dt><dd>${units[p.unit]}</dd></div><div><dt>Última compra</dt><dd>${p.lastPurchaseDate?date(p.lastPurchaseDate):'Ainda sem compras'}</dd></div></dl>
    ${p.notes?`<h3 class="f-detail-section-title">Observações</h3><p class="f-detail-notes">${esc(p.notes)}</p>`:''}
    <div class="f-detail-actions"><button class="f-secondary" id="detail-edit">${icon('edit')} Editar produto</button><button class="f-secondary" id="detail-all">${icon('history')} Histórico</button><button class="f-secondary" id="detail-entry">${icon('plus')} Entrada</button>${p.type==='resale'?`<button class="f-secondary" id="detail-sale">${icon('arrow')} Venda</button>`:''}</div>
    <details class="f-detail-price-history"><summary>Custos das últimas compras ${icon('arrow')}</summary><div id="detail-history" class="f-price-list"></div></details></div>`;
  const action=(id:string,callback:()=>void)=>{const button=dialog.querySelector<HTMLButtonElement>('#'+id);if(button)button.onclick=()=>{dialog.close();callback();};};
  action('close-detail',()=>{});action('detail-edit',onEdit);action('detail-all',onHistory);action('detail-entry',onEntry);action('detail-sale',onSale);
  bindProductPhoto({product:p,dialog,api,onChanged:onPhotoChanged});
  const details=dialog.querySelector<HTMLDetailsElement>('.f-detail-price-history')!;
  const results=dialog.querySelector<HTMLElement>('#detail-history')!;
  let loaded=false,busy=false;
  details.ontoggle=async()=>{
    if(!details.open||loaded||busy)return;busy=true;results.textContent='Carregando compras…';
    try{const page=await api<EntryPage>('entries?'+new URLSearchParams({productId:p.id,page:'1'}));
      results.innerHTML=page.entries.length?page.entries.map(entry=>`<div class="f-price-row"><div><strong>${date(entry.purchasedAt)}</strong><span>${number(entry.quantity)} ${shortUnits[entry.unit]}${entry.supplier?' · '+esc(entry.supplier):''}</span></div><div><strong>${money(entry.unitCost)}<small> / ${shortUnits[entry.unit]}</small></strong><span>Total: ${money(entry.totalCents/100)}</span></div></div>`).join(''):'<p class="f-detail-explanation">A primeira compra inicia seu histórico de custos.</p>';loaded=true;
    }catch{results.textContent='Não foi possível carregar. Recolha e expanda para tentar novamente.';}finally{busy=false;}
  };
  dialog.showModal();
}
