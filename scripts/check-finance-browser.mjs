import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createPool } from '../server/db.mjs';
import { createApp } from '../server/app.mjs';

const pool=createPool();const client=await pool.connect();let server,browser;
try{
  await client.query('BEGIN');
  const transactionalClient={async query(sql,values){
    if(sql==='BEGIN')return client.query('SAVEPOINT browser_request');
    if(sql==='COMMIT')return client.query('RELEASE SAVEPOINT browser_request');
    if(sql==='ROLLBACK')return client.query('ROLLBACK TO SAVEPOINT browser_request');
    return client.query(sql,values);
  },release(){}};
  let queryQueue=Promise.resolve();
  const testPool={query(...args){const operation=queryQueue.then(async()=>{await client.query('SAVEPOINT browser_query');try{const result=await client.query(...args);await client.query('RELEASE SAVEPOINT browser_query');return result;}catch(error){await client.query('ROLLBACK TO SAVEPOINT browser_query');await client.query('RELEASE SAVEPOINT browser_query');throw error;}});queryQueue=operation.catch(()=>{});return operation;},connect:async()=>transactionalClient};
  server=createApp(testPool,{password:'browser-test-access',secure:false}).listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  browser=await chromium.launch({channel:'chrome',headless:true});
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,serviceWorkers:'block'});
  const page=await context.newPage();const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.getByLabel('Senha de acesso').fill('browser-test-access');
  await page.getByRole('button',{name:'Entrar',exact:false}).click();
  await page.getByText('Dados sincronizados').waitFor();
  async function product(name,type,unit,min){
    await page.getByRole('button',{name:'Novo produto',exact:true}).click();
    await page.getByLabel('Nome do produto').fill(name);
    await page.getByRole('radio',{name:type}).check();
    if(type==='Produto para revenda')await page.getByLabel('Categoria',{exact:true}).selectOption('mug');
    await page.getByLabel('Unidade de controle').selectOption(unit);
    await page.getByLabel('Estoque mínimo').fill(String(min));
    await page.getByRole('button',{name:'Salvar produto',exact:true}).click();
    await page.locator('#product-dialog').waitFor({state:'hidden'});
    await page.getByRole('heading',{name,exact:true}).waitFor();
  }
  await product('Caneca branca 325 ml (teste)','Produto para revenda','un',10);
  await product('Tinta sublimática (teste)','Produto para uso e consumo','ml',100);
  await product('Papel sublimático (teste)','Produto para uso e consumo','folha',50);
  await mkdir('.playwright',{recursive:true});
  for(const width of [360,390,768,1440]){
    await page.setViewportSize({width,height:900});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Produtos transbordam em ${width}px`);
  }
  await page.screenshot({path:'.playwright/finance-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'.playwright/finance-products-mobile.png',fullPage:true});
  await page.getByRole('button',{name:'Uso e consumo',exact:true}).click();
  assert.equal(await page.locator('.f-product-card').count(),2);
  await page.getByRole('button',{name:'Todos',exact:true}).click();
  await page.getByLabel('Buscar produto').fill('Caneca branca');
  assert.equal(await page.locator('.f-product-card').count(),1);
  await page.getByRole('button',{name:'Editar Caneca branca 325 ml (teste)'}).click();
  await page.screenshot({path:'.playwright/finance-product-form.png',fullPage:true});
  await page.getByRole('button',{name:'Cancelar',exact:true}).click();
  await page.locator('.f-product-card').getByRole('button',{name:'Entrada',exact:true}).click();
  await page.locator('#units-per-package').fill('24');
  await page.locator('#entry-total').fill('180,00');
  await page.getByLabel('Fornecedor').fill('Fornecedor de teste');
  assert.equal(await page.locator('#preview-quantity').textContent(),'24 un.');
  assert.ok((await page.locator('#preview-cost').textContent()).includes('7,50'));
  for(const width of [360,390,768,1440]){
    await page.setViewportSize({width,height:900});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Entrada transborda em ${width}px`);
  }
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'.playwright/finance-entry-mobile.png',fullPage:true});
  await page.locator('#entry-total').fill('0');
  await page.getByRole('button',{name:'Registrar entrada',exact:true}).click();
  assert.ok((await page.locator('#entry-error').textContent()).includes('maior que zero'));
  await page.locator('#entry-total').fill('180,00');
  const requestIds=[];let loseFirstResponse=true;
  await page.route('**/api/entries',async route=>{
    if(route.request().method()!=='POST')return route.continue();
    requestIds.push(route.request().postDataJSON().requestId);
    if(loseFirstResponse){loseFirstResponse=false;const response=await route.fetch();assert.equal(response.status(),201);return route.abort('failed');}
    return route.continue();
  });
  await page.getByRole('button',{name:'Registrar entrada',exact:true}).click();
  await page.locator('#entry-error').filter({hasText:'Sem conexão'}).waitFor();
  await page.getByRole('button',{name:'Registrar entrada',exact:true}).click();
  await page.getByRole('heading',{name:'Histórico de entradas'}).waitFor();
  await page.locator('.f-history-card').waitFor();
  assert.equal(await page.locator('.f-history-card').count(),1);
  assert.equal(requestIds.length,2);assert.equal(requestIds[0],requestIds[1]);
  assert.ok((await page.locator('.f-history-values').textContent()).includes('7,50'));
  await page.screenshot({path:'.playwright/finance-history-mobile.png',fullPage:true});
  await page.locator('.f-bottom-nav').getByRole('link',{name:'Estoque',exact:true}).click();
  await page.getByRole('heading',{name:'Seu estoque'}).waitFor();
  const card=page.locator('.f-product-card').filter({hasText:'Caneca branca'});
  assert.ok((await card.locator('.f-stock-line').textContent()).includes('24'));
  await card.getByRole('button',{name:'Ver movimentações'}).click();
  await page.locator('.f-price-row').waitFor();
  await page.screenshot({path:'.playwright/finance-price-history.png',fullPage:true});
  await page.getByRole('button',{name:'Fechar',exact:true}).filter({visible:true}).click();
  await page.getByRole('button',{name:'Sair',exact:true}).click();
  await page.locator('#login-dialog').waitFor({state:'visible'});
  assert.equal(await page.locator('.f-product-card').count(),0);
  await page.getByRole('link',{name:'Abrir Mockup Studio'}).click();
  await page.getByRole('heading',{name:'Sua arte, em outra dimensão.'}).waitFor();
  await page.locator('#loading').waitFor({state:'hidden',timeout:30000});
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('Navegador validado: cadastro, tipos, busca, entrada 24 × R$ 7,50, estoque, histórico, login e Mockup Studio. Layout sem overflow em 360, 390, 768 e 1440 px.');
}finally{
  if(browser)await browser.close();
  if(server)await new Promise(resolve=>server.close(resolve));
  await client.query('ROLLBACK');client.release();await pool.end();
}
