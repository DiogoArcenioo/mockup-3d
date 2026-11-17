import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import express from 'express';
import {createApp} from '../server/app.mjs';
import {createPool} from '../server/db.mjs';
import {readFile} from 'node:fs/promises';

test('extrato real: saldos, compras/vendas automáticas, sócios, despesas, auditoria e reenvio sem duplicidade',async()=>{
  const pool=createPool(),client=await pool.connect();let server;
  try{
    await client.query('BEGIN');
    for(const file of ['../server/schema.sql','../apps/api/src/schema.sql','../server/cashbook-schema.sql'])await client.query(await readFile(new URL(file,import.meta.url),'utf8'));
    const actor={id:randomUUID(),name:'Teste financeiro revertido'};
    await client.query(`INSERT INTO forma_auth.users(id,name,login,password_hash,role) VALUES($1,$2,$3,'test-disabled','user')`,[actor.id,actor.name,'cash-'+randomUUID().slice(0,30)]);
    const wrapper={async query(sql,values){
      if(sql==='BEGIN')return client.query('SAVEPOINT cash_request');
      if(sql==='COMMIT')return client.query('RELEASE SAVEPOINT cash_request');
      if(sql==='ROLLBACK')return client.query('ROLLBACK TO SAVEPOINT cash_request');
      return client.query(sql,values);
    },release(){}};
    const db={connect:async()=>wrapper,async query(...args){await client.query('SAVEPOINT cash_query');try{const result=await client.query(...args);await client.query('RELEASE SAVEPOINT cash_query');return result;}catch(error){await client.query('ROLLBACK TO SAVEPOINT cash_query');throw error;}}};
    const app=express();app.use((req,_res,next)=>{req.actor=actor;next();});app.use(createApp(db,{static:false,externalAuth:true}));
    server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
    async function request(path,method='GET',body){const response=await fetch(`http://127.0.0.1:${server.address().port}/api/`+path,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:response.status,data:await response.json()};}
    const range='finance/statement?from=2090-01-02&to=2090-01-03';
    const before=(await request(range)).data;
    const currentBefore=(await request('finance/statement')).data.totals.current;
    const product=(await request('products','POST',{name:'CASH TEST '+randomUUID(),type:'resale',category:'mug',unit:'un'})).data.product;
    assert.ok(product.id);
    const entry=await request('entries','POST',{requestId:randomUUID(),productId:product.id,purchasedAt:'2090-01-02',packaging:'unit',packageCount:10,unitsPerPackage:1,totalCents:4000});assert.equal(entry.status,201);
    const sale=await request('sales','POST',{requestId:randomUUID(),productId:product.id,soldAt:'2090-01-03',quantity:2,totalCents:5000});assert.equal(sale.status,201);
    const base={requestId:randomUUID(),kind:'income',occurredAt:'2090-01-01',amountCents:10000,description:'Saldo anterior de teste'};
    assert.equal((await request('finance/transactions','POST',base)).status,201);
    const payout={requestId:randomUUID(),kind:'partner_payment',occurredAt:'2090-01-03',amountCents:-2500,recipientId:actor.id,notes:'Observação do pagamento'};
    const first=await request('finance/transactions','POST',payout);assert.equal(first.status,201);
    assert.equal((await request('finance/transactions','POST',payout)).data.repeated,true);
    assert.equal((await request('finance/transactions','POST',{...payout,amountCents:-2600})).status,409);
    assert.equal((await request('finance/transactions','POST',{...payout,requestId:randomUUID(),recipientId:randomUUID()})).status,400);
    assert.equal((await request('finance/transactions','POST',{...payout,requestId:randomUUID(),amountCents:2500})).status,400);
    assert.equal((await request('finance/transactions','POST',{requestId:randomUUID(),kind:'expense',occurredAt:'2090-01-04',amountCents:-1500,description:'Internet teste'})).status,201);
    const after=(await request(range)).data;
    assert.equal(after.totals.opening-before.totals.opening,10000);
    assert.equal(after.totals.income-before.totals.income,5000);
    assert.equal(after.totals.outgoing-before.totals.outgoing,6500);
    assert.equal(after.totals.closing-before.totals.closing,8500);
    assert.equal(after.count-before.count,3);
    assert.equal(after.totals.current,currentBefore,'movimentações futuras não alteram o saldo atual');
    const row=after.items.find(item=>item.id===first.data.id);assert.equal(row.actor_name,actor.name);assert.equal(row.counterparty,actor.name);assert.equal(row.notes,payout.notes);
    const filtered=(await request(range+'&kind=partner_payment')).data;
    assert.deepEqual(filtered.totals,after.totals,'filtro de tipo preserva os saldos gerais');
    assert.ok(filtered.items.every(item=>item.kind==='partner_payment'));
    const entryRow=after.items.find(item=>item.id===entry.data.entry.id);assert.equal(entryRow.actor_name,actor.name);assert.equal(Number(entryRow.amount_cents),-4000);
    const stock=(await request('products')).data.products.find(item=>item.id===product.id);assert.equal(stock.stock,8);
    const users=(await request('finance/users')).data.users;assert.ok(users.some(user=>user.id===actor.id));assert.deepEqual(Object.keys(users[0]).sort(),['id','login','name']);
    const logs=(await client.query('SELECT * FROM forma_finance.activity_log WHERE actor_id=$1 ORDER BY id',[actor.id])).rows;
    assert.ok(logs.some(log=>log.entity==='products'&&log.operation==='INSERT'));
    assert.equal(logs.filter(log=>log.entity==='cash_transactions'&&log.entity_id===first.data.id).length,1);
    assert.ok(!JSON.stringify(logs).includes('password_hash'));
    assert.equal((await request('finance/statement?from=2090-01-04&to=2090-01-01')).status,400);
    assert.equal((await request('finance/statement?page=0')).status,400);
    assert.equal((await request('finance/activity')).status,200);
  }finally{await new Promise(resolve=>server?server.close(resolve):resolve());await client.query('ROLLBACK');client.release();await pool.end();}
});

test('pagamentos simultâneos usam conexões independentes e não descontam duas vezes',async()=>{
  const pool=createPool(),actor={id:randomUUID(),name:'QA pagamento temporário'};let server;
  try{
    await pool.query(`INSERT INTO forma_auth.users(id,name,login,password_hash,role) VALUES($1,$2,$3,'test-disabled','user')`,[actor.id,actor.name,'cash-race-'+randomUUID().slice(0,25)]);
    const app=express();app.use((req,_res,next)=>{req.actor=actor;next();});app.use(createApp(pool,{static:false,externalAuth:true}));
    server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
    const body={requestId:randomUUID(),kind:'partner_payment',recipientId:actor.id,amountCents:-1234,occurredAt:'2090-01-03',notes:'Teste de concorrência'};
    const post=async()=>{const response=await fetch(`http://127.0.0.1:${server.address().port}/api/finance/transactions`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return{status:response.status,data:await response.json()};};
    const race=await Promise.all([post(),post()]);assert.deepEqual(race.map(result=>result.status).sort(),[200,201]);
    assert.equal(race[0].data.id,race[1].data.id);
    const saved=(await pool.query('SELECT count(*),sum(amount_cents) amount FROM forma_finance.cash_transactions WHERE request_id=$1',[body.requestId])).rows[0];
    assert.equal(Number(saved.count),1);assert.equal(Number(saved.amount),-1234);
    const audit=(await pool.query("SELECT * FROM forma_finance.activity_log WHERE actor_id=$1 AND entity='cash_transactions'",[actor.id])).rows;
    assert.equal(audit.length,1);assert.equal(audit[0].actor_name,actor.name);
    const reused=(await pool.query("SELECT nullif(current_setting('infinity.actor_id',true),'') actor_id")).rows[0];assert.equal(reused.actor_id,null);
  }finally{
    if(server)await new Promise(resolve=>server.close(resolve));
    const client=await pool.connect();try{
      await client.query('BEGIN');
      const ids=(await client.query('DELETE FROM forma_finance.cash_transactions WHERE recipient_id=$1 RETURNING id',[actor.id])).rows.map(row=>row.id);
      await client.query('DELETE FROM forma_auth.users WHERE id=$1',[actor.id]);
      await client.query('DELETE FROM forma_finance.activity_log WHERE actor_id=$1 OR entity_id=$1 OR entity_id=ANY($2::uuid[])',[actor.id,ids]);
      await client.query('COMMIT');
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();await pool.end();}
  }
});
