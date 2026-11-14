import express from 'express';
import { randomUUID, createHmac, timingSafeEqual, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ValidationError, productInput, entryInput, saleInput, uuid, dateInput, textField, CATEGORIES } from './finance.mjs';
import { validateProductPhoto } from './product-photo.mjs';
import { actorPool, actors } from './actor-pool.mjs';
import { registerCashbook } from './cashbook.mjs';

const equal = (a, b) => timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());
const productSelect = `SELECT p.*, photo.version AS photo_version, color.name AS color_name, brand.name AS brand_name, COALESCE(s.stock,0) AS stock, COALESCE(b.total_cents,0) AS purchase_total_cents,
  COALESCE(b.quantity,0) AS purchased_quantity, b.total_cents::numeric / NULLIF(b.quantity,0) / 100 AS average_cost,
  latest.unit_cost AS last_cost, latest.purchased_at::text AS last_purchase_date,
  (b.quantity IS NOT NULL) AS has_entries
  FROM forma_finance.products p
  LEFT JOIN forma_finance.product_photos photo ON photo.product_id=p.id
  LEFT JOIN forma_finance.product_colors color ON color.id=p.color_id
  LEFT JOIN forma_finance.product_brands brand ON brand.id=p.brand_id
  LEFT JOIN (SELECT product_id,sum(quantity) stock FROM forma_finance.stock_movements GROUP BY product_id) s ON s.product_id=p.id
  LEFT JOIN (SELECT product_id,sum(total_cents) total_cents,sum(quantity) quantity FROM forma_finance.entries GROUP BY product_id) b ON b.product_id=p.id
  LEFT JOIN LATERAL (SELECT unit_cost,purchased_at FROM forma_finance.entries WHERE product_id=p.id ORDER BY purchased_at DESC,created_at DESC,id DESC LIMIT 1) latest ON true`;
const mapProduct = p => ({ id:p.id, name:p.name, type:p.type, unit:p.unit, category:p.category, colorId:p.color_id, colorName:p.color_name, brandId:p.brand_id, brandName:p.brand_name, photoUrl:p.photo_version?`/api/products/${p.id}/photo?v=${p.photo_version}`:null, minStock:Number(p.min_stock), notes:p.notes, stock:Number(p.stock), purchaseTotalCents:Number(p.purchase_total_cents), purchasedQuantity:Number(p.purchased_quantity), averageCost:p.average_cost === null ? null : Number(p.average_cost), lastCost:p.last_cost === null ? null : Number(p.last_cost), lastPurchaseDate:p.last_purchase_date, hasEntries:p.has_entries });
const mapEntry = e => ({ id:e.id, productId:e.product_id, productName:e.product_name, productType:e.product_type, productCategory:e.product_category, productColor:e.product_color, productBrand:e.product_brand, unit:e.unit, purchasedAt:e.purchased_at_text, packaging:e.packaging, packageCount:e.package_count, unitsPerPackage:Number(e.units_per_package), quantity:Number(e.quantity), totalCents:Number(e.total_cents), unitCost:Number(e.unit_cost), supplier:e.supplier, notes:e.notes, createdAt:e.created_at });
const entrySelect = `SELECT *, purchased_at::text AS purchased_at_text FROM forma_finance.entries`;
const saleSelect = `SELECT *,sold_at::text AS sold_at_text FROM forma_finance.sales`;
const mapSale = s => ({id:s.id,productId:s.product_id,productName:s.product_name,productType:s.product_type,productCategory:s.product_category,productColor:s.product_color,productBrand:s.product_brand,unit:s.unit,soldAt:s.sold_at_text,quantity:Number(s.quantity),totalCents:Number(s.total_cents),unitPrice:Number(s.total_cents)/100/Number(s.quantity),customer:s.customer,notes:s.notes,createdAt:s.created_at});
const movementsSelect = `SELECT id,product_id,product_name,product_type,product_category,product_color,product_brand,unit,
  purchased_at AS occurred_at,quantity,total_cents,unit_cost,packaging,package_count,units_per_package,supplier AS counterparty,notes,created_at,'purchase' AS kind FROM forma_finance.entries
  UNION ALL SELECT id,product_id,product_name,product_type,product_category,product_color,product_brand,unit,
  sold_at,quantity,total_cents,total_cents::numeric/100/quantity,'unit',1,quantity,customer,notes,created_at,'sale' FROM forma_finance.sales`;

export function createApp(pool, options = {}) {
  pool=actorPool(pool);
  const password = options.password ?? process.env.FINANCE_PASSWORD ?? '';
  const secure = options.secure ?? process.env.COOKIE_SECURE === 'true';
  const signingKey = options.signingKey ?? password;
  const sign = value => createHmac('sha256', signingKey).update(value).digest('hex');
  const attempts = new Map();
  const app = express();
  app.disable('x-powered-by');
  app.use((req,_res,next)=>actors.run(req.actor,next));
  app.use(express.json({ limit:'24kb' }));
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control','no-store');
    res.set('X-Content-Type-Options','nosniff');
    // JSON writes and same-origin browser requests prevent cross-site form submissions.
    if (!['GET','HEAD'].includes(req.method)) {
      if (req.headers['sec-fetch-site'] === 'cross-site') return res.status(403).json({error:'Acesso não permitido.'});
      const photoUpload=req.method==='PUT'&&/^\/products\/[^/]+\/photo\/?$/.test(req.path);
      if (photoUpload ? !req.is(['image/jpeg','image/png','image/webp']) : !req.is('application/json')) return res.status(415).json({error:photoUpload?'Use uma foto JPG, PNG ou WebP.':'Envie os dados em JSON.'});
    }
    next();
  });
  app.post('/api/session', (req,res) => {
    if (!password) return res.json({ok:true});
    const now = Date.now();
    for (const [key, value] of attempts) if (now - value.start > 15*60*1000) attempts.delete(key);
    const record = attempts.get(req.ip) ?? {start:now,count:0};
    if (record.count >= 10) return res.status(429).json({error:'Muitas tentativas. Tente novamente em 15 minutos.'});
    if (typeof req.body?.password !== 'string' || !equal(req.body.password,password)) {
      record.count++; attempts.set(req.ip,record);
      return res.status(401).json({error:'Senha incorreta.'});
    }
    attempts.delete(req.ip);
    const expires = String(now + 7*24*60*60*1000);
    res.cookie('forma_session',`${expires}.${sign(expires)}`,{httpOnly:true,secure,sameSite:'strict',maxAge:7*24*60*60*1000,path:'/api'});
    res.json({ok:true});
  });
  app.use('/api', (req,res,next) => {
    if (options.externalAuth || !password) return next();
    const cookie = (req.headers.cookie ?? '').split(';').map(v=>v.trim()).find(v=>v.startsWith('forma_session='))?.slice(14) ?? '';
    const [expires, signature] = cookie.split('.');
    if (!expires || !signature || !/^\d+$/.test(expires) || Number(expires) < Date.now() || Number(expires) > Date.now()+7*24*60*60*1000 || !equal(sign(expires),signature)) return res.status(401).json({error:'Entre para acessar a gestão.'});
    next();
  });
  app.delete('/api/session', (req,res) => { res.clearCookie('forma_session',{path:'/api',httpOnly:true,secure,sameSite:'strict'}); res.json({ok:true}); });
  app.get('/api/health', async (_req,res) => { await pool.query('SELECT 1'); res.json({ok:true,protected:Boolean(password)}); });
  for (const [resource, table] of [['colors','product_colors'],['brands','product_brands']]) {
    app.get('/api/'+resource, async (_req,res) => {
      const { rows } = await pool.query(`SELECT id,name FROM forma_finance.${table} ORDER BY lower(name),id`);
      res.json({ [resource]:rows });
    });
    app.post('/api/'+resource, async (req,res) => {
      const name = textField(req.body?.name, resource === 'colors' ? 'Cor' : 'Marca', 60, true);
      const { rows:[item] } = await pool.query(`INSERT INTO forma_finance.${table}(id,name) VALUES($1,$2)
        ON CONFLICT (lower(trim(name))) DO UPDATE SET name=${table}.name RETURNING id,name`,[randomUUID(),name]);
      res.status(201).json({ item });
    });
  }
  app.get('/api/products', async (req,res) => {
    const category=req.query.category;
    if (category !== undefined && !CATEGORIES.includes(category) && category !== 'uncategorized') throw new ValidationError('Categoria inválida.');
    const where = category === 'uncategorized' ? ' WHERE p.category IS NULL' : category ? ' WHERE p.category=$1' : '';
    const { rows } = await pool.query(productSelect+where+' ORDER BY lower(p.name),p.id',category && category !== 'uncategorized' ? [category] : []);
    res.json({products:rows.map(mapProduct)});
  });
  app.post('/api/products', async (req,res) => {
    const p = productInput(req.body);
    const id = randomUUID();
    await pool.query(`INSERT INTO forma_finance.products (id,name,type,unit,min_stock,notes,category,color_id,brand_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[id,p.name,p.type,p.unit,p.minStock,p.notes,p.category,p.colorId,p.brandId]);
    res.status(201).json({product:mapProduct((await pool.query(productSelect+' WHERE p.id=$1',[id])).rows[0])});
  });
  app.put('/api/products/:id', async (req,res) => {
    const id = uuid(req.params.id); const p = productInput(req.body);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const current = (await client.query('SELECT unit FROM forma_finance.products WHERE id=$1 FOR UPDATE',[id])).rows[0];
      if (!current) throw new ValidationError('Produto não encontrado.',404);
      if (current.unit !== p.unit && (await client.query('SELECT 1 FROM forma_finance.stock_movements WHERE product_id=$1 LIMIT 1',[id])).rowCount) throw new ValidationError('A unidade não pode mudar depois de movimentar o estoque.');
      await client.query('UPDATE forma_finance.products SET name=$2,type=$3,unit=$4,min_stock=$5,notes=$6,category=$7,color_id=$8,brand_id=$9,updated_at=now() WHERE id=$1',[id,p.name,p.type,p.unit,p.minStock,p.notes,p.category,p.colorId,p.brandId]);
      const saved = (await client.query(productSelect+' WHERE p.id=$1',[id])).rows[0];
      await client.query('COMMIT'); res.json({product:mapProduct(saved)});
    } catch(error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  });
  app.get('/api/products/:id/photo', async(req,res)=>{
    const id=uuid(req.params.id);
    const {rows:[photo]}=await pool.query('SELECT mime_type,content FROM forma_finance.product_photos WHERE product_id=$1',[id]);
    if(!photo)throw new ValidationError('Foto não encontrada.',404);
    res.type(photo.mime_type).send(photo.content);
  });
  app.put('/api/products/:id/photo',express.raw({type:['image/jpeg','image/png','image/webp'],limit:'3mb'}),async(req,res)=>{
    const id=uuid(req.params.id),mime=req.get('Content-Type')?.split(';')[0].trim().toLowerCase();
    const content=validateProductPhoto(req.body,mime),version=randomUUID();
    const {rowCount}=await pool.query(`INSERT INTO forma_finance.product_photos(product_id,version,mime_type,content)
      SELECT id,$2,$3,$4 FROM forma_finance.products WHERE id=$1
      ON CONFLICT(product_id) DO UPDATE SET version=EXCLUDED.version,mime_type=EXCLUDED.mime_type,content=EXCLUDED.content,updated_at=now()`,[id,version,mime,content]);
    if(!rowCount)throw new ValidationError('Produto não encontrado.',404);
    res.json({photoUrl:`/api/products/${id}/photo?v=${version}`});
  });
  app.delete('/api/products/:id/photo',async(req,res)=>{
    const id=uuid(req.params.id);
    if(!(await pool.query('SELECT 1 FROM forma_finance.products WHERE id=$1',[id])).rowCount)throw new ValidationError('Produto não encontrado.',404);
    await pool.query('DELETE FROM forma_finance.product_photos WHERE product_id=$1',[id]);
    res.json({photoUrl:null});
  });
  app.get('/api/summary', async (req,res) => {
    const month = typeof req.query.month === 'string' ? req.query.month : new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit'}).format(new Date());
    if (!/^\d{4}-\d{2}$/.test(month)) throw new ValidationError('Mês inválido.');
    const start = dateInput(month+'-01');
    const { rows:[p] } = await pool.query(`SELECT COALESCE(sum(total_cents),0) total, count(*) count FROM forma_finance.entries WHERE purchased_at >= $1::date AND purchased_at < $1::date + interval '1 month'`,[start]);
    res.json({month,totalCents:Number(p.total),entryCount:Number(p.count)});
  });
  app.get('/api/entries', async (req,res) => {
    const params=[]; const filters=[];
    if (req.query.productId) { params.push(uuid(req.query.productId)); filters.push(`product_id=$${params.length}`); }
    for (const [key,op] of [['from','>='],['to','<=']]) if (req.query[key]) { params.push(dateInput(req.query[key])); filters.push(`purchased_at ${op} $${params.length}::date`); }
    if (req.query.from && req.query.to && req.query.from > req.query.to) throw new ValidationError('A data inicial deve ser anterior à final.');
    const page = Number(req.query.page ?? 1);
    if (!Number.isInteger(page) || page < 1 || page > 100000) throw new ValidationError('Página inválida.');
    const where = filters.length ? ' WHERE '+filters.join(' AND ') : '';
    const {rows:[totals]} = await pool.query(`SELECT count(*) count, COALESCE(sum(total_cents),0) total FROM forma_finance.entries`+where,params);
    const {rows} = await pool.query(entrySelect+where+` ORDER BY purchased_at DESC,created_at DESC,id DESC LIMIT 20 OFFSET $${params.length+1}`,[...params,(page-1)*20]);
    res.json({entries:rows.map(mapEntry),count:Number(totals.count),totalCents:Number(totals.total),page,pages:Math.ceil(Number(totals.count)/20)});
  });
  app.post('/api/entries', async (req,res) => {
    const e = entryInput(req.body); const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Serialize retries for the same request before creating a receipt or movement.
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[e.requestId]);
      const previous = (await client.query(entrySelect+' WHERE request_id=$1',[e.requestId])).rows[0];
      if (previous) {
        const same = previous.product_id===e.productId && previous.purchased_at_text===e.purchasedAt && previous.packaging===e.packaging && previous.package_count===e.packageCount && Number(previous.units_per_package)===e.unitsPerPackage && Number(previous.total_cents)===e.totalCents && previous.supplier===e.supplier && previous.notes===e.notes;
        if (!same) throw new ValidationError('Esta entrada já foi registrada com outros dados. Abra uma nova entrada.',409);
        await client.query('COMMIT'); return res.json({entry:mapEntry(previous),repeated:true});
      }
      const product = (await client.query(`SELECT p.*,color.name color_name,brand.name brand_name FROM forma_finance.products p
        LEFT JOIN forma_finance.product_colors color ON color.id=p.color_id
        LEFT JOIN forma_finance.product_brands brand ON brand.id=p.brand_id WHERE p.id=$1 FOR UPDATE OF p`,[e.productId])).rows[0];
      if (!product) throw new ValidationError('Produto não encontrado.',404);
      const id=randomUUID();
      const {rows:[entry]}=await client.query(`INSERT INTO forma_finance.entries
        (id,request_id,product_id,product_name,product_type,unit,purchased_at,packaging,package_count,units_per_package,total_cents,supplier,notes,product_category,product_color,product_brand)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *,purchased_at::text AS purchased_at_text`,
        [id,e.requestId,e.productId,product.name,product.type,product.unit,e.purchasedAt,e.packaging,e.packageCount,e.unitsPerPackage,e.totalCents,e.supplier,e.notes,product.category,product.color_name || '',product.brand_name || '']);
      await client.query(`INSERT INTO forma_finance.stock_movements (id,product_id,entry_id,kind,quantity,occurred_at) VALUES ($1,$2,$3,'purchase',$4,$5)`,[randomUUID(),e.productId,id,entry.quantity,e.purchasedAt]);
      await client.query('COMMIT'); res.status(201).json({entry:mapEntry(entry)});
    } catch(error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  });
  app.post('/api/sales', async (req,res) => {
    const s=saleInput(req.body),client=await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[s.requestId]);
      const previous=(await client.query(saleSelect+' WHERE request_id=$1',[s.requestId])).rows[0];
      if(previous){
        const same=previous.product_id===s.productId&&previous.sold_at_text===s.soldAt&&Number(previous.quantity)===s.quantity&&Number(previous.total_cents)===s.totalCents&&previous.customer===s.customer&&previous.notes===s.notes;
        if(!same)throw new ValidationError('Esta venda já foi registrada com outros dados. Abra uma nova venda.',409);
        await client.query('COMMIT');return res.json({sale:mapSale(previous),repeated:true});
      }
      // Purchases, product edits and competing sales all lock this same product row.
      const product=(await client.query(`SELECT p.*,color.name color_name,brand.name brand_name FROM forma_finance.products p
        LEFT JOIN forma_finance.product_colors color ON color.id=p.color_id LEFT JOIN forma_finance.product_brands brand ON brand.id=p.brand_id WHERE p.id=$1 FOR UPDATE OF p`,[s.productId])).rows[0];
      if(!product)throw new ValidationError('Produto não encontrado.',404);
      if(product.type!=='resale')throw new ValidationError('Registre vendas apenas de produtos para revenda.');
      if(product.unit==='un'&&!Number.isInteger(s.quantity))throw new ValidationError('Informe uma quantidade inteira de unidades.');
      const {rows:[balance]}=await client.query('SELECT COALESCE(sum(quantity),0) AS stock FROM forma_finance.stock_movements WHERE product_id=$1',[s.productId]);
      if(Number(balance.stock)<s.quantity)throw new ValidationError('Estoque insuficiente para esta venda. Confira a quantidade disponível.',409);
      const id=randomUUID();
      const {rows:[sale]}=await client.query(`INSERT INTO forma_finance.sales
        (id,request_id,product_id,product_name,product_type,product_category,product_color,product_brand,unit,sold_at,quantity,total_cents,customer,notes)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *,sold_at::text AS sold_at_text`,
        [id,s.requestId,s.productId,product.name,product.type,product.category,product.color_name||'',product.brand_name||'',product.unit,s.soldAt,s.quantity,s.totalCents,s.customer,s.notes]);
      await client.query(`INSERT INTO forma_finance.stock_movements(id,product_id,sale_id,kind,quantity,occurred_at) VALUES($1,$2,$3,'sale',$4,$5)`,[randomUUID(),s.productId,id,-s.quantity,s.soldAt]);
      await client.query('COMMIT');res.status(201).json({sale:mapSale(sale)});
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  });
  app.get('/api/movements',async(req,res)=>{
    const params=[],filters=[];
    if(req.query.productId){params.push(uuid(req.query.productId));filters.push(`product_id=$${params.length}`);}
    for(const [key,op]of[['from','>='],['to','<=']])if(req.query[key]){params.push(dateInput(req.query[key]));filters.push(`occurred_at ${op} $${params.length}::date`);}
    if(req.query.from&&req.query.to&&req.query.from>req.query.to)throw new ValidationError('A data inicial deve ser anterior à final.');
    if(req.query.kind){if(!['purchase','sale'].includes(req.query.kind))throw new ValidationError('Tipo de movimentação inválido.');params.push(req.query.kind);filters.push(`kind=$${params.length}`);}
    const page=Number(req.query.page??1);
    if(!Number.isInteger(page)||page<1||page>100000)throw new ValidationError('Página inválida.');
    const where=filters.length?' WHERE '+filters.join(' AND '):'';
    const base=` FROM (${movementsSelect}) m`+where;
    const {rows:[totals]}=await pool.query(`SELECT count(*) count,coalesce(sum(total_cents) FILTER(WHERE kind='purchase'),0) purchases,coalesce(sum(total_cents) FILTER(WHERE kind='sale'),0) sales`+base,params);
    const {rows}=await pool.query(`SELECT *,occurred_at::text purchased_at_text`+base+` ORDER BY occurred_at DESC,created_at DESC,id DESC LIMIT 20 OFFSET $${params.length+1}`,[...params,(page-1)*20]);
    res.json({entries:rows.map(row=>({...mapEntry({...row,supplier:row.kind==='purchase'?row.counterparty:''}),kind:row.kind,customer:row.kind==='sale'?row.counterparty:''})),count:Number(totals.count),purchaseTotalCents:Number(totals.purchases),salesTotalCents:Number(totals.sales),page,pages:Math.ceil(Number(totals.count)/20)});
  });
  registerCashbook(app,pool);
  app.use('/api', (_req,res) => res.status(404).json({error:'Recurso não encontrado.'}));
  if (options.static !== false) app.use(express.static(fileURLToPath(new URL('../dist/',import.meta.url)), {setHeaders(res,path){if(path.endsWith('sw.js') || path.endsWith('index.html')) res.set('Cache-Control','no-cache');}}));
  app.use((error,_req,res,_next) => {
    if (error instanceof ValidationError) return res.status(error.status).json({error:error.message});
    if (error.code === '23505') return res.status(409).json({error:'Já existe um produto com esse nome, categoria, cor e marca.'});
    if (error.code === '23503') return res.status(400).json({error:'A cor ou marca selecionada não existe. Atualize o cadastro e tente novamente.'});
    if (error.type === 'entity.parse.failed') return res.status(400).json({error:'Dados inválidos.'});
    if (error.type === 'entity.too.large') return res.status(413).json({error:'Os dados enviados são grandes demais.'});
    console.error('API financeira:',error.code ?? 'internal_error');
    res.status(503).json({error:'Não foi possível acessar o banco. Tente novamente em instantes.'});
  });
  return app;
}
