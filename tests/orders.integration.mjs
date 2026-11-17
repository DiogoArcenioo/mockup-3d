import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import express from 'express';
import {createApp} from '../server/app.mjs';
import {createPool} from '../server/db.mjs';

// Tudo roda dentro de uma transação revertida ao final, inclusive a migração.
test('cadastro com preços, histórico, entrada, venda com carrinho e financeiro',async()=>{
  const pool=createPool(),client=await pool.connect();let server;
  try{
    await client.query('BEGIN');
    for(const file of ['../server/schema.sql','../apps/api/src/schema.sql','../server/cashbook-schema.sql'])await client.query(await readFile(new URL(file,import.meta.url),'utf8'));
    const actor={id:randomUUID(),name:'Vendedor de teste'};
    await client.query(`INSERT INTO forma_auth.users(id,name,login,password_hash,role) VALUES($1,$2,$3,'test-disabled','user')`,[actor.id,actor.name,'order-'+randomUUID().slice(0,30)]);
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

    // Cadastro com custo, venda e estoque inicial (ajuste, sem compra no financeiro).
    const created=await request('products','POST',{name:'ORDER TEST '+randomUUID(),type:'resale',category:'mug',unit:'un',costPrice:7.5,salePriceCents:3500,initialStock:5});
    assert.equal(created.status,201,JSON.stringify(created.data));
    const mug=created.data.product;
    assert.equal(mug.stock,5);assert.equal(mug.salePriceCents,3500);assert.equal(mug.costPrice,7.5);
    const other=(await request('products','POST',{name:'ORDER TEST B '+randomUUID(),type:'resale',category:'tshirt',unit:'un',salePriceCents:6000})).data.product;
    assert.equal(other.stock,0);assert.equal(other.costPrice,null);

    // Entrada atualiza o custo do cadastro e o histórico.
    assert.equal((await request('entries','POST',{requestId:randomUUID(),productId:other.id,purchasedAt:'2091-01-01',packaging:'unit',packageCount:4,unitsPerPackage:1,totalCents:10000})).status,201);
    let otherNow=(await request('products')).data.products.find(p=>p.id===other.id);
    assert.equal(otherNow.costPrice,25);assert.equal(otherNow.stock,4);

    // Preço de venda com histórico; repetir o mesmo preço não duplica.
    assert.equal((await request(`products/${mug.id}/price`,'PUT',{salePriceCents:3900})).data.product.salePriceCents,3900);
    await request(`products/${mug.id}/price`,'PUT',{salePriceCents:3900});
    const history=(await request(`products/${mug.id}/history`)).data;
    assert.deepEqual(history.prices.map(p=>p.priceCents),[3900,3500]);
    assert.equal(history.prices[0].previousCents,3500);
    assert.equal(history.prices[0].actorName,actor.name);
    assert.equal(history.costs.length,1);assert.equal(history.costs[0].source,'register');

    // Venda com carrinho e preço negociado.
    const before=(await request('finance/statement?from=2091-02-01&to=2091-02-01')).data.totals.income;
    const order={requestId:randomUUID(),soldAt:'2091-02-01',customer:'Maria',paymentMethod:'pix',items:[{productId:mug.id,quantity:2,unitPriceCents:3500},{productId:other.id,quantity:1,unitPriceCents:6000}]};
    const sold=await request('orders','POST',order);
    assert.equal(sold.status,201,JSON.stringify(sold.data));
    assert.equal(sold.data.order.totalCents,13000);
    assert.equal(sold.data.order.listTotalCents,13800);
    assert.equal(sold.data.order.sellerName,actor.name);
    assert.equal(sold.data.order.items.length,2);
    // Reenvio não duplica; mesmo id com outros dados é recusado.
    assert.equal((await request('orders','POST',order)).data.repeated,true);
    assert.equal((await request('orders','POST',{...order,customer:'Outra'})).status,409);
    const products=(await request('products')).data.products;
    assert.equal(products.find(p=>p.id===mug.id).stock,3);
    assert.equal(products.find(p=>p.id===other.id).stock,3);
    // Estoque insuficiente bloqueia a venda inteira.
    const fail=await request('orders','POST',{...order,requestId:randomUUID(),items:[{productId:mug.id,quantity:2,unitPriceCents:100},{productId:mug.id,quantity:2,unitPriceCents:100}]});
    assert.equal(fail.status,409);assert.match(fail.data.error,/Estoque insuficiente/);
    assert.equal((await request('orders','POST',{...order,requestId:randomUUID(),customer:''})).status,400);

    // Financeiro: um lançamento por venda, com o total negociado.
    const statement=(await request('finance/statement?from=2091-02-01&to=2091-02-01')).data;
    assert.equal(statement.totals.income-before,13000);
    assert.equal(statement.items.filter(i=>i.id===sold.data.order.id).length,1);
    assert.equal(statement.items.find(i=>i.id===sold.data.order.id).actor_name,actor.name);

    // Lista de vendas com lucro estimado: (3500-750)*2 + (6000-2500).
    const list=(await request('orders?from=2091-02-01&to=2091-02-01')).data;
    assert.equal(list.count,1);assert.equal(list.totalCents,13000);assert.equal(list.profitCents,9000);

    // Contagem física: ajusta a diferença e é idempotente.
    assert.equal((await request(`products/${mug.id}/count`,'POST',{counted:1})).data.difference,-2);
    assert.equal((await request(`products/${mug.id}/count`,'POST',{counted:1})).data.difference,0);
    assert.equal((await request('products')).data.products.find(p=>p.id===mug.id).stock,1);
  }finally{
    server?.close();
    await client.query('ROLLBACK').catch(()=>{});client.release();await pool.end();
  }
});
