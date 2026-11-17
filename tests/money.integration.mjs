import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import express from 'express';
import {createApp} from '../server/app.mjs';
import {createPool} from '../server/db.mjs';

// Tudo roda dentro de uma transação revertida ao final, inclusive a migração.
test('tamanhos, fiado com devedor, despesas, relatório e log',async()=>{
  const pool=createPool(),client=await pool.connect();let server;
  try{
    await client.query('BEGIN');
    for(const file of ['../server/schema.sql','../apps/api/src/schema.sql','../server/cashbook-schema.sql'])await client.query(await readFile(new URL(file,import.meta.url),'utf8'));
    const actor={id:randomUUID(),name:'Caixa de teste'};
    await client.query(`INSERT INTO forma_auth.users(id,name,login,password_hash,role) VALUES($1,$2,$3,'test-disabled','user')`,[actor.id,actor.name,'money-'+randomUUID().slice(0,30)]);
    const wrapper={async query(sql,values){
      if(sql==='BEGIN')return client.query('SAVEPOINT req');
      if(sql==='COMMIT')return client.query('RELEASE SAVEPOINT req');
      if(sql==='ROLLBACK')return client.query('ROLLBACK TO SAVEPOINT req');
      return client.query(sql,values);
    },release(){}};
    const db={connect:async()=>wrapper,async query(...args){await client.query('SAVEPOINT q');try{const r=await client.query(...args);await client.query('RELEASE SAVEPOINT q');return r;}catch(e){await client.query('ROLLBACK TO SAVEPOINT q');throw e;}}};
    const app=express();app.use((req,_res,next)=>{req.actor=actor;next();});app.use(createApp(db,{static:false,externalAuth:true}));
    server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
    const request=async(path,method='GET',body)=>{const res=await fetch(`http://127.0.0.1:${server.address().port}/api/`+path,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:res.status,data:await res.json()};};
    const day='2092-03-10';

    // Camiseta com tamanhos: estoque inicial por tamanho, total somado.
    const created=await request('products','POST',{name:'SIZE TEST '+randomUUID(),type:'resale',category:'tshirt',unit:'un',sizes:['P','M','g'],costPrice:20,salePriceCents:6000,initialStock:{P:2,M:3}});
    assert.equal(created.status,201,JSON.stringify(created.data));
    const shirt=created.data.product;
    assert.deepEqual(shirt.sizes,['P','M','G']);assert.equal(shirt.stock,5);assert.deepEqual(shirt.sizeStock,{P:2,M:3});
    assert.equal((await request('products','POST',{name:'X '+randomUUID(),type:'resale',category:'mug',unit:'un',sizes:['P']})).status,400);
    // Entrada exige tamanho.
    const entry={requestId:randomUUID(),productId:shirt.id,purchasedAt:day,packaging:'unit',packageCount:4,unitsPerPackage:1,totalCents:8000};
    assert.equal((await request('entries','POST',entry)).status,400);
    assert.equal((await request('entries','POST',{...entry,size:'G'})).status,201);
    // Venda exige tamanho e respeita o saldo de cada um.
    const base={soldAt:day,customer:'Ana',paymentMethod:'pix'};
    assert.equal((await request('orders','POST',{...base,requestId:randomUUID(),items:[{productId:shirt.id,quantity:1,unitPriceCents:6000}]})).status,400);
    const tooMany=await request('orders','POST',{...base,requestId:randomUUID(),items:[{productId:shirt.id,size:'P',quantity:3,unitPriceCents:6000}]});
    assert.equal(tooMany.status,409);assert.match(tooMany.data.error,/P: restam 2/);
    const sold=await request('orders','POST',{...base,requestId:randomUUID(),items:[{productId:shirt.id,size:'P',quantity:2,unitPriceCents:6000},{productId:shirt.id,size:'M',quantity:1,unitPriceCents:5500}]});
    assert.equal(sold.status,201,JSON.stringify(sold.data));
    assert.deepEqual(sold.data.order.items.map(i=>i.size),['P','M']);
    let now=(await request('products')).data.products.find(p=>p.id===shirt.id);
    assert.deepEqual(now.sizeStock,{M:2,G:4});assert.equal(now.stock,6);
    // Contagem por tamanho; não dá para remover tamanho com estoque.
    assert.equal((await request(`products/${shirt.id}/count`,'POST',{counted:1,size:'G'})).data.difference,-3);
    const edit={name:shirt.name,type:'resale',unit:'un',category:'tshirt',minStock:0,sizes:['P','M']};
    assert.equal((await request(`products/${shirt.id}`,'PUT',edit)).status,400);
    assert.equal((await request(`products/${shirt.id}`,'PUT',{...edit,sizes:['P','M','G','GG']})).data.product.sizes.length,4);

    // Fiado: cria devedor e só entra no caixa quando paga.
    const statement=async()=>(await request(`finance/statement?from=${day}&to=${day}`)).data;
    const incomeBefore=(await statement()).totals.income;
    const credit=await request('orders','POST',{...base,customer:'Bruno',onCredit:true,requestId:randomUUID(),items:[{productId:shirt.id,size:'M',quantity:1,unitPriceCents:6000}]});
    assert.equal(credit.status,201,JSON.stringify(credit.data));
    assert.equal(credit.data.order.onCredit,true);assert.equal(credit.data.order.paymentMethod,'');
    assert.equal((await statement()).totals.income,incomeBefore);
    let debtors=(await request('finance/debtors')).data;
    const debt=debtors.debtors.find(d=>d.name==='Bruno'&&d.fromSale);
    assert.ok(debt);assert.equal(debt.totalCents,6000);assert.match(debt.items,/1× SIZE TEST .* M/);
    assert.equal((await request(`finance/debtors/${debt.id}/cancel`,'POST',{})).status,409);
    assert.equal((await request(`finance/debtors/${debt.id}/pay`,'POST',{paidAt:day})).data.debtor.status,'paid');
    await request(`finance/debtors/${debt.id}/pay`,'POST',{paidAt:day});
    const after=await statement();
    assert.equal(after.totals.income-incomeBefore,6000);
    const receipt=after.items.find(i=>i.id===debt.id);
    assert.equal(receipt.kind,'debt_payment');assert.equal(receipt.actor_name,actor.name);
    // Devedor manual: pode ser removido enquanto em aberto.
    const manual=await request('finance/debtors','POST',{requestId:randomUUID(),name:'Carla',items:'2 canecas\n1 camiseta',totalCents:9000,owedAt:day});
    assert.equal(manual.status,201);
    assert.equal((await request(`finance/debtors/${manual.data.debtor.id}/cancel`,'POST',{})).status,200);
    assert.ok(!(await request('finance/debtors')).data.debtors.some(d=>d.id===manual.data.debtor.id));

    // Despesa com categoria e ajuste de saldo.
    assert.equal((await request('finance/transactions','POST',{requestId:randomUUID(),kind:'expense',category:'Frete',description:'Correios',occurredAt:day,amountCents:-1500})).status,201);
    assert.equal((await request('finance/transactions','POST',{requestId:randomUUID(),kind:'expense',category:'Inventada',description:'X',occurredAt:day,amountCents:-1500})).status,400);
    assert.equal((await request('finance/transactions','POST',{requestId:randomUUID(),kind:'adjustment',description:'Troco inicial',occurredAt:day,amountCents:5000})).status,201);
    assert.equal((await statement()).items.find(i=>i.description==='Correios').category,'Frete');

    // Relatório do período.
    const report=(await request(`finance/report?from=${day}&to=${day}`)).data;
    assert.equal(report.sales.count,2);assert.equal(report.sales.total,17500+6000);
    assert.equal(report.sales.credit,6000);
    assert.equal(report.sales.discounts,500);
    assert.equal(report.expenses.find(e=>e.name==='Frete').total,1500);
    assert.equal(report.byKind.debt_payment.total,6000);
    assert.deepEqual(report.payments.map(p=>p.method).sort(),['credit','pix']);

    // Log: uma venda vira um único evento, mesmo gravando várias tabelas.
    const log=(await request('finance/log?days=7')).data.events;
    assert.ok(log.length>0);
    for(let i=1;i<log.length;i++)assert.ok(new Date(log[i-1].at)>=new Date(log[i].at));
    const sales=log.filter(e=>e.type==='sale'&&/SIZE TEST/.test(e.detail));
    assert.equal(sales.length,2);
    assert.ok(log.some(e=>e.title==='Devedor pagou'&&e.detail==='Bruno'));
    assert.ok(log.some(e=>e.title==='Saldo adicionado'&&e.amountCents===5000));
    assert.ok(log.some(e=>e.title==='Produto cadastrado'&&e.detail===shirt.name));
    assert.ok(!log.some(e=>e.title==='Produto editado'&&e.detail===shirt.name&&e.actor!==actor.name));
  }finally{
    server?.close();
    await client.query('ROLLBACK').catch(()=>{});client.release();await pool.end();
  }
});
