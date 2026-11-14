import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createApp } from '../server/app.mjs';
import { createPool } from '../server/db.mjs';

test('PostgreSQL real: estoque, histórico, custos, validação, autenticação e rollback',{skip:process.env.RUN_FINANCE_INTEGRATION!=='1'},async()=>{
  const pool=createPool();const client=await pool.connect();let server;
  try{
    await client.query('BEGIN');
    let failNextMovement=false;
    const transactionalClient={
      async query(sql,values){
        if(sql==='BEGIN')return client.query('SAVEPOINT finance_test_request');
        if(sql==='COMMIT')return client.query('RELEASE SAVEPOINT finance_test_request');
        if(sql==='ROLLBACK')return client.query('ROLLBACK TO SAVEPOINT finance_test_request');
        if(failNextMovement && sql.startsWith('INSERT INTO forma_finance.stock_movements')){failNextMovement=false;return client.query('SELECT 1/0');}
        return client.query(sql,values);
      },release(){},
    };
    const testPool={async query(...args){
      await client.query('SAVEPOINT finance_test_query');
      try{const result=await client.query(...args);await client.query('RELEASE SAVEPOINT finance_test_query');return result;}
      catch(error){await client.query('ROLLBACK TO SAVEPOINT finance_test_query');await client.query('RELEASE SAVEPOINT finance_test_query');throw error;}
    },connect:async()=>transactionalClient};
    server=createApp(testPool,{static:false,password:'integration-only-password',secure:false}).listen(0,'127.0.0.1');
    await new Promise(resolve=>server.once('listening',resolve));
    const base=`http://127.0.0.1:${server.address().port}/api/`;let cookie='';
    async function request(path,method='GET',body){const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',Cookie:cookie},body:body===undefined?undefined:JSON.stringify(body)});const data=await response.json();return {status:response.status,data,cookie:response.headers.get('set-cookie')};}
    async function uploadPhoto(id,body,mime='image/png'){const response=await fetch(base+'products/'+id+'/photo',{method:'PUT',headers:{'Content-Type':mime,Cookie:cookie},body});return {status:response.status,data:await response.json()};}
    assert.equal((await request('products')).status,401);
    assert.equal((await request('session','POST',{password:'wrong'})).status,401);
    const login=await request('session','POST',{password:'integration-only-password'});assert.equal(login.status,200);cookie=login.cookie.split(';')[0];
    assert.equal((await request('health')).status,200);
    const name='TESTE ROLLBACK '+randomUUID();
    let p=await request('products','POST',{name,type:'resale',category:'mug',unit:'un',minStock:10});assert.equal(p.status,201);const id=p.data.product.id;
    assert.equal((await request('products','POST',{name:name.toLowerCase(),type:'resale',category:'mug',unit:'un'})).status,409);
    const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j0OYAAAAASUVORK5CYII=','base64');
    assert.equal((await request('products/'+id+'/photo')).status,404);
    assert.equal((await uploadPhoto(id,Buffer.from('<svg/>'),'image/svg+xml')).status,415);
    assert.equal((await uploadPhoto(id,png,'image/jpeg')).status,400);
    assert.equal((await uploadPhoto(id,Buffer.alloc(3*1024*1024+1))).status,413);
    assert.equal((await uploadPhoto(randomUUID(),png)).status,404);
    const uploaded=await uploadPhoto(id,png);assert.equal(uploaded.status,200);assert.match(uploaded.data.photoUrl,new RegExp('/products/'+id+'/photo'));
    const image=await fetch(base+'products/'+id+'/photo',{headers:{Cookie:cookie}});assert.equal(image.status,200);assert.equal(image.headers.get('content-type'),'image/png');assert.equal(image.headers.get('cache-control'),'no-store');assert.deepEqual(Buffer.from(await image.arrayBuffer()),png);
    assert.equal((await request('products')).data.products.find(product=>product.id===id).photoUrl,uploaded.data.photoUrl);
    const replaced=await uploadPhoto(id,png);assert.equal(replaced.status,200);assert.notEqual(replaced.data.photoUrl,uploaded.data.photoUrl);
    assert.equal((await request('products/'+id+'/photo','DELETE',{})).status,200);
    assert.equal((await request('products/'+id+'/photo')).status,404);
    assert.equal((await request('products')).data.products.find(product=>product.id===id).photoUrl,null);
    const catalog=await request('colors');assert.equal(catalog.status,200);
    const white=catalog.data.colors.find(c=>c.name==='Branco'),black=catalog.data.colors.find(c=>c.name==='Preto');assert.ok(white&&black);
    assert.equal((await request('colors','POST',{name:'  preto  '})).data.item.id,black.id);
    assert.equal((await request('colors','POST',{name:'  '})).status,400);
    assert.equal((await request('colors','POST',{name:'x'.repeat(61)})).status,400);
    const customColor=await request('colors','POST',{name:'Cor de teste '+randomUUID()});assert.equal(customColor.status,201);
    assert.equal((await request('colors','POST',{name:customColor.data.item.name.toUpperCase()})).data.item.id,customColor.data.item.id);
    const brandCatalog=await request('brands');assert.ok(brandCatalog.data.brands.some(b=>b.name==='Nike'));assert.ok(brandCatalog.data.brands.some(b=>b.name==='Adidas'));
    const customBrand=await request('brands','POST',{name:'Marca de teste '+randomUUID()});assert.equal(customBrand.status,201);
    assert.equal((await request('brands','POST',{name:customBrand.data.item.name.toUpperCase()})).data.item.id,customBrand.data.item.id);
    const variant={name,type:'resale',unit:'un',category:'mug',colorId:white.id};
    const whiteMug=await request('products','POST',variant);assert.equal(whiteMug.status,201);assert.equal(whiteMug.data.product.colorName,'Branco');
    assert.equal((await request('products','POST',{...variant,colorId:black.id})).status,201);
    assert.equal((await request('products','POST',variant)).status,409);
    assert.equal((await request('products','POST',{...variant,colorId:randomUUID()})).status,400);
    assert.equal((await request('products','POST',{...variant,brandId:customBrand.data.item.id})).status,400);
    const shirt=await request('products','POST',{...variant,category:'tshirt',brandId:customBrand.data.item.id});assert.equal(shirt.status,201);assert.equal(shirt.data.product.brandName,customBrand.data.item.name);
    const charger=await request('products','POST',{...variant,category:'mobile_accessory',colorId:null});assert.equal(charger.status,201);assert.equal(charger.data.product.colorId,null);
    assert.equal((await request('products','POST',{...variant,category:'invalid'})).status,400);
    assert.equal((await request('products','POST',{...variant,category:null})).status,400);
    assert.equal((await request('products?category=invalid')).status,400);
    for(const category of ['mug','tshirt','mobile_accessory']){const filtered=await request('products?category='+category);assert.equal(filtered.status,200);assert.ok(filtered.data.products.length);assert.ok(filtered.data.products.every(p=>p.category===category));}
    const noCategory=await request('products?category=uncategorized');assert.equal(noCategory.status,200);assert.ok(noCategory.data.products.every(p=>p.category===null));
    const payload={requestId:randomUUID(),productId:id,purchasedAt:'2026-10-14',packaging:'box',packageCount:1,unitsPerPackage:24,totalCents:18000,supplier:'Fornecedor de teste',notes:'Teste revertido ao final'};
    const first=await request('entries','POST',payload);assert.equal(first.status,201);assert.equal(first.data.entry.unitCost,7.5);assert.equal(first.data.entry.quantity,24);
    const duplicate=await request('entries','POST',payload);assert.equal(duplicate.status,200);assert.equal(duplicate.data.entry.id,first.data.entry.id);
    assert.equal((await request('entries','POST',{...payload,totalCents:19000})).status,409);
    assert.equal((await request('entries','POST',{...payload,requestId:randomUUID(),totalCents:0})).status,400);
    assert.equal((await request('entries','POST',{...payload,requestId:randomUUID(),productId:randomUUID()})).status,404);
    const second=await request('entries','POST',{...payload,requestId:randomUUID(),purchasedAt:'2026-10-15',totalCents:21600});assert.equal(second.status,201);
    const list=await request('products');p=list.data.products.find(p=>p.id===id);assert.equal(p.stock,48);assert.equal(p.lastCost,9);assert.equal(p.averageCost,8.25);assert.equal(p.purchaseTotalCents,39600);
    assert.equal((await request('products/'+id,'PUT',{name,type:'resale',category:'mug',unit:'ml'})).status,400);
    assert.equal((await request('products/'+id,'PUT',{name:name+' editado',type:'consumption',unit:'un',minStock:20,notes:'Editado'})).status,200);
    const history=await request('entries?productId='+id);assert.equal(history.data.count,2);assert.equal(history.data.totalCents,39600);assert.equal(history.data.entries[0].productName,name);assert.equal(history.data.entries[0].productType,'resale');assert.equal(history.data.entries[0].purchasedAt,'2026-10-15');
    const filtered=await request('entries?productId='+id+'&from=2026-10-14&to=2026-10-14');assert.equal(filtered.data.count,1);
    assert.equal((await request('entries?from=2026-10-15&to=2026-10-14')).status,400);
    assert.equal((await request('entries?page=0')).status,400);
    assert.equal((await request('summary?month=2026-13')).status,400);
    const stats=await request('summary?month=2026-10');assert.equal(stats.status,200);assert.ok(stats.data.totalCents>=39600);
    const movement=await client.query('SELECT count(*) count,sum(quantity) qty FROM forma_finance.stock_movements WHERE product_id=$1',[id]);assert.equal(Number(movement.rows[0].count),2);assert.equal(Number(movement.rows[0].qty),48);
    const variantEntry=await request('entries','POST',{...payload,requestId:randomUUID(),productId:shirt.data.product.id});assert.equal(variantEntry.status,201);assert.equal(variantEntry.data.entry.productColor,'Branco');assert.equal(variantEntry.data.entry.productCategory,'tshirt');assert.equal(variantEntry.data.entry.productBrand,customBrand.data.item.name);
    const edited=await request('products/'+shirt.data.product.id,'PUT',{name:name+' camiseta editada',type:'resale',unit:'un',category:'tshirt',colorId:black.id,brandId:null});assert.equal(edited.status,200);assert.equal(edited.data.product.colorName,'Preto');assert.equal(edited.data.product.brandId,null);
    const variantHistory=await request('entries?productId='+shirt.data.product.id);assert.equal(variantHistory.data.entries[0].productColor,'Branco');assert.equal(variantHistory.data.entries[0].productBrand,customBrand.data.item.name);
    failNextMovement=true;
    const failedRequest={...payload,requestId:randomUUID()};
    assert.equal((await request('entries','POST',failedRequest)).status,503);
    assert.equal(Number((await client.query('SELECT count(*) count FROM forma_finance.entries WHERE request_id=$1',[failedRequest.requestId])).rows[0].count),0);
    assert.equal(Number((await client.query('SELECT sum(quantity) qty FROM forma_finance.stock_movements WHERE product_id=$1',[id])).rows[0].qty),48);
    const shirtId=shirt.data.product.id;
    const salePayload={productId:shirtId,requestId:randomUUID(),soldAt:'2026-11-14',quantity:2,totalCents:7000,customer:'Cliente de teste',notes:'Teste revertido'};
    const sold=await request('sales','POST',salePayload);assert.equal(sold.status,201);assert.equal(sold.data.sale.unitPrice,35);assert.equal(sold.data.sale.productColor,'Preto');
    assert.equal((await request('sales','POST',salePayload)).status,200);
    assert.equal((await request('sales','POST',{...salePayload,totalCents:7100})).status,409);
    assert.equal((await request('sales','POST',{...salePayload,requestId:randomUUID(),quantity:23})).status,409);
    assert.equal((await request('sales','POST',{...salePayload,requestId:randomUUID(),quantity:1.5})).status,400);
    assert.equal((await request('sales','POST',{...salePayload,requestId:randomUUID(),productId:id})).status,400);
    assert.equal((await request('sales','POST',{...salePayload,requestId:randomUUID(),productId:charger.data.product.id})).status,409);
    assert.equal((await request('sales','POST',{...salePayload,requestId:randomUUID(),productId:randomUUID()})).status,404);
    const afterSale=(await request('products')).data.products.find(product=>product.id===shirtId);assert.equal(afterSale.stock,22);assert.equal(afterSale.purchaseTotalCents,18000);
    const movements=await request('movements?productId='+shirtId);assert.equal(movements.status,200);assert.equal(movements.data.count,2);assert.equal(movements.data.purchaseTotalCents,18000);assert.equal(movements.data.salesTotalCents,7000);assert.equal(movements.data.entries[0].kind,'sale');assert.equal(movements.data.entries[0].customer,'Cliente de teste');assert.equal(movements.data.entries[1].kind,'purchase');
    const onlySales=await request('movements?productId='+shirtId+'&kind=sale&from=2026-11-14&to=2026-11-14');assert.equal(onlySales.data.count,1);assert.equal(onlySales.data.purchaseTotalCents,0);assert.equal(onlySales.data.salesTotalCents,7000);
    const onlyPurchases=await request('movements?productId='+shirtId+'&kind=purchase');assert.equal(onlyPurchases.data.count,1);assert.equal(onlyPurchases.data.salesTotalCents,0);
    for(const query of['kind=invalid','page=0','productId=invalid','from=2026-11-15&to=2026-11-14'])assert.equal((await request('movements?'+query)).status,400);
    failNextMovement=true;
    const failedSale={...salePayload,requestId:randomUUID()};assert.equal((await request('sales','POST',failedSale)).status,503);
    assert.equal(Number((await client.query('SELECT count(*) count FROM forma_finance.sales WHERE request_id=$1',[failedSale.requestId])).rows[0].count),0);
    assert.equal(Number((await client.query('SELECT sum(quantity) qty FROM forma_finance.stock_movements WHERE product_id=$1',[shirtId])).rows[0].qty),22);
    assert.equal((await request('sales','POST',failedSale)).status,201);
    assert.equal((await request('sales','POST',failedSale)).status,200);
    assert.equal(Number((await client.query('SELECT sum(quantity) qty FROM forma_finance.stock_movements WHERE product_id=$1',[shirtId])).rows[0].qty),20);
    assert.equal((await request('session','DELETE',{})).status,200);
    cookie='forma_session=9999999999999.invalid';assert.equal((await request('products')).status,401);assert.equal((await request('products/'+id+'/photo')).status,401);
  }finally{
    if(server)await new Promise(resolve=>server.close(resolve));
    await client.query('ROLLBACK');client.release();await pool.end();
  }
});

test('vendas simultâneas não consomem a mesma última unidade',{skip:process.env.RUN_FINANCE_INTEGRATION!=='1'},async()=>{
  const pool=createPool();let server,productId;
  try{
    server=createApp(pool,{static:false,password:''}).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
    const base=`http://127.0.0.1:${server.address().port}/api/`;
    async function post(resource,body){const response=await fetch(base+resource,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return{status:response.status,data:await response.json()};}
    const product=await post('products',{name:'QA CONCORRÊNCIA '+randomUUID(),type:'resale',category:'mug',unit:'un'});assert.equal(product.status,201);productId=product.data.product.id;
    assert.equal((await post('entries',{productId,requestId:randomUUID(),purchasedAt:'2026-11-14',packaging:'unit',packageCount:1,unitsPerPackage:1,totalCents:1000})).status,201);
    const sale={productId,requestId:randomUUID(),soldAt:'2026-11-14',quantity:1,totalCents:3500};
    const other={...sale,requestId:randomUUID()};
    const race=await Promise.all([post('sales',sale),post('sales',other)]);assert.deepEqual(race.map(result=>result.status).sort(),[201,409]);
    const winner=race[0].status===201?sale:other;
    const retries=await Promise.all([post('sales',winner),post('sales',winner)]);assert.ok(retries.every(result=>result.status===200));
    assert.equal(Number((await pool.query('SELECT sum(quantity) qty FROM forma_finance.stock_movements WHERE product_id=$1',[productId])).rows[0].qty),0);
    assert.equal(Number((await pool.query('SELECT count(*) count FROM forma_finance.sales WHERE product_id=$1',[productId])).rows[0].count),1);
  }finally{
    if(server)await new Promise(resolve=>server.close(resolve));
    if(productId){const client=await pool.connect();try{await client.query('BEGIN');for(const table of['stock_movements','sales','entries'])await client.query(`DELETE FROM forma_finance.${table} WHERE product_id=$1`,[productId]);await client.query('DELETE FROM forma_finance.products WHERE id=$1',[productId]);await client.query(`DELETE FROM forma_finance.activity_log WHERE (entity='products' AND entity_id=$1) OR coalesce(after_data->>'product_id',before_data->>'product_id')=$1::text`,[productId]);await client.query('COMMIT');}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}}
    await pool.end();
  }
});
