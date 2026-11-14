import type { Product } from './finance-types';
import { icon } from './icons';

export function photoMarkup(product:Product,detail=false){
  const name=product.name.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
  return `<div class="${detail?'f-detail-photo':'f-tile-photo'}">${product.photoUrl?`<img src="${product.photoUrl}" alt="${name}" width="960" height="720" ${detail?'':'loading="lazy"'} decoding="async"/>`:''}<span class="f-photo-placeholder" ${product.photoUrl?'hidden':''}>${icon('image')}<span>${detail?'Adicione uma foto para identificar seu produto':'Sem foto'}</span></span></div>`;
}

export function bindPhotoFallbacks(root:ParentNode){
  root.querySelectorAll<HTMLImageElement>('.f-tile-photo img,.f-detail-photo img').forEach(image=>image.onerror=()=>{image.hidden=true;const fallback=image.nextElementSibling as HTMLElement|null;if(fallback)fallback.hidden=false;});
}

async function preparePhoto(file:File):Promise<Blob>{
  if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Escolha uma foto JPG, PNG ou WebP.');
  if(file.size>10*1024*1024)throw new Error('Escolha uma foto de até 10 MB.');
  const url=URL.createObjectURL(file);
  try{
    const image=new Image();image.src=url;
    await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(new Error('Não foi possível abrir a foto. Tente outra imagem.'));});
    const scale=Math.min(1,1600/Math.max(image.naturalWidth,image.naturalHeight));
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
    const context=canvas.getContext('2d');if(!context)throw new Error('Não foi possível preparar a foto.');
    context.fillStyle='#ffffff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);
    const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(result=>result?resolve(result):reject(new Error('Não foi possível preparar a foto.')),'image/jpeg',.86));
    if(blob.size>3*1024*1024)throw new Error('Esta foto ainda está grande. Escolha uma imagem menor.');
    return blob;
  }finally{URL.revokeObjectURL(url);}
}

export function bindProductPhoto({product,dialog,api,onChanged}:{product:Product;dialog:HTMLDialogElement;api:<T>(path:string,options?:RequestInit)=>Promise<T>;onChanged:(url:string|null)=>void}){
  const input=dialog.querySelector<HTMLInputElement>('#product-photo-input')!;
  const add=dialog.querySelector<HTMLButtonElement>('#change-product-photo')!;
  const remove=dialog.querySelector<HTMLButtonElement>('#remove-product-photo')!;
  const status=dialog.querySelector<HTMLElement>('#product-photo-status')!;
  const error=dialog.querySelector<HTMLElement>('#product-photo-error')!;
  let busy=false;
  const current=()=>dialog.contains(input);
  async function change(file?:File){
    if(busy)return;busy=true;add.disabled=true;remove.disabled=true;error.hidden=true;status.textContent=file?'Salvando foto…':'Removendo foto…';
    try{
      const blob=file?await preparePhoto(file):null;
      const result=await api<{photoUrl:string|null}>('products/'+product.id+'/photo',file?{method:'PUT',headers:{'Content-Type':'image/jpeg'},body:blob}:{method:'DELETE',body:'{}'});
      product.photoUrl=result.photoUrl;onChanged(result.photoUrl);
      if(current()){
        dialog.querySelector('.f-detail-photo')!.outerHTML=photoMarkup(product,true);bindPhotoFallbacks(dialog);
        remove.hidden=!result.photoUrl;add.innerHTML=icon('image')+(result.photoUrl?' Trocar foto':' Adicionar foto');status.textContent=result.photoUrl?'Foto salva.':'Foto removida.';
      }
    }catch(cause){if(current()){error.textContent=cause instanceof Error?cause.message:'Não foi possível salvar a foto. Tente novamente.';error.hidden=false;status.textContent='';}}
    finally{busy=false;add.disabled=false;remove.disabled=false;input.value='';}
  }
  add.onclick=()=>input.click();input.onchange=()=>{if(input.files?.[0])void change(input.files[0]);};remove.onclick=()=>void change();bindPhotoFallbacks(dialog);
}
