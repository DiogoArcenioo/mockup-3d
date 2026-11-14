'use client';
import { useEffect, useRef, useState } from 'react';
import { Icon } from './icons';

type Kind='sale'|'purchase'|'partner_payment'|'expense'|'income'|'adjustment';
type Tab='statement'|'purchase'|'partner_payment'|'expense'|'activity';
type Item={id:string;kind:Kind;occurred_at:string;amount_cents:number|string;balance_cents:number|string;description:string;counterparty:string;notes:string;created_at:string;actor_name:string};
type Statement={items:Item[];totals:{opening:number;closing:number;income:number;outgoing:number;current:number};count:number;page:number;pages:number;breakdown:{kind:Kind;amount_cents:string}[]};
type Activity={id:string;entity:string;operation:string;actor_name:string;created_at:string;before_data:Record<string,unknown>|null;after_data:Record<string,unknown>|null};
type ActivityPage={items:Activity[];count:number;pages:number};
type Member={id:string;name:string;login:string};
type ManualKind='expense'|'partner_payment'|'income'|'adjustment';
const labels:Record<Kind,string>={sale:'Venda',purchase:'Compra de produtos',partner_payment:'Pagamento de sócio',expense:'Despesa',income:'Outra entrada',adjustment:'Ajuste de saldo'};
const tabs:{id:Tab;label:string}[]=[{id:'statement',label:'Extrato'},{id:'purchase',label:'Compras'},{id:'partner_payment',label:'Sócios'},{id:'expense',label:'Despesas'},{id:'activity',label:'Atividades'}];
const money=(value:number|string)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(value)/100);
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const date=(value:string)=>value.split('-').reverse().join('/');
const stamp=(value:string)=>new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(value));
async function api(path:string,init?:RequestInit){
  const response=await fetch('/api/finance/'+path,{cache:'no-store',...init});
  if(response.status===401){window.location.replace('/login');throw new Error('Sua sessão expirou.');}
  const data=await response.json();if(!response.ok)throw new Error(data.error||'Não foi possível carregar as informações.');return data;
}

export function FinanceDashboard(){
  const [tab,setTab]=useState<Tab>('statement');
  const [range,setRange]=useState(()=>({from:today().slice(0,7)+'-01',to:today()}));
  const [draft,setDraft]=useState(range);const [kind,setKind]=useState('');const [page,setPage]=useState(1);
  const [statement,setStatement]=useState<Statement|null>(null),[activity,setActivity]=useState<ActivityPage|null>(null);
  const [loading,setLoading]=useState(true),[error,setError]=useState(''),[success,setSuccess]=useState(''),[reload,setReload]=useState(0);
  const [modal,setModal]=useState<ManualKind|null>(null);
  const selectedKind=tab==='statement'?kind:tab==='activity'?'':tab;
  useEffect(()=>{
    const controller=new AbortController();setLoading(true);setError('');
    const query=new URLSearchParams({...range,page:String(page),...(selectedKind?{kind:selectedKind}:{})});
    void Promise.all([api('statement?'+query,{signal:controller.signal}),tab==='activity'?api('activity?'+query,{signal:controller.signal}):Promise.resolve(null)]).then(([s,a])=>{if(!controller.signal.aborted){setStatement(s);setActivity(a);}}).catch(cause=>{if(!controller.signal.aborted)setError(cause.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[range,selectedKind,page,tab,reload]);
  function selectTab(id:Tab){setTab(id);setPage(1);setError('');}
  const total=tab==='activity'?activity?.count:statement?.count,pages=tab==='activity'?activity?.pages:statement?.pages;
  return <div className="app-content cash-page">
    <div className="cash-heading"><div><div className="eyebrow page-eyebrow">DINHEIRO À VISTA</div><h1 className="page-title">Financeiro</h1><p className="page-description">Cada entrada, cada saída. Tudo no mesmo lugar.</p></div><button className="primary" onClick={()=>setModal('partner_payment')}><Icon name="users" size={17}/> Pagar sócio</button></div>
    <div className="cash-metrics" aria-busy={loading}>
      <Metric label="Saldo atual registrado" value={statement?.totals.current} dark hint="Até hoje · todos os registros"/>
      <Metric label="Entradas no período" value={statement?.totals.income} hint="Vendas e outras entradas"/>
      <Metric label="Saídas no período" value={statement?.totals.outgoing} outgoing hint="Compras, sócios e despesas"/>
    </div>
    <p className="cash-disclaimer">Controle interno, sem sincronização bancária. Compras e vendas são consideradas pagas na data registrada. O saldo parte de zero; registre um ajuste para incluir valores anteriores.</p>
    <div className="cash-tabs" aria-label="Áreas do financeiro">{tabs.map(t=><button key={t.id} aria-pressed={tab===t.id} onClick={()=>selectTab(t.id)}>{t.label}</button>)}</div>
    <section className="cash-panel" aria-label={tabs.find(t=>t.id===tab)?.label}>
      <div className="cash-section-heading"><div><h2>{tab==='statement'?'Extrato financeiro':tab==='purchase'?'Reposição de produtos':tab==='partner_payment'?'Pagamentos aos sócios':tab==='expense'?'Despesas da loja':'Atividades do sistema'}</h2><p>{tab==='activity'?'Alterações registradas a partir da ativação deste controle.':`${date(range.from)} a ${date(range.to)}`}</p></div>{tab==='statement'?<button className="quiet" onClick={()=>setModal('income')}>+ Lançamento</button>:tab==='partner_payment'?<button className="primary" onClick={()=>setModal('partner_payment')}>+ Registrar pagamento</button>:tab==='expense'?<button className="primary" onClick={()=>setModal('expense')}>+ Registrar despesa</button>:null}</div>
      {tab==='purchase'&&<p className="cash-note">As entradas de estoque aparecem aqui automaticamente com o valor da compra. Cadastre novas compras no menu Estoque.</p>}
      {tab==='partner_payment'&&<p className="cash-note">Cada pagamento identifica a pessoa que recebeu, o valor e quem registrou.</p>}
      <details className="cash-filters"><summary><span><Icon name="chevron" size={15}/> Filtrar período{selectedKind&&tab==='statement'?' e tipo':''}</span><small>Expandir / recolher</small></summary><form onSubmit={e=>{e.preventDefault();if(draft.from>draft.to){setError('A data inicial deve ser anterior à final.');return;}setRange(draft);setPage(1);}}><label>De<input type="date" required min="2000-01-01" max="2100-12-31" value={draft.from} onChange={e=>setDraft({...draft,from:e.target.value})}/></label><label>Até<input type="date" required min="2000-01-01" max="2100-12-31" value={draft.to} onChange={e=>setDraft({...draft,to:e.target.value})}/></label>{tab==='statement'&&<label>Tipo<select value={kind} onChange={e=>{setKind(e.target.value);setPage(1);}}><option value="">Todas as movimentações</option>{Object.entries(labels).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>}<button className="primary" type="submit">Aplicar</button><button className="quiet" type="button" onClick={()=>{const value={from:'2000-01-01',to:today()};setDraft(value);setRange(value);setKind('');setPage(1);}}>Todo o período</button></form></details>
      {success&&<p className="success" role="status">{success}</p>}
      {error?<div className="form-error" role="alert">{error} <button className="quiet" onClick={()=>setReload(v=>v+1)}>Tentar novamente</button></div>:loading?<p className="cash-empty" role="status">Carregando os registros…</p>:<>
        {tab==='statement'&&statement&&<><div className="cash-period-balance"><span>Saldo anterior ao período <strong className={statement.totals.opening<0?'cash-out':''}>{money(statement.totals.opening)}</strong></span><span>Saldo final do período <strong className={statement.totals.closing<0?'cash-out':''}>{money(statement.totals.closing)}</strong></span></div>{kind&&<p className="cash-note">Os saldos e totais consideram todos os tipos. O filtro altera apenas os lançamentos exibidos.</p>}</>}
        {['purchase','partner_payment','expense'].includes(tab)&&statement&&<div className="cash-period-balance"><span>Total no período <strong className="cash-out">{money(Math.abs(Number(statement.breakdown.find(item=>item.kind===tab)?.amount_cents||0)))}</strong></span><span>Registros <strong>{statement.count}</strong></span></div>}
        {tab==='activity'?activity?.items.length?<div className="cash-activities">{activity.items.map(item=><ActivityRow key={item.id} item={item}/>)}</div>:<Empty text="Nenhuma atividade registrada neste período."/>:statement?.items.length?<div className="cash-transactions">{statement.items.map(item=><Transaction key={item.id} item={item}/>)}</div>:<Empty text="Nenhuma movimentação neste período."/>}
        {!!total&&<div className="cash-pagination"><span>{total} {tab==='activity'?'atividades':'lançamentos'} · página {page} de {pages}</span><div><button className="quiet" disabled={page<=1} onClick={()=>setPage(v=>v-1)}>Anterior</button><button className="quiet" disabled={page>=(pages||1)} onClick={()=>setPage(v=>v+1)}>Próxima</button></div></div>}
      </>}
    </section>
    {modal&&<CashModal initialKind={modal} onClose={()=>setModal(null)} onSaved={()=>{setModal(null);setSuccess('Lançamento registrado. O extrato e o saldo foram atualizados.');setReload(v=>v+1);}}/>}
  </div>;
}
function Metric({label,value,dark,outgoing,hint}:{label:string;value?:number;dark?:boolean;outgoing?:boolean;hint:string}){return <div className={`cash-metric ${dark?'cash-dark':''}`}><span>{label}</span><strong className={outgoing||(value??0)<0?'cash-out':''}>{value===undefined?'—':money(value)}</strong><small>{hint}</small></div>;}
function Empty({text}:{text:string}){return <div className="cash-empty"><Icon name="wallet" size={28}/><p>{text}</p><small>Os novos registros aparecerão aqui.</small></div>;}
function Transaction({item}:{item:Item}){const out=Number(item.amount_cents)<0;return <details className="cash-transaction"><summary><span className={`cash-direction ${out?'cash-out':''}`} aria-label={out?'Saída':'Entrada'}>{out?'↗':'↙'}</span><span className="cash-transaction-info"><strong>{item.description}</strong><small>{date(item.occurred_at)} · {labels[item.kind]}{item.counterparty?' · '+item.counterparty:''}</small></span><span className="cash-transaction-amount"><strong className={out?'cash-out':''}>{out?'−': '+'}{money(Math.abs(Number(item.amount_cents)))}</strong><small>Saldo <span className={Number(item.balance_cents)<0?'cash-out':''}>{money(item.balance_cents)}</span></small></span><Icon name="chevron" size={15}/></summary><dl className="cash-transaction-details"><div><dt>Registrado por</dt><dd>{item.actor_name}</dd></div><div><dt>Registrado em</dt><dd>{stamp(item.created_at)}</dd></div>{item.counterparty&&<div><dt>{item.kind==='partner_payment'?'Sócio':'Cliente / fornecedor'}</dt><dd>{item.counterparty}</dd></div>}{item.notes&&<div><dt>Observação</dt><dd>{item.notes}</dd></div>}</dl></details>;}
const entities:Record<string,string>={products:'Produto',product_colors:'Cor',product_brands:'Marca',product_photos:'Foto do produto',entries:'Compra de produto',sales:'Venda',stock_movements:'Movimentação de estoque',cash_transactions:'Lançamento financeiro',users:'Usuário'};
const fields:Record<string,string>={name:'Nome',login:'Login',role:'Perfil',active:'Ativo',type:'Tipo',unit:'Unidade',min_stock:'Estoque mínimo',notes:'Observação',category:'Categoria',description:'Descrição',amount_cents:'Valor',total_cents:'Valor total',recipient_name:'Sócio',product_name:'Produto',quantity:'Quantidade',supplier:'Fornecedor',customer:'Cliente',occurred_at:'Data',purchased_at:'Data da compra',sold_at:'Data da venda',kind:'Tipo',package_count:'Embalagens',units_per_package:'Unidades por embalagem'};
const values:Record<string,string>={admin:'Administrador',user:'Usuário',resale:'Revenda',consumption:'Uso e consumo',mug:'Canecas',tshirt:'Camisetas',mobile_accessory:'Acessórios para celular',...labels};
function ActivityRow({item}:{item:Activity}){const data=item.after_data||item.before_data||{};const operation:Record<string,string>={INSERT:'Cadastro',UPDATE:'Alteração',DELETE:'Exclusão',PASSWORD:'Senha alterada'};return <details className="cash-activity"><summary><span className="cash-activity-dot"/><span><strong>{operation[item.operation]||item.operation} · {entities[item.entity]||'Registro'}</strong><small>{String(data.name||data.product_name||data.description||'')}{(data.name||data.product_name||data.description)?' · ':''}{item.actor_name}</small></span><time>{stamp(item.created_at)}</time><Icon name="chevron" size={14}/></summary><dl className="cash-transaction-details">{item.operation==='PASSWORD'&&<div><dt>Segurança</dt><dd>Senha alterada e sessões do usuário encerradas.</dd></div>}{Object.entries(fields).filter(([key])=>data[key]!==undefined&&data[key]!==null&&data[key]!==''&&(item.operation!=='UPDATE'||JSON.stringify(item.before_data?.[key])!==JSON.stringify(data[key]))).map(([key,label])=>{const format=(v:unknown)=>key.endsWith('_cents')?money(Number(v)):typeof v==='boolean'?(v?'Sim':'Não'):values[String(v)]||String(v??'—');return <div key={key}><dt>{label}</dt><dd>{item.operation==='UPDATE'&&item.before_data?.[key]!==undefined?<><s>{format(item.before_data[key])}</s> → </>:null}{format(data[key])}</dd></div>;})}{item.entity==='product_photos'&&<div><dt>Foto</dt><dd>{item.operation==='DELETE'?'Foto removida.':'Foto do produto salva.'}</dd></div>}</dl></details>;}

function CashModal({initialKind,onClose,onSaved}:{initialKind:ManualKind;onClose:()=>void;onSaved:()=>void}){
  const ref=useRef<HTMLDialogElement>(null),request=useRef({payload:'',id:''});
  const [kind,setKind]=useState<ManualKind>(initialKind),[members,setMembers]=useState<Member[]>([]),[membersError,setMembersError]=useState(''),[retry,setRetry]=useState(0);
  const [amount,setAmount]=useState(''),[occurredAt,setOccurredAt]=useState(today),[description,setDescription]=useState(''),[recipientId,setRecipientId]=useState(''),[notes,setNotes]=useState(''),[direction,setDirection]=useState('in');
  const [pending,setPending]=useState(false),[error,setError]=useState('');
  useEffect(()=>{ref.current?.showModal();return()=>ref.current?.close();},[]);
  useEffect(()=>{const controller=new AbortController();if(kind==='partner_payment'){setMembersError('');void api('users',{signal:controller.signal}).then(data=>setMembers(data.users)).catch(cause=>{if(!controller.signal.aborted)setMembersError(cause.message);});}return()=>controller.abort();},[kind,retry]);
  async function submit(e:React.FormEvent){
    e.preventDefault();if(pending)return;setError('');
    const normalized=amount.trim().replace(',','.');
    if(!/^\d+(\.\d{1,2})?$/.test(normalized)){setError('Informe o valor com até duas casas decimais.');return;}
    const cents=Math.round(Number(normalized)*100);if(!Number.isSafeInteger(cents)||cents<=0||cents>10000000000){setError('Informe um valor maior que zero e de até R$ 100.000.000,00.');return;}
    const payload={kind,occurredAt,amountCents:(kind==='expense'||kind==='partner_payment'||kind==='adjustment'&&direction==='out')?-cents:cents,description,recipientId,notes};
    const signature=JSON.stringify(payload);if(request.current.payload!==signature)request.current={payload:signature,id:crypto.randomUUID()};setPending(true);
    try{await api('transactions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,requestId:request.current.id}),signal:AbortSignal.timeout(20000)});onSaved();}catch(cause){setError(cause instanceof Error&&cause.name==='Error'?cause.message:'Não foi possível confirmar o registro. Tente novamente com os mesmos dados para evitar duplicidade.');}finally{setPending(false);}
  }
  return <dialog className="cash-dialog" ref={ref} aria-labelledby="cash-modal-title" onCancel={e=>{if(pending)e.preventDefault();else onClose();}}><div className="cash-dialog-top"><span className="eyebrow">NOVO REGISTRO</span><button className="quiet" disabled={pending} onClick={onClose} aria-label="Fechar"><Icon name="close" size={18}/></button></div><h2 id="cash-modal-title">{kind==='partner_payment'?'Pagamento de sócio':kind==='expense'?'Registrar despesa':kind==='income'?'Registrar entrada':'Ajustar saldo'}</h2><p className="cash-note">O valor será registrado no extrato com seu nome e a data informada.</p><form className="cash-form" onSubmit={submit} aria-busy={pending}><fieldset disabled={pending}>
    <label>Tipo<select value={kind} onChange={e=>setKind(e.target.value as ManualKind)}><option value="income">Outra entrada</option><option value="expense">Despesa</option><option value="partner_payment">Pagamento de sócio</option><option value="adjustment">Ajuste / saldo anterior</option></select></label>
    {kind==='partner_payment'?<label>Sócio<select required value={recipientId} onChange={e=>setRecipientId(e.target.value)}><option value="">Selecione um usuário</option>{members.map(m=><option key={m.id} value={m.id}>{m.name} (@{m.login})</option>)}</select>{membersError&&<span role="alert">{membersError} <button type="button" className="quiet" onClick={()=>setRetry(v=>v+1)}>Recarregar</button></span>}</label>:<label>Descrição<input required maxLength={160} value={description} onChange={e=>setDescription(e.target.value)} placeholder={kind==='expense'?'Ex.: internet da loja':kind==='adjustment'?'Ex.: saldo anterior em conta':'Ex.: aporte dos sócios'}/></label>}
    {kind==='adjustment'&&<><p className="cash-note">Informe somente a diferença necessária para acertar o saldo, considerando as compras e vendas já incluídas.</p><label>Como altera o saldo?<select value={direction} onChange={e=>setDirection(e.target.value)}><option value="in">Aumenta o saldo</option><option value="out">Reduz o saldo</option></select></label></>}
    <div className="cash-form-grid"><label>Valor (R$)<input required inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0,00" maxLength={14}/></label><label>Data<input type="date" required min="2000-01-01" max="2100-12-31" value={occurredAt} onChange={e=>setOccurredAt(e.target.value)}/></label></div>
    <label>Observação <small>opcional</small><textarea rows={3} maxLength={1000} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Algum detalhe para a equipe?"/></label>
    {error&&<p className="form-error" role="alert">{error}</p>}<div className="cash-form-actions"><button className="quiet" type="button" onClick={onClose}>Cancelar</button><button className="primary" type="submit">{pending?'Registrando…':'Confirmar registro'}</button></div>
  </fieldset></form></dialog>;
}
