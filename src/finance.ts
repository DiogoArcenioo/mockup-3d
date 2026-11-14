import './finance.css';
import './product-catalog.css';
import './catalog-layout.css';
import { icon } from './icons';
import { setupInstallUI } from './pwa';
import { openProductEditor } from './product-editor';
import { openSaleEditor } from './sale-editor';
import { openProductDetails } from './product-details';
import { photoMarkup, bindPhotoFallbacks } from './product-photo';
import type { Product, Entry, EntryPage, Unit, Category, CatalogItem, Movement, MovementPage } from './finance-types';

type View = 'products' | 'history';
const categories: Record<Category,string> = {mug:'Canecas',tshirt:'Camisetas',mobile_accessory:'Acessórios para celular'};
let colors:CatalogItem[]=[], brands:CatalogItem[]=[];
let categoryFilter='';
const variantText = (p:Product) => [p.category?categories[p.category]:'Sem categoria',p.colorName,p.brandName].filter(Boolean).join(' · ');
const units: Record<Unit, string> = { un:'Unidade', folha:'Folha', rolo:'Rolo', ml:'Mililitro (ml)', l:'Litro (l)', g:'Grama (g)', kg:'Quilo (kg)' };
const shortUnits: Record<Unit,string> = {un:'un.',folha:'folhas',rolo:'rolos',ml:'ml',l:'l',g:'g',kg:'kg'};
const typeName = (type:string) => type === 'resale' ? 'Revenda' : 'Uso e consumo';
const money = (value:number) => value.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const preciseMoney = (value:number) => value.toLocaleString('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:value > 0 && value < .01 ? 6 : 2});
const number = (value:number) => value.toLocaleString('pt-BR',{maximumFractionDigits:3});
const date = (value:string) => new Date(value.slice(0,10)+'T12:00:00').toLocaleDateString('pt-BR');
const today = () => new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const esc = (value:unknown) => String(value ?? '').replace(/[&<>"']/g, v=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[v]!));
const el = <T extends HTMLElement=HTMLElement>(id:string) => document.getElementById(id) as T;
let products:Product[]=[];
let view:View = location.hash==='#history'?'history':'products';
if(['#entry','#stock'].includes(location.hash))history.replaceState(null,'','#products');
let loaded=false, connected=false, protectedAccess=false;
let summary={totalCents:0,entryCount:0};
let productFilter='', search='', historyProduct='', historyFrom='', historyTo='', historyPage=1;
let historyKind='';
let productFiltersOpen=false,historyFiltersOpen=false;
let requestId=crypto.randomUUID();
let pendingEntry:Record<string,unknown>|undefined;
let toastTimer:ReturnType<typeof setTimeout>;
let historyVersion=0;
let loadVersion=0;
let saving=false;

document.title='Infinity — Gestão financeira';
el('app').innerHTML=`
  <header class="f-header"><a class="f-brand" href="./"><img src="${import.meta.env.BASE_URL}favicon.svg" width="36" height="36" alt=""/>Infinity<span>.</span></a><span class="f-header-label">GESTÃO FINANCEIRA</span><div class="f-header-actions"><span id="connection" class="f-connection">Conectando…</span><button class="f-quiet" id="install-app">${icon('phone')}<span>Instalar app</span></button><button class="f-quiet" id="logout" hidden>Sair</button></div></header>
  <div class="f-shell"><aside class="f-sidebar"><div class="f-side-label">SEU NEGÓCIO</div><nav aria-label="Gestão financeira" class="f-nav">${nav()}</nav><a class="f-studio" href="?module=mockup">${icon('mug')}<div>Mockup Studio<small>Crie a arte da sua caneca</small></div>${icon('arrow')}</a><div class="f-side-note">Um passo de cada vez.<br>Seu negócio em ordem.</div></aside>
  <main class="f-main"><div class="f-heading"><div><div class="f-eyebrow">MENOS PLANILHA. MAIS CLAREZA.</div><h1>Sua loja em movimento.</h1><p>Entradas, vendas e estoque, juntos.</p></div></div>
  <div class="f-error" id="connection-error" role="alert" hidden><div><strong>Não foi possível conectar à gestão.</strong><span id="connection-message">Confira se o servidor está disponível e tente novamente.</span></div><button class="f-secondary" id="retry">Tentar novamente</button></div>
  <section class="f-metrics" aria-label="Resumo"><article><span class="f-metric-icon">${icon('wallet')}</span><div><span>Compras neste mês</span><strong id="metric-spend">—</strong><small id="metric-count">Aguardando conexão</small></div></article><article><span class="f-metric-icon">${icon('cube')}</span><div><span>Produtos cadastrados</span><strong id="metric-products">—</strong><small id="metric-types">Revenda e uso e consumo</small></div></article><article><span class="f-metric-icon">${icon('chart')}</span><div><span>Estoque baixo</span><strong id="metric-low">—</strong><small>Abaixo do mínimo definido</small></div></article></section>
  <section id="content" aria-live="polite"><div class="f-loading">${icon('rotate')} Carregando seus produtos…</div></section>
  <footer class="f-footer">Pequenos controles. Boas decisões.<span>Infinity · Gestão financeira</span></footer></main></div>
  <nav class="f-bottom-nav" aria-label="Navegação no celular">${nav()}</nav>
  <div id="toast" class="f-toast" role="status" hidden></div>
  <dialog class="f-dialog" id="product-dialog" aria-labelledby="product-title"></dialog>
  <dialog class="f-dialog" id="detail-dialog" aria-labelledby="detail-title"></dialog>
  <dialog class="f-dialog f-movement-dialog" id="entry-dialog" aria-label="Registrar entrada"></dialog>
  <dialog class="f-dialog" id="sale-dialog" aria-labelledby="sale-title"></dialog>
  <dialog class="f-dialog f-login" id="login-dialog" aria-labelledby="login-title"><span class="f-eyebrow">INFINITY · GESTÃO</span><h2 id="login-title">Seu negócio, em ordem.</h2><p>Use a senha de acesso para abrir sua gestão.</p><form id="login-form"><label class="f-field">Senha de acesso<input type="password" id="login-password" autocomplete="current-password" required maxlength="256"/></label><p class="f-form-error" id="login-error" role="alert" hidden></p><button class="f-primary" type="submit">Entrar ${icon('arrow')}</button></form><a class="f-back" href="?module=mockup">Abrir Mockup Studio</a></dialog>
  <dialog class="f-dialog" id="install-dialog" aria-labelledby="install-title"><div class="f-dialog-top"><span class="f-eyebrow">SEMPRE POR PERTO</span><button class="f-icon-button install-close" aria-label="Fechar">${icon('close')}</button></div><h2 id="install-title">Leve o Infinity com você.</h2><p>Instale o app na tela inicial do seu celular.</p><div id="install-instructions"><ol><li>Abra o menu do navegador.</li><li>Escolha <strong>Instalar app</strong> ou <strong>Adicionar à tela inicial</strong>.</li></ol><p>No iPhone: Safari → Compartilhar → Adicionar à Tela de Início.</p></div><p id="install-note" hidden>Abra o endereço com HTTPS para instalar.</p><p class="f-hint">A gestão precisa de internet para consultar e salvar seus dados.</p><button class="f-primary" id="confirm-install" hidden>Instalar Infinity</button><button class="f-secondary install-close">Voltar</button></dialog>`;

function nav(){return ([['products','cube','Produtos'],['history','history','Histórico']] as const).map(([key,name,label])=>`<a href="#${key}" data-nav="${key}">${icon(name)}<span>${label}</span></a>`).join('');}
function notify(message:string,error=false){clearTimeout(toastTimer);const t=el('toast');t.textContent=message;t.classList.toggle('error',error);t.hidden=false;toastTimer=setTimeout(()=>t.hidden=true,5000);}
function setError(id:string,message:string){const node=el(id);node.textContent=message;node.hidden=!message;}
function setConnection(ok:boolean){connected=ok;el('connection').textContent=ok?'Dados sincronizados':'Sem conexão';el('connection').classList.toggle('online',ok);el('connection-error').hidden=ok;}
class ApiError extends Error {constructor(message:string,public status:number){super(message);}}
async function api<T>(path:string, options:RequestInit={}):Promise<T>{
  let response:Response;
  try {response=await fetch(`${import.meta.env.BASE_URL}api/${path}`,{...options,headers:{'Content-Type':'application/json',...options.headers},signal:AbortSignal.timeout(20000)});} catch {setConnection(false);throw new ApiError('Sem conexão com o servidor. Confira sua internet e tente novamente.',0);}
  let result;
  try{result=await response.json();}catch{setConnection(false);throw new ApiError('A API financeira não está disponível neste endereço. Inicie o servidor da gestão.',503);}
  if(!response.ok){
    if(response.status===401 && location.pathname.startsWith('/legacy/')){window.parent.postMessage('forma:session-expired',location.origin);throw new ApiError('Sua sessão expirou. Entre novamente.',401);}
    if(response.status===401 && path!=='session'){protectedAccess=true;el('logout').hidden=false;const dialog=el<HTMLDialogElement>('login-dialog');if(!dialog.open)dialog.showModal();}
    if(response.status>=500)setConnection(false);
    throw new ApiError(result.error ?? 'Não foi possível concluir. Tente novamente.',response.status);
  }
  return result;
}
async function refresh(){
  const version=++loadVersion;
  try{
    const [p,s,h,c,b]=await Promise.all([api<{products:Product[]}>('products'),api<typeof summary>('summary?month='+today().slice(0,7)),api<{protected:boolean}>('health'),api<{colors:CatalogItem[]}>('colors'),api<{brands:CatalogItem[]}>('brands')]);
    if(version!==loadVersion)return;
    products=p.products;colors=c.colors;brands=b.brands;summary=s;protectedAccess=h.protected;loaded=true;setConnection(true);el('logout').hidden=!protectedAccess;
    updateMetrics();render();
  }catch(error){if(version!==loadVersion)return;setConnection(false);if(error instanceof ApiError && error.status!==401)el('connection-message').textContent=error.message;if(!loaded)el('content').innerHTML='<div class="f-empty"><span class="f-empty-symbol">'+icon('lock')+'</span><h2>Seus dados ficam no servidor.</h2><p>Conecte à gestão para cadastrar produtos e registrar entradas.</p></div>';}
}
function updateMetrics(){el('metric-spend').textContent=money(summary.totalCents/100);el('metric-count').textContent=`${summary.entryCount} ${summary.entryCount===1?'entrada registrada':'entradas registradas'}`;el('metric-products').textContent=String(products.length);el('metric-types').textContent=`${products.filter(p=>p.type==='resale').length} revenda · ${products.filter(p=>p.type==='consumption').length} uso e consumo`;el('metric-low').textContent=String(products.filter(p=>p.minStock>0&&p.stock<p.minStock).length);}
function render(){
  document.querySelectorAll<HTMLElement>('[data-nav]').forEach(n=>{const active=n.dataset.nav===view;n.classList.toggle('active',active);if(active)n.setAttribute('aria-current','page');else n.removeAttribute('aria-current');});
  if(!loaded)return;
  if(view==='products')renderProducts();
  if(view==='history')renderHistory();
}
function filteredProducts(){return products.filter(p=>(!productFilter||p.type===productFilter)&&(!categoryFilter||(categoryFilter==='uncategorized'?!p.category:p.category===categoryFilter))&&[p.name,variantText(p)].join(' ').toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')));}
function filterSummary(id:string,count:number){return `<summary>${icon('sliders')}<span>Filtros</span><span class="f-filter-count" id="${id}">${count?count+' ativo'+(count>1?'s':''):'Todos os produtos'}</span><span class="f-filter-expand">Expandir</span><span class="f-filter-collapse">Recolher</span><span class="f-filter-chevron">${icon('arrow')}</span></summary>`;}
function goHistory(id?:string){historyProduct=id||'';historyKind='';historyFrom='';historyTo='';historyPage=1;view='history';location.hash='history';render();}
function renderProducts(){
  el('content').innerHTML=`<div class="f-section-heading f-catalog-heading"><div><h2>Seus produtos</h2><p>Seu catálogo, seu estoque e suas próximas vendas.</p></div><button class="f-primary" id="new-product">${icon('plus')} Novo produto</button></div>
    <label class="f-search f-catalog-search">${icon('search')}<input id="product-search" type="search" placeholder="Buscar nome, cor ou marca" aria-label="Buscar produto" value="${esc(search)}"/></label>
    <details class="f-filter-panel" id="product-filters" ${productFiltersOpen?'open':''}>${filterSummary('product-filter-count',Number(Boolean(categoryFilter))+Number(Boolean(productFilter)))}<div class="f-filter-body"><label class="f-field">Categoria<select id="category-filter"><option value="">Todas as categorias</option>${Object.entries(categories).map(([value,label])=>`<option value="${value}" ${categoryFilter===value?'selected':''}>${label}</option>`).join('')}<option value="uncategorized" ${categoryFilter==='uncategorized'?'selected':''}>Sem categoria</option></select></label><div class="f-filter-purpose"><span>Finalidade</span><div class="f-filters" role="group" aria-label="Tipo de produto">${[['','Todos'],['resale','Revenda'],['consumption','Uso e consumo']].map(([value,label])=>`<button data-filter="${value}" class="${productFilter===value?'active':''}" aria-pressed="${productFilter===value}">${label}</button>`).join('')}</div></div><button class="f-secondary f-clear-product-filters" id="clear-product-filters">Limpar filtros</button></div></details>
    <p id="filter-count" class="f-catalog-count" aria-live="polite"></p><div id="product-list" class="f-product-grid"></div>`;
  const details=el<HTMLDetailsElement>('product-filters');details.ontoggle=()=>{productFiltersOpen=details.open;};
  el('new-product').onclick=()=>openProduct();paintProducts();
  el<HTMLInputElement>('product-search').oninput=event=>{search=(event.target as HTMLInputElement).value;paintProducts();};
  el<HTMLSelectElement>('category-filter').onchange=event=>{categoryFilter=(event.target as HTMLSelectElement).value;paintProducts();};
  document.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach(button=>button.onclick=()=>{productFilter=button.dataset.filter!;productFiltersOpen=details.open;renderProducts();});
  el('clear-product-filters').onclick=()=>{categoryFilter='';productFilter='';search='';productFiltersOpen=details.open;renderProducts();};
}
function paintProducts(){
  const list=filteredProducts();
  el('filter-count').textContent=`${list.length} de ${products.length} ${products.length===1?'produto':'produtos'}`;
  const active=Number(Boolean(categoryFilter))+Number(Boolean(productFilter));el('product-filter-count').textContent=active?active+' ativo'+(active>1?'s':''):'Todos os produtos';
  el('product-list').innerHTML=list.length?list.map(product=>{
    const low=product.minStock>0&&product.stock<product.minStock;
    return `<article class="f-product-card f-product-tile" data-product-card="${product.id}"><button class="f-tile-open" data-detail="${product.id}" aria-label="Ver detalhes de ${esc(product.name)}">${photoMarkup(product)}<div class="f-tile-description"><h3>${esc(product.name)}</h3><p>${esc(variantText(product))}</p></div></button><button class="f-tile-edit" data-edit="${product.id}" aria-label="Editar ${esc(product.name)}">${icon('edit')}</button><div class="f-tile-stock"><span>Em estoque</span><strong>${number(product.stock)} <small>${shortUnits[product.unit]}</small></strong></div><div class="f-tile-actions"><button class="f-secondary" data-history="${product.id}">${icon('history')} Histórico</button><button class="f-secondary" data-entry="${product.id}">${icon('plus')} Entrada</button>${product.type==='resale'?`<button class="f-secondary" data-sale="${product.id}">${icon('arrow')} Venda</button>`:''}</div>${low?`<div class="f-low">${icon('alert')} Abaixo do mínimo de ${number(product.minStock)} ${shortUnits[product.unit]}</div>`:''}</article>`;
  }).join(''):`<div class="f-empty"><span class="f-empty-symbol">${icon(products.length?'search':'cube')}</span><h2>${products.length?'Nenhum produto encontrado.':'Tudo começa com um produto.'}</h2><p>${products.length?'Tente outro nome ou filtro.':'Cadastre canecas, camisetas, acessórios e insumos.'}</p>${products.length?'':'<button class="f-primary" id="first-product">'+icon('plus')+' Cadastrar primeiro produto</button>'}</div>`;
  bindPhotoFallbacks(el('product-list'));bindMovementActions();
  document.querySelectorAll<HTMLButtonElement>('[data-edit]').forEach(button=>button.onclick=()=>openProduct(products.find(product=>product.id===button.dataset.edit)));
  document.querySelectorAll<HTMLButtonElement>('[data-history]').forEach(button=>button.onclick=()=>goHistory(button.dataset.history));
  document.querySelectorAll<HTMLButtonElement>('[data-detail]').forEach(button=>button.onclick=()=>openDetail(button.dataset.detail!));
  document.querySelectorAll<HTMLElement>('[data-product-card]').forEach(card=>card.onclick=event=>{if(!(event.target as HTMLElement).closest('button,a,input'))openDetail(card.dataset.productCard!);});
  document.getElementById('first-product')?.addEventListener('click',()=>openProduct());
}
function openProduct(product?:Product,fromEntry=false){
  openProductEditor({product,colors,brands,categories,units,api,onSaved(saved){
    products=product?products.map(p=>p.id===saved.id?saved:p):[...products,saved].sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
    setConnection(true);updateMetrics();notify('Produto salvo.');
    if(fromEntry){const select=el<HTMLSelectElement>('entry-product');if(select){select.innerHTML=productOptions(saved.id);select.dispatchEvent(new Event('change'));}}else render();
  }});
}
function parseDecimal(value:string){const trimmed=value.trim();if(!/^\d+(?:[,.]\d{1,3})?$/.test(trimmed))return NaN;return Number(trimmed.replace(',','.'));}
function cents(value:string){const trimmed=value.trim();if(!/^\d+(?:[,.]\d{1,2})?$/.test(trimmed))return NaN;return Math.round(Number(trimmed.replace(',','.'))*100);}
function productOptions(selected=''){return '<option value="">Selecione um produto</option>'+products.map(p=>`<option value="${p.id}" ${p.id===selected?'selected':''}>${esc(p.name)} · ${esc(variantText(p))} · ${shortUnits[p.unit]}</option>`).join('');}
function goEntry(id?:string){
  if(saving)return;
  const dialog=el<HTMLDialogElement>('entry-dialog');
  dialog.innerHTML=`<div class="f-dialog-top"><span class="f-eyebrow">COMPRA · ENTRADA NO ESTOQUE</span><button type="button" class="f-icon-button" id="close-entry" aria-label="Fechar entrada">${icon('close')}</button></div><div id="entry-content"></div>`;
  renderEntry();if(id){el<HTMLSelectElement>('entry-product').value=id;el('entry-product').dispatchEvent(new Event('change'));}
  el('close-entry').onclick=()=>{if(!saving)dialog.close();};dialog.oncancel=event=>{if(saving)event.preventDefault();};if(!dialog.open)dialog.showModal();
}
function goSale(id?:string){openSaleEditor({products,productId:id,shortUnits,api,onSaved(sale){notify(`Venda registrada: ${money(sale.totalCents/100)}. Estoque atualizado.`);void refresh();}});}
function renderEntry(){
  // Keep a failed request's identity and payload for a safe retry after a lost response.
  const draft=pendingEntry;
  el('entry-content').innerHTML=`<div class="f-section-heading"><div><h2>Registrar entrada</h2><p>Comprou insumos? Anote aqui e atualize seu estoque.</p></div><span class="f-count">COMPRA DE INSUMOS</span></div><div class="f-entry-layout"><form id="entry-form" class="f-panel"><div class="f-step-heading"><span>1</span><h3>O que chegou?</h3></div><label class="f-field">Produto<select id="entry-product" name="productId" required>${productOptions(String(draft?.productId??''))}</select></label><div class="f-product-context" id="entry-product-context" hidden></div><button class="f-text-button f-add-inline" type="button" id="inline-product">${icon('plus')} Cadastrar um novo produto</button><div class="f-divider"></div><div class="f-step-heading"><span>2</span><h3>Quantidade e valor</h3></div><label class="f-field">Como veio a compra?<select id="entry-packaging" name="packaging"><option value="box" ${!draft||draft.packaging==='box'?'selected':''}>Caixa</option><option value="package" ${draft?.packaging==='package'?'selected':''}>Pacote / embalagem</option><option value="unit" ${draft?.packaging==='unit'?'selected':''}>Avulso</option></select></label><div class="f-form-row"><label class="f-field"><span id="package-label">Quantidade de caixas</span><input id="package-count" name="packageCount" inputmode="numeric" value="${draft?.packageCount??1}" required/></label><label class="f-field" id="units-field"><span id="units-label">Unidades por caixa</span><input id="units-per-package" name="unitsPerPackage" inputmode="decimal" placeholder="Ex.: 24" value="${draft?.unitsPerPackage??''}" required/></label></div><label class="f-field">Valor total da compra (R$)<input id="entry-total" name="total" inputmode="decimal" placeholder="Ex.: 180,00" value="${draft?String(Number(draft.totalCents)/100).replace('.',','):''}" required/><span class="f-hint">Inclua o frete neste valor, se quiser compor o custo.</span></label><div class="f-divider"></div><div class="f-step-heading"><span>3</span><h3>Detalhes da compra</h3></div><div class="f-form-row"><label class="f-field">Data da compra<input name="purchasedAt" type="date" value="${esc(draft?.purchasedAt??today())}" required min="2000-01-01" max="2100-12-31"/></label><label class="f-field">Fornecedor <span class="f-optional">opcional</span><input name="supplier" placeholder="Onde você comprou?" maxlength="160" value="${esc(draft?.supplier)}"/></label></div><label class="f-field">Observações <span class="f-optional">opcional</span><textarea name="notes" rows="2" maxlength="1000" placeholder="Nota fiscal, marca ou outro detalhe">${esc(draft?.notes)}</textarea></label><p id="entry-error" class="f-form-error" role="alert" hidden></p><button class="f-primary f-save-entry" id="save-entry" type="submit">${icon('check')} Registrar entrada</button><p class="f-hint f-centered">A compra será salva no histórico e adicionada ao estoque.</p></form><aside class="f-entry-summary"><div class="f-summary-card"><span class="f-eyebrow">SEM FAZER CONTA</span><h3>Sua compra, por unidade.</h3><p>Você informa a caixa.<br>A gente cuida do cálculo.</p><div class="f-summary-quantity"><span>Total que entra no estoque</span><strong id="preview-quantity">—</strong><small id="preview-formula">Preencha a quantidade da compra</small></div><div class="f-summary-cost"><span>Custo por <span id="preview-unit">unidade</span></span><strong id="preview-cost">—</strong></div><div class="f-summary-row"><span>Valor da compra</span><strong id="preview-total">—</strong></div><div class="f-summary-row"><span>Estoque após entrada</span><strong id="preview-stock">—</strong></div></div><div class="f-tip">${icon('help')}<p><strong>Uma caixa, 24 canecas.</strong>Se a caixa custou R$ 180,00, cada caneca entra no estoque por R$ 7,50.</p></div></aside></div>`;
  el('inline-product').onclick=()=>openProduct(undefined,true);
  const form=el<HTMLFormElement>('entry-form');
  form.addEventListener('input',updatePreview);form.addEventListener('change',updatePreview);
  updatePreview();
  form.onsubmit=async event=>{
    event.preventDefault();if(saving||!form.reportValidity())return;
    setError('entry-error','');
    const data=new FormData(form);const packaging=String(data.get('packaging'));
    const count=parseDecimal(String(data.get('packageCount'))),per=packaging==='unit'?1:parseDecimal(String(data.get('unitsPerPackage'))),totalCents=cents(String(data.get('total')));
    if(!Number.isInteger(count)||count<=0||count>1000000||!Number.isFinite(per)||per<=0||per>1000000||count*per>1000000){setError('entry-error','Informe uma quantidade válida. O número de embalagens deve ser inteiro; o conteúdo pode ter até 3 casas decimais.');return;}
    if(!Number.isSafeInteger(totalCents)||totalCents<=0||totalCents>10000000000){setError('entry-error','Informe o valor total, maior que zero, com até 2 casas decimais.');return;}
    const payload={productId:data.get('productId'),packaging,packageCount:count,unitsPerPackage:per,totalCents,purchasedAt:data.get('purchasedAt'),supplier:String(data.get('supplier')).trim(),notes:String(data.get('notes')).trim()};
    if(pendingEntry&&JSON.stringify({...pendingEntry,requestId:undefined})!==JSON.stringify({...payload,requestId:undefined}))requestId=crypto.randomUUID();
    pendingEntry={...payload,requestId};saving=true;el('entry-dialog').dataset.busy='true';const b=el<HTMLButtonElement>('save-entry');b.disabled=true;b.textContent='Registrando…';
    const controls=Array.from(form.elements).filter((n):n is HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement|HTMLButtonElement=>n instanceof HTMLInputElement||n instanceof HTMLSelectElement||n instanceof HTMLTextAreaElement||n instanceof HTMLButtonElement);controls.forEach(n=>n.disabled=true);
    try{
      const {entry}=await api<{entry:Entry}>('entries',{method:'POST',body:JSON.stringify(pendingEntry)});pendingEntry=undefined;requestId=crypto.randomUUID();notify(`${number(entry.quantity)} ${shortUnits[entry.unit]} adicionadas ao estoque. Custo: ${preciseMoney(entry.unitCost)} por ${shortUnits[entry.unit]}`);historyProduct=entry.productId;historyPage=1;el<HTMLDialogElement>('entry-dialog').close();historyKind='';view='history';location.hash='history';render();await refresh();
    }catch(error){setError('entry-error',error instanceof Error?error.message:'Não foi possível registrar.');}
    finally{saving=false;el('entry-dialog').dataset.busy='false';controls.forEach(n=>n.disabled=false);if(document.contains(b)){b.innerHTML=icon('check')+' Registrar entrada';updatePreview();}}
  };
}
function updatePreview(){
  const p=products.find(p=>p.id===el<HTMLSelectElement>('entry-product').value),pack=el<HTMLSelectElement>('entry-packaging').value;
  const avulso=pack==='unit';const count=parseDecimal(el<HTMLInputElement>('package-count').value);
  el('units-field').hidden=avulso;el<HTMLInputElement>('units-per-package').required=!avulso;
  el('package-label').textContent=avulso?`Quantidade (${p?shortUnits[p.unit]:'unidades'})`:pack==='box'?'Quantidade de caixas':'Quantidade de embalagens';
  el('units-label').textContent=`${p?shortUnits[p.unit]:'Unidades'} por ${pack==='box'?'caixa':'embalagem'}`;
  const per=avulso?1:parseDecimal(el<HTMLInputElement>('units-per-package').value),total=cents(el<HTMLInputElement>('entry-total').value);
  const qty=Number.isInteger(count)&&count>0&&count<=1000000&&Number.isFinite(per)&&per>0&&per<=1000000?Math.round(count*Math.round(per*1000))/1000:NaN;
  const valid=Number.isFinite(qty)&&qty<=1000000;const validTotal=Number.isSafeInteger(total)&&total>0&&total<=10000000000;
  el('preview-unit').textContent=p?units[p.unit].toLowerCase():'unidade';
  el('preview-quantity').textContent=valid?number(qty)+' '+(p?shortUnits[p.unit]:'un.'):'—';
  el('preview-formula').textContent=valid?`${number(count)} × ${number(per)} ${p?shortUnits[p.unit]:'un.'}`:'Preencha a quantidade da compra';
  el('preview-cost').textContent=valid&&validTotal?preciseMoney(total/100/qty):'—';el('preview-total').textContent=validTotal?money(total/100):'—';el('preview-stock').textContent=valid&&p?number(Math.round((p.stock+qty)*1000)/1000)+' '+shortUnits[p.unit]:'—';
  const context=el('entry-product-context');context.hidden=!p;context.innerHTML=p?`<span class="f-badge ${p.type}">${typeName(p.type)}</span><span>Estoque atual: <strong>${number(p.stock)} ${shortUnits[p.unit]}</strong></span>`:'';
}
function bindMovementActions(){
  document.querySelectorAll<HTMLButtonElement>('[data-entry]').forEach(button=>button.onclick=()=>goEntry(button.dataset.entry));
  document.querySelectorAll<HTMLButtonElement>('[data-sale]').forEach(button=>button.onclick=()=>goSale(button.dataset.sale));
}
function renderHistory(){
  const active=Number(Boolean(historyProduct))+Number(Boolean(historyKind))+Number(Boolean(historyFrom))+Number(Boolean(historyTo));
  el('content').innerHTML=`<div class="f-section-heading f-history-heading"><div><h2>Histórico de movimentações</h2><p>Compras e vendas com seus valores e quantidades.</p></div><div class="f-history-toolbar"><button class="f-secondary" id="new-product">${icon('plus')} Novo produto</button><button class="f-secondary" id="history-entry">${icon('plus')} Registrar entrada</button><button class="f-primary" id="history-sale">${icon('arrow')} Registrar venda</button></div></div>
    <details class="f-filter-panel" id="history-filter-panel" ${historyFiltersOpen?'open':''}>${filterSummary('history-filter-count',active)}<form class="f-history-filters" id="history-filters"><label class="f-field f-filter-product">Produto<select id="history-product">${productOptions(historyProduct).replace('Selecione um produto','Todos os produtos')}</select></label><label class="f-field f-filter-kind">Movimentação<select id="history-kind"><option value="">Entradas e vendas</option><option value="purchase" ${historyKind==='purchase'?'selected':''}>Somente entradas</option><option value="sale" ${historyKind==='sale'?'selected':''}>Somente vendas</option></select></label><label class="f-field">De<input type="date" id="history-from" value="${esc(historyFrom)}"/></label><label class="f-field">Até<input type="date" id="history-to" value="${esc(historyTo)}"/></label><div class="f-filter-form-actions"><button class="f-primary" type="submit">${icon('search')} Aplicar filtros</button><button class="f-secondary" type="button" id="clear-history">Limpar</button></div></form></details><div id="history-results"><div class="f-loading">Carregando movimentações…</div></div>`;
  const details=el<HTMLDetailsElement>('history-filter-panel');details.ontoggle=()=>{historyFiltersOpen=details.open;};
  el('new-product').onclick=()=>openProduct();el('history-entry').onclick=()=>goEntry();el('history-sale').onclick=()=>goSale();
  el<HTMLFormElement>('history-filters').onsubmit=event=>{event.preventDefault();historyProduct=el<HTMLSelectElement>('history-product').value;historyKind=el<HTMLSelectElement>('history-kind').value;historyFrom=el<HTMLInputElement>('history-from').value;historyTo=el<HTMLInputElement>('history-to').value;historyPage=1;const count=Number(Boolean(historyProduct))+Number(Boolean(historyKind))+Number(Boolean(historyFrom))+Number(Boolean(historyTo));el('history-filter-count').textContent=count?count+' ativo'+(count>1?'s':''):'Todas as movimentações';void loadHistory();};
  el('clear-history').onclick=()=>{historyProduct='';historyKind='';historyFrom='';historyTo='';historyPage=1;historyFiltersOpen=details.open;renderHistory();};
  if(!active)el('history-filter-count').textContent='Todas as movimentações';void loadHistory();
}
function historyParams(productId=historyProduct,page=historyPage){const params=new URLSearchParams({page:String(page)});if(productId)params.set('productId',productId);if(historyKind)params.set('kind',historyKind);if(historyFrom)params.set('from',historyFrom);if(historyTo)params.set('to',historyTo);return params;}
function entryCard(entry:Movement){
  const sale=entry.kind==='sale',current=products.find(product=>product.id===entry.productId);
  const counterpart=sale?entry.customer:entry.supplier;
  return `<article class="f-history-card"><div class="f-history-date"><span>${date(entry.purchasedAt)}</span><span class="f-movement-badge ${sale?'sale':'purchase'}">${sale?'Saída · Venda':'Entrada · Compra'}</span></div><div class="f-history-title"><span class="f-product-symbol">${icon(sale?'wallet':'cube')}</span><div><h3>${esc(entry.productName)}</h3>${entry.productCategory?`<p class="f-variant-info">${esc([categories[entry.productCategory],entry.productColor,entry.productBrand].filter(Boolean).join(' · '))}</p>`:''}<p>${sale?'Venda':entry.packaging==='unit'?'Compra avulsa':`${number(entry.packageCount)} ${entry.packaging==='box'?'caixa(s)':'embalagem(ns)'} × ${number(entry.unitsPerPackage)} ${shortUnits[entry.unit]}`}${counterpart?' · '+esc(counterpart):''}</p></div></div><div class="f-history-values"><div><span>${sale?'Quantidade vendida':'Quantidade recebida'}</span><strong>${sale?'−':'+'} ${number(entry.quantity)} ${shortUnits[entry.unit]}</strong></div><div><span>${sale?'Valor':'Custo'} por ${shortUnits[entry.unit]}</span><strong>${preciseMoney(entry.unitCost)}</strong></div><div><span>Total da ${sale?'venda':'compra'}</span><strong>${money(entry.totalCents/100)}</strong></div></div>${entry.notes?'<p class="f-history-note">'+esc(entry.notes)+'</p>':''}${current?`<div class="f-history-actions f-movement-actions"><button class="f-secondary" data-entry="${entry.productId}">${icon('plus')} Registrar entrada</button>${current.type==='resale'?`<button class="f-secondary" data-sale="${entry.productId}">${icon('arrow')} Registrar venda</button>`:''}</div>`:''}</article>`;
}
async function loadHistory(){
  const version=++historyVersion;
  try{
    const page=await api<MovementPage>('movements?'+historyParams());if(version!==historyVersion||view!=='history')return;setConnection(true);
    el('history-results').innerHTML=page.count?`<div class="f-history-summary"><span>${page.count} ${page.count===1?'movimentação encontrada':'movimentações encontradas'}</span><div class="f-history-totals"><span>Compras <strong>${money(page.purchaseTotalCents/100)}</strong></span><span>Vendas <strong>${money(page.salesTotalCents/100)}</strong></span></div></div><div class="f-history-list">${page.entries.map(entryCard).join('')}</div>${pagination(page)}`:`<div class="f-empty"><span class="f-empty-symbol">${icon('history')}</span><h2>Nenhuma movimentação por aqui.</h2><p>Registre uma entrada ou venda, ou ajuste os filtros.</p><button class="f-primary" id="history-first-entry">${icon('plus')} Registrar entrada</button></div>`;
    bindMovementActions();document.querySelectorAll<HTMLButtonElement>('[data-page]').forEach(button=>button.onclick=()=>{historyPage=Number(button.dataset.page);void loadHistory();});document.getElementById('history-first-entry')?.addEventListener('click',()=>goEntry());
  }catch(error){if(version===historyVersion&&view==='history')el('history-results').innerHTML='<p class="f-form-error" role="alert">'+esc(error instanceof Error?error.message:'Falha ao carregar.')+'</p>';}
}
function pagination(page:{page:number;pages:number}){return page.pages>1?`<div class="f-pagination"><button class="f-secondary" data-page="${page.page-1}" ${page.page===1?'disabled':''}>Anterior</button><span>${page.page} de ${page.pages}</span><button class="f-secondary" data-page="${page.page+1}" ${page.page>=page.pages?'disabled':''}>Próxima</button></div>`:'';}
function openDetail(id:string){
  const product=products.find(item=>item.id===id);if(!product)return;
  openProductDetails({product,units,shortUnits,categories,api,onEdit:()=>openProduct(product),onHistory:()=>goHistory(id),onEntry:()=>goEntry(id),onSale:()=>goSale(id),onPhotoChanged(url){
    products=products.map(item=>item.id===id?{...item,photoUrl:url}:item);if(view==='products')paintProducts();notify(url?'Foto do produto atualizada.':'Foto do produto removida.');
  }});
}
window.addEventListener('hashchange',()=>{if(saving)return;const next=location.hash.slice(1);if(['products','history'].includes(next)&&view!==next){view=next as View;render();}});
el('retry').onclick=()=>void refresh();
el<HTMLDialogElement>('login-dialog').addEventListener('cancel',event=>event.preventDefault());
el<HTMLFormElement>('login-form').onsubmit=async event=>{event.preventDefault();const button=el('login-form').querySelector<HTMLButtonElement>('button')!;button.disabled=true;try{await api('session',{method:'POST',body:JSON.stringify({password:el<HTMLInputElement>('login-password').value})});el<HTMLInputElement>('login-password').value='';setError('login-error','');el<HTMLDialogElement>('login-dialog').close();await refresh();}catch(error){setError('login-error',error instanceof Error?error.message:'Falha ao entrar.');}finally{button.disabled=false;}};
el('logout').onclick=async()=>{try{await api('session',{method:'DELETE',body:'{}'});products=[];loaded=false;summary={totalCents:0,entryCount:0};pendingEntry=undefined;document.querySelectorAll<HTMLDialogElement>('dialog[open]').forEach(d=>d.close());el('metric-spend').textContent='—';el('metric-count').textContent='Entre para consultar';el('metric-products').textContent='—';el('metric-types').textContent='Revenda e uso e consumo';el('metric-low').textContent='—';await refresh();}catch(error){notify(error instanceof Error?error.message:'Falha ao sair.',true);}};
for(const id of ['product-dialog','detail-dialog','entry-dialog','sale-dialog'])el<HTMLDialogElement>(id).addEventListener('click',event=>{const dialog=event.currentTarget as HTMLDialogElement;if(event.target===dialog&&dialog.dataset.busy!=='true'){const r=dialog.getBoundingClientRect();const e=event as MouseEvent;if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
setupInstallUI(notify);
render();void refresh();
