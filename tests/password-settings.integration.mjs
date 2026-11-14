import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {createPool} from '../server/db.mjs';
import {verifyPassword} from '../apps/api/dist/password.js';
const base=process.env.AUTH_TEST_URL||'http://127.0.0.1:3001/api';

test('configurações: senha própria, permissão administrativa, revogação e concorrência',async()=>{
  assert.ok(process.env.ADMIN_LOGIN&&process.env.ADMIN_PASSWORD,'Configure o administrador privado para executar este teste.');
  const pool=createPool(),suffix=randomUUID().replaceAll('-','').slice(0,12),cookies=new Set();
  const names=['admin','member','other'].map(role=>'qa_password_'+role+'_'+suffix);
  const qaIp='2001:db8:'+suffix.slice(0,4)+':'+suffix.slice(4,8)+'::1';
  async function request(path,{method='GET',body,cookie=''}={}){
    const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',Cookie:cookie,'X-Forwarded-For':qaIp},...(body===undefined?{}:{body:JSON.stringify(body)})});
    const data=await response.json();return{status:response.status,data,headers:response.headers};
  }
  async function signIn(login,password){const result=await request('/auth/login',{method:'POST',body:{login,password}});const cookie=result.headers.get('set-cookie')?.split(';')[0];if(cookie)cookies.add(cookie);return{...result,cookie};}
  const password=()=> 'qa-'+randomUUID();
  try{
    assert.equal((await request('/auth/password',{method:'POST',body:{}})).status,401);
    const root=await signIn(process.env.ADMIN_LOGIN,process.env.ADMIN_PASSWORD);assert.equal(root.status,201);
    const accounts=[];
    for(const [index,role]of['admin','user','user'].entries()){
      const pass=password();const created=await request('/users',{method:'POST',cookie:root.cookie,body:{name:'Verificação de senha '+index,login:names[index],password:pass,role}});assert.equal(created.status,201);accounts.push({...created.data.user,password:pass});
    }
    const [admin,member,other]=accounts;
    const adminLogin=await signIn(admin.login,admin.password);assert.equal(adminLogin.status,201);
    const memberLogin=await signIn(member.login,member.password);assert.equal(memberLogin.status,201);
    const memberSecond=await signIn(member.login,member.password);assert.equal(memberSecond.status,201);
    const secondPassword=password();
    const own={currentPassword:member.password,newPassword:secondPassword,confirmPassword:secondPassword};
    const countBefore=(await pool.query("SELECT count(*) FROM forma_finance.activity_log WHERE entity='users' AND entity_id=$1 AND operation='PASSWORD'",[member.id])).rows[0].count;
    for(const target of[admin.id,other.id])assert.equal((await request('/auth/password',{method:'POST',cookie:memberLogin.cookie,body:{...own,userId:target}})).status,403);
    for(const change of[{currentPassword:'wrong'},{confirmPassword:'different'},{newPassword:'short',confirmPassword:'short'},{newPassword:'        ',confirmPassword:'        '},{newPassword:member.password,confirmPassword:member.password},{userId:'invalid'}])assert.equal((await request('/auth/password',{method:'POST',cookie:memberLogin.cookie,body:{...own,...change}})).status,400);
    assert.equal((await request('/auth/me',{cookie:memberLogin.cookie})).status,200);
    const changed=await request('/auth/password',{method:'POST',cookie:memberLogin.cookie,body:{...own,userId:member.id.toUpperCase()}});assert.equal(changed.status,201);assert.equal(changed.data.relogin,true);assert.match(changed.headers.get('set-cookie'),/forma_auth=;/);
    assert.equal((await request('/auth/me',{cookie:memberLogin.cookie})).status,401);assert.equal((await request('/auth/me',{cookie:memberSecond.cookie})).status,401);
    assert.equal((await signIn(member.login,member.password)).status,401);
    const newLogin=await signIn(member.login,secondPassword);assert.equal(newLogin.status,201);
    const thirdPassword=password(),adminBody={userId:member.id,currentPassword:admin.password,newPassword:thirdPassword,confirmPassword:thirdPassword};
    assert.equal((await request('/auth/password',{method:'POST',cookie:adminLogin.cookie,body:{...adminBody,currentPassword:'wrong'}})).status,400);
    assert.equal((await request('/auth/password',{method:'POST',cookie:adminLogin.cookie,body:{...adminBody,userId:randomUUID()}})).status,404);
    const reset=await request('/auth/password',{method:'POST',cookie:adminLogin.cookie,body:adminBody});assert.equal(reset.status,201);assert.equal(reset.data.relogin,false);assert.equal(reset.headers.get('set-cookie'),null);
    assert.equal((await request('/auth/me',{cookie:newLogin.cookie})).status,401);assert.equal((await request('/auth/me',{cookie:adminLogin.cookie})).status,200);
    assert.equal((await signIn(member.login,secondPassword)).status,401);
    const resetLogin=await signIn(member.login,thirdPassword);assert.equal(resetLogin.status,201);assert.equal(resetLogin.data.user.role,'user');
    const stored=(await pool.query('SELECT password_hash FROM forma_auth.users WHERE id=$1',[member.id])).rows[0];assert.equal(await verifyPassword(thirdPassword,stored.password_hash),true);assert.equal(await verifyPassword(secondPassword,stored.password_hash),false);
    // A login racing a reset may finish first, but its session must never survive the reset.
    const fourthPassword=password();
    const race=await Promise.all([signIn(member.login,thirdPassword),signIn(member.login,thirdPassword),request('/auth/password',{method:'POST',cookie:adminLogin.cookie,body:{...adminBody,newPassword:fourthPassword,confirmPassword:fourthPassword}})]);
    assert.equal(race[2].status,201);
    for(const login of race.slice(0,2)){assert.ok([201,401].includes(login.status));if(login.status===201)assert.equal((await request('/auth/me',{cookie:login.cookie})).status,401);}
    assert.equal((await signIn(member.login,fourthPassword)).status,201);
    const newAdminPassword=password();
    const adminOwn=await request('/auth/password',{method:'POST',cookie:adminLogin.cookie,body:{currentPassword:admin.password,newPassword:newAdminPassword,confirmPassword:newAdminPassword}});assert.equal(adminOwn.status,201);assert.equal(adminOwn.data.relogin,true);
    assert.equal((await signIn(admin.login,admin.password)).status,401);assert.equal((await signIn(admin.login,newAdminPassword)).status,201);
    const audit=(await pool.query("SELECT * FROM forma_finance.activity_log WHERE entity='users' AND entity_id=$1 AND operation='PASSWORD' ORDER BY id",[member.id])).rows;
    assert.ok(audit.length>Number(countBefore));assert.equal(audit[0].actor_id,member.id);assert.equal(audit.at(-1).actor_id,admin.id);
    assert.ok(!JSON.stringify(audit).includes('password_hash'));assert.ok(!JSON.stringify(audit).includes(member.password));
    const otherLogin=await signIn(other.login,other.password);assert.equal(otherLogin.status,201);
    const invalid={currentPassword:'wrong',newPassword:password()};invalid.confirmPassword=invalid.newPassword;
    for(let attempt=0;attempt<10;attempt++)assert.equal((await request('/auth/password',{method:'POST',cookie:otherLogin.cookie,body:invalid})).status,400);
    assert.equal((await request('/auth/password',{method:'POST',cookie:otherLogin.cookie,body:invalid})).status,429);
    assert.equal((await request('/auth/me',{cookie:root.cookie})).status,200);
  }finally{
    for(const cookie of cookies)await request('/auth/logout',{method:'POST',cookie,body:{}});
    const identities=(await pool.query('SELECT id FROM forma_auth.users WHERE login=ANY($1::text[])',[names])).rows;
    const keys=['ip:'+qaIp,...names.map(login=>'login:'+login),...identities.map(user=>'password:'+user.id)].map(key=>createHash('sha256').update(key).digest('hex'));
    await pool.query('DELETE FROM forma_auth.login_attempts WHERE key_hash=ANY($1::text[])',[keys]);
    await pool.query('DELETE FROM forma_auth.users WHERE login=ANY($1::text[])',[names]);
    await pool.query("DELETE FROM forma_finance.activity_log WHERE entity='users' AND coalesce(after_data->>'login',before_data->>'login')=ANY($1::text[])",[names]);
    await pool.end();
  }
});
