import { icon } from './icons';
import type { Product, CatalogItem, Category, Unit } from './finance-types';

type EditorOptions = {
  product?:Product; colors:CatalogItem[]; brands:CatalogItem[];
  categories:Record<Category,string>; units:Record<Unit,string>;
  api:<T>(path:string, options?:RequestInit)=>Promise<T>;
  onSaved:(product:Product)=>void;
};
const esc = (value:unknown) => String(value ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const el = <T extends HTMLElement=HTMLElement>(id:string) => document.getElementById(id) as T;
const options = (items:CatalogItem[], selected:string|null|undefined, empty:string) => `<option value="">${empty}</option>`+items.map(item=>`<option value="${item.id}" ${item.id===selected?'selected':''}>${esc(item.name)}</option>`).join('');

function picker(resource:'color'|'brand', label:string, items:CatalogItem[], selected?:string|null) {
  const noun=resource==='color'?'cor':'marca';
  return `<div class="f-catalog-field" id="${resource}-field" hidden>
    <label class="f-picker-label" for="product-${resource}">${label} <span class="f-optional">opcional</span></label>
    <div class="f-picker-controls"><select id="product-${resource}" name="${resource}Id">${options(items,selected,'Sem '+noun)}</select><button type="button" class="f-secondary" id="add-${resource}">${icon('plus')} Cadastrar</button></div>
    <div class="f-quick-create" id="new-${resource}" hidden><label class="f-picker-label" for="new-${resource}-name">Nome da ${noun}</label><div class="f-quick-controls"><input id="new-${resource}-name" maxlength="60" autocomplete="off" placeholder="${resource==='color'?'Ex.: Azul-marinho':'Ex.: Puma'}"/><button type="button" class="f-primary" id="save-${resource}">Cadastrar</button><button type="button" class="f-icon-button" id="cancel-${resource}" aria-label="Cancelar cadastro de ${noun}">${icon('close')}</button></div><p class="f-form-error" id="${resource}-error" role="alert" hidden></p></div>
  </div>`;
}

export function openProductEditor({product, colors, brands, categories, units, api, onSaved}:EditorOptions) {
  const dialog=el<HTMLDialogElement>('product-dialog');
  let busy=false;
  let controls:{node:HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement|HTMLButtonElement;disabled:boolean}[]=[];
  dialog.innerHTML=`<div class="f-dialog-top"><span class="f-eyebrow">CADASTRO DE PRODUTO</span><button type="button" class="f-icon-button" data-close aria-label="Fechar">${icon('close')}</button></div><h2 id="product-title">${product?'Editar produto':'O que você vai controlar?'}</h2><p>Escolha a categoria. Os detalhes são opcionais.</p>
    <form id="product-form"><label class="f-field">Nome do produto<input name="name" value="${esc(product?.name)}" placeholder="Ex.: Caneca 325 ml, camiseta ou capinha" maxlength="120" autocomplete="off" required/></label>
    <label class="f-field">Categoria<select name="category" id="product-category"><option value="">Selecione a categoria</option>${Object.entries(categories).map(([value,label])=>`<option value="${value}" ${product?.category===value?'selected':''}>${label}</option>`).join('')}</select><span class="f-hint">Use a categoria para encontrar seus produtos depois.</span></label>
    ${picker('color','Cor',colors,product?.colorId)}${picker('brand','Marca',brands,product?.brandId)}
    <fieldset class="f-type-options"><legend>Como você usa esse produto?</legend>${[['resale','mug','Produto para revenda','Vai para o cliente, como uma caneca.'],['consumption','droplet','Produto para uso e consumo','Usado na produção, como tinta e papel.']].map(([value,symbol,title,description])=>`<label><input type="radio" name="type" value="${value}" ${(product?.type??'resale')===value?'checked':''}/><span>${icon(symbol)}<strong>${title}</strong><small>${description}</small></span></label>`).join('')}</fieldset>
    <div class="f-form-row"><label class="f-field">Unidade de controle<select name="unit" ${product?.hasEntries?'disabled':''}>${Object.entries(units).map(([value,label])=>`<option value="${value}" ${(product?.unit??'un')===value?'selected':''}>${label}</option>`).join('')}</select></label><label class="f-field">Estoque mínimo <span class="f-optional">opcional</span><input name="minStock" inputmode="decimal" value="${String(product?.minStock??0).replace('.',',')}" placeholder="0"/></label></div>
    ${product?.hasEntries?'<p class="f-hint">A unidade fica fixa após a primeira movimentação.</p>':''}<label class="f-field">Observações <span class="f-optional">opcional</span><textarea name="notes" rows="2" maxlength="1000" placeholder="Detalhes que ajudam no dia a dia">${esc(product?.notes)}</textarea></label><p id="product-error" class="f-form-error" role="alert" hidden></p><div class="f-dialog-footer"><button type="button" class="f-secondary" data-close>Cancelar</button><button type="submit" class="f-primary" id="save-product">${icon('check')} Salvar produto</button></div></form>`;
  const form=el<HTMLFormElement>('product-form');
  const category=el<HTMLSelectElement>('product-category');
  function setError(id:string,message:string) { el(id).textContent=message;el(id).hidden=!message; }
  function setBusy(value:boolean) {
    busy=value;dialog.dataset.busy=String(value);
    if(value){ controls=[...dialog.querySelectorAll<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement|HTMLButtonElement>('input,select,textarea,button')].map(node=>({node,disabled:node.disabled}));controls.forEach(({node})=>node.disabled=true); }
    else controls.forEach(({node,disabled})=>node.disabled=disabled);
  }
  function updateFields() {
    category.required=form.querySelector<HTMLInputElement>('input[name=type]:checked')?.value==='resale';
    for(const resource of ['color','brand'] as const){
      const enabled=resource==='color'?Boolean(category.value):category.value==='tshirt';
      el(resource+'-field').hidden=!enabled;
      const select=el<HTMLSelectElement>('product-'+resource);select.disabled=!enabled;
      if(!enabled){select.value='';el('new-'+resource).hidden=true;el<HTMLInputElement>('new-'+resource+'-name').value='';setError(resource+'-error','');}
    }
  }
  category.onchange=updateFields;
  form.querySelectorAll<HTMLInputElement>('input[name=type]').forEach(input=>input.onchange=updateFields);
  dialog.querySelectorAll<HTMLButtonElement>('[data-close]').forEach(button=>button.onclick=()=>{if(!busy)dialog.close();});
  dialog.oncancel=event=>{if(busy)event.preventDefault();};

  for(const [resource,items] of [['color',colors],['brand',brands]] as const){
    const input=el<HTMLInputElement>('new-'+resource+'-name');
    const panel=el('new-'+resource);
    const cancel=()=>{panel.hidden=true;input.value='';setError(resource+'-error','');el('add-'+resource).focus();};
    el('add-'+resource).onclick=()=>{panel.hidden=false;input.focus();};
    el('cancel-'+resource).onclick=cancel;
    async function create(){
      if(busy)return;
      const name=input.value.trim();
      if(!name){setError(resource+'-error','Digite o nome da '+(resource==='color'?'cor.':'marca.'));input.focus();return;}
      setError(resource+'-error','');setBusy(true);
      const button=el<HTMLButtonElement>('save-'+resource);button.textContent='Cadastrando…';
      try{
        const {item}=await api<{item:CatalogItem}>(resource==='color'?'colors':'brands',{method:'POST',body:JSON.stringify({name})});
        if(!items.some(existing=>existing.id===item.id))items.push(item);
        items.sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
        el<HTMLSelectElement>('product-'+resource).innerHTML=options(items,item.id,'Sem '+(resource==='color'?'cor':'marca'));
        panel.hidden=true;input.value='';
      }catch(error){setError(resource+'-error',error instanceof Error?error.message:'Não foi possível cadastrar. Tente novamente.');}
      finally{button.textContent='Cadastrar';setBusy(false);if(panel.hidden)el('product-'+resource).focus();}
    }
    el('save-'+resource).onclick=()=>void create();
    input.onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();void create();}if(event.key==='Escape'){event.preventDefault();event.stopPropagation();if(!busy)cancel();}};
  }

  form.onsubmit=async event=>{
    event.preventDefault();if(busy||!form.reportValidity())return;
    // Prevent accidentally saving the product while a quick-create name is unfinished.
    for(const resource of ['color','brand'])if(!el('new-'+resource).hidden){setError(resource+'-error','Cadastre ou cancele este detalhe antes de salvar o produto.');el('new-'+resource+'-name').focus();return;}
    const data=new FormData(form);
    const raw=String(data.get('minStock')||'0').trim();
    const minStock=/^\d+(?:[,.]\d{1,3})?$/.test(raw)?Number(raw.replace(',','.')):NaN;
    if(!Number.isFinite(minStock)||minStock<0){setError('product-error','Informe um estoque mínimo válido.');return;}
    setError('product-error','');setBusy(true);const button=el<HTMLButtonElement>('save-product');button.textContent='Salvando…';
    try{
      const {product:saved}=await api<{product:Product}>(product?'products/'+product.id:'products',{method:product?'PUT':'POST',body:JSON.stringify({name:data.get('name'),type:data.get('type'),category:data.get('category')||null,colorId:data.get('colorId')||null,brandId:data.get('brandId')||null,unit:product?.hasEntries?product.unit:data.get('unit'),minStock,notes:data.get('notes')})});
      dialog.close();onSaved(saved);
    }catch(error){setError('product-error',error instanceof Error?error.message:'Não foi possível salvar. Tente novamente.');}
    finally{button.innerHTML=icon('check')+' Salvar produto';setBusy(false);}
  };
  updateFields();dialog.showModal();
}
