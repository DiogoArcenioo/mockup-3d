import { icon } from './icons';
import type { Product, Sale, Unit } from './finance-types';
type Payload={productId:string;soldAt:string;quantity:number;totalCents:number;customer:string;notes:string;requestId:string};
const pending=new Map<string,Payload>();
const esc=(value:unknown)=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const el=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const number=(value:number)=>value.toLocaleString('pt-BR',{maximumFractionDigits:3});
const money=(value:number)=>value.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());

export function openSaleEditor({products,productId,shortUnits,api,onSaved}:{products:Product[];productId?:string;shortUnits:Record<Unit,string>;api:<T>(path:string,options?:RequestInit)=>Promise<T>;onSaved:(sale:Sale)=>void}){
  const dialog=el<HTMLDialogElement>('sale-dialog'),available=products.filter(p=>p.type==='resale');
  const draft=productId?pending.get(productId):undefined;
  let busy=false;
  dialog.innerHTML=`<div class="f-dialog-top"><span class="f-eyebrow">SAÍDA DO ESTOQUE · VENDA</span><button type="button" class="f-icon-button" id="close-sale" aria-label="Fechar venda">${icon('close')}</button></div><h2 id="sale-title">Registrar venda</h2><p>Informe a quantidade e o valor total. O estoque é atualizado ao salvar.</p>
    <form id="sale-form"><label class="f-field">Produto<select name="productId" id="sale-product" required><option value="">Selecione um produto</option>${available.map(p=>`<option value="${p.id}" ${p.id===productId?'selected':''}>${esc([p.name,p.colorName,p.brandName].filter(Boolean).join(' · '))}</option>`).join('')}</select></label>
    <p class="f-sale-stock" id="sale-stock" aria-live="polite">Selecione um produto para consultar o estoque.</p>
    <div class="f-form-row"><label class="f-field">Quantidade vendida<input name="quantity" id="sale-quantity" inputmode="decimal" value="${draft?String(draft.quantity).replace('.',','):'1'}" required/></label><label class="f-field">Valor total da venda (R$)<input name="total" id="sale-total" inputmode="decimal" value="${draft?String(draft.totalCents/100).replace('.',','):''}" placeholder="Ex.: 35,00" required/><span class="f-hint">Valor total de todas as unidades vendidas.</span></label></div>
    <p class="f-sale-preview" id="sale-preview" aria-live="polite"></p><label class="f-field">Data da venda<input name="soldAt" type="date" value="${draft?.soldAt??today()}" required min="2000-01-01" max="2100-12-31"/></label><label class="f-field">Cliente <span class="f-optional">opcional</span><input name="customer" value="${esc(draft?.customer)}" maxlength="160" placeholder="Nome do cliente"/></label><label class="f-field">Observações <span class="f-optional">opcional</span><textarea name="notes" rows="2" maxlength="1000">${esc(draft?.notes)}</textarea></label><p class="f-form-error" id="sale-error" role="alert" hidden></p>
    ${!available.length?'<p class="f-hint">Cadastre um produto para revenda e registre uma entrada antes de vender.</p>':''}<div class="f-dialog-footer"><button type="button" class="f-secondary" id="cancel-sale">Cancelar</button><button type="submit" class="f-primary" id="save-sale" ${!available.length?'disabled':''}>${icon('check')} Registrar venda</button></div></form>`;
  const form=el<HTMLFormElement>('sale-form');
  const decimal=(value:string)=>/^\d+(?:[,.]\d{1,3})?$/.test(value.trim())?Number(value.trim().replace(',','.')):NaN;
  const total=()=>{const raw=el<HTMLInputElement>('sale-total').value.trim();return /^\d+(?:[,.]\d{1,2})?$/.test(raw)?Math.round(Number(raw.replace(',','.'))*100):NaN;};
  function preview(){
    const product=available.find(p=>p.id===el<HTMLSelectElement>('sale-product').value),quantity=decimal(el<HTMLInputElement>('sale-quantity').value),cents=total();
    el('sale-stock').textContent=product?`Disponível: ${number(product.stock)} ${shortUnits[product.unit]}`:'Selecione um produto para consultar o estoque.';
    el('sale-preview').textContent=product&&quantity>0&&cents>0?`${money(cents/100/quantity)} por ${shortUnits[product.unit]} · Estoque após a venda: ${number(Math.round((product.stock-quantity)*1000)/1000)} ${shortUnits[product.unit]}`:'';
  }
  function error(message:string){el('sale-error').textContent=message;el('sale-error').hidden=!message;}
  const close=()=>{if(!busy)dialog.close();};
  el('close-sale').onclick=close;el('cancel-sale').onclick=close;
  dialog.oncancel=event=>{if(busy)event.preventDefault();};
  form.addEventListener('input',preview);form.addEventListener('change',preview);
  form.onsubmit=async event=>{
    event.preventDefault();if(busy||!form.reportValidity())return;error('');
    const data=new FormData(form),quantity=decimal(String(data.get('quantity'))),totalCents=total();
    if(!Number.isFinite(quantity)||quantity<=0||quantity>1000000){error('Informe uma quantidade válida, maior que zero.');return;}
    if(!Number.isSafeInteger(totalCents)||totalCents<=0||totalCents>10000000000){error('Informe um valor total válido, com até 2 casas decimais.');return;}
    const payload={productId:String(data.get('productId')),soldAt:String(data.get('soldAt')),quantity,totalCents,customer:String(data.get('customer')).trim(),notes:String(data.get('notes')).trim()};
    const previous=pending.get(payload.productId);
    const same=previous&&JSON.stringify({...previous,requestId:undefined})===JSON.stringify({...payload,requestId:undefined});
    const attempt={...payload,requestId:same?previous.requestId:crypto.randomUUID()};pending.set(payload.productId,attempt);
    busy=true;dialog.dataset.busy='true';const controls=[...dialog.querySelectorAll<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement|HTMLButtonElement>('input,select,textarea,button')].map(node=>({node,disabled:node.disabled}));controls.forEach(({node})=>node.disabled=true);el('save-sale').textContent='Registrando…';
    try{const {sale}=await api<{sale:Sale}>('sales',{method:'POST',body:JSON.stringify(attempt)});pending.delete(payload.productId);dialog.close();onSaved(sale);}
    catch(cause){error(cause instanceof Error?cause.message:'Não foi possível registrar. Tente novamente.');}
    finally{busy=false;dialog.dataset.busy='false';controls.forEach(({node,disabled})=>node.disabled=disabled);el('save-sale').innerHTML=icon('check')+' Registrar venda';}
  };
  preview();dialog.showModal();
}
