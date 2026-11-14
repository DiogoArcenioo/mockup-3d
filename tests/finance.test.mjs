import { test } from 'node:test';
import assert from 'node:assert/strict';
import { productInput, entryInput, saleInput, dateInput } from '../server/finance.mjs';
import { randomUUID } from 'node:crypto';
const entry = (changes = {}) => ({productId:randomUUID(),requestId:randomUUID(),purchasedAt:'2026-10-14',packaging:'box',packageCount:1,unitsPerPackage:24,totalCents:18000,...changes});
test('entrada de uma caixa com 24 unidades mantém o total e calcula a quantidade',()=>{
  const result=entryInput(entry());assert.equal(result.totalQuantity,24);assert.equal(result.totalCents/100/result.totalQuantity,7.5);
});
test('quantidades fracionadas são exatas até três casas',()=>{
  assert.equal(entryInput(entry({packageCount:3,unitsPerPackage:.123})).totalQuantity,.369);
});
test('cadastro exige classificação, unidade e nome válidos',()=>{
  assert.deepEqual(productInput({name:'  Tinta  ',type:'consumption',unit:'ml'}),{name:'Tinta',type:'consumption',unit:'ml',category:null,colorId:null,brandId:null,minStock:0,notes:''});
  for(const changes of [{name:''},{type:'sale'},{unit:'caixa'},{minStock:-1},{name:42}])assert.throws(()=>productInput({name:'Caneca',type:'resale',category:'mug',unit:'un',...changes}));
});

test('categorias, cor opcional e marca exclusiva de camiseta são validadas',()=>{
  const base={name:'Produto',type:'resale',unit:'un'};
  for(const category of ['mug','tshirt','mobile_accessory']){
    const saved=productInput({...base,category,colorId:'',brandId:''});
    assert.equal(saved.category,category);assert.equal(saved.colorId,null);assert.equal(saved.brandId,null);
    assert.equal(productInput({...base,category,colorId:randomUUID()}).colorId.length,36);
  }
  const brandId=randomUUID();
  assert.equal(productInput({...base,category:'tshirt',brandId}).brandId,brandId);
  for(const changes of [{},{category:'unknown'},{category:'mug',brandId},{category:'mobile_accessory',brandId},{category:'mug',colorId:'Preto'},{category:'tshirt',brandId:[]},{category:42}])assert.throws(()=>productInput({...base,...changes}));
});
test('datas inexistentes, identificadores, quantidades e valores inválidos são recusados',()=>{
  for(const changes of [{purchasedAt:'2026-02-30'},{productId:'x'},{requestId:'x'},{packageCount:1.5},{packageCount:0},{unitsPerPackage:0},{unitsPerPackage:1.2345},{totalCents:0},{totalCents:-100},{totalCents:100.5},{totalCents:'18000'},{totalCents:10000000001},{packaging:'unit',unitsPerPackage:24},{packageCount:1000000,unitsPerPackage:24}])assert.throws(()=>entryInput(entry(changes)),JSON.stringify(changes));
  assert.throws(()=>dateInput('2025-02-29'));assert.equal(dateInput('2024-02-29'),'2024-02-29');
});

test('vendas validam quantidade, preço, data e identificadores sem arredondar valores inválidos',()=>{
  const sale={productId:randomUUID(),requestId:randomUUID(),soldAt:'2026-11-14',quantity:2,totalCents:7000,customer:'  Cliente  '};
  assert.equal(saleInput(sale).customer,'Cliente');assert.equal(saleInput(sale).quantity,2);
  for(const changes of[{quantity:0},{quantity:-1},{quantity:1.2345},{quantity:1000001},{totalCents:0},{totalCents:1.5},{totalCents:'7000'},{totalCents:10000000001},{soldAt:'2026-02-30'},{productId:'x'},{requestId:'x'},{customer:42}])assert.throws(()=>saleInput({...sale,...changes}));
  for(const body of[null,[],42,'sale'])assert.throws(()=>saleInput(body));
});
