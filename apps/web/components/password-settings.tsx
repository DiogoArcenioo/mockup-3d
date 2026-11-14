'use client';
import { useEffect, useRef, useState } from 'react';
import { Icon } from './icons';
import type { User } from '../lib/session';
type Member=User&{active:boolean};

export function PasswordSettings({user,onClose}:{user:User;onClose:()=>void}){
  const dialog=useRef<HTMLDialogElement>(null);
  const [members,setMembers]=useState<Member[]>([]);
  const [loading,setLoading]=useState(user.role==='admin');
  const [listError,setListError]=useState('');
  const [reload,setReload]=useState(0);
  const [userId,setUserId]=useState(user.id);
  const [currentPassword,setCurrentPassword]=useState('');
  const [newPassword,setNewPassword]=useState('');
  const [confirmPassword,setConfirmPassword]=useState('');
  const [visible,setVisible]=useState(false);
  const [pending,setPending]=useState(false);
  const [error,setError]=useState('');
  const [success,setSuccess]=useState('');
  const own=userId===user.id;
  const selected=members.find(member=>member.id===userId);
  useEffect(()=>{dialog.current?.showModal();return()=>dialog.current?.close();},[]);
  useEffect(()=>{
    if(user.role!=='admin')return;
    const controller=new AbortController();
    setLoading(true);setListError('');
    void (async()=>{
      try{
        const response=await fetch('/api/users',{cache:'no-store',signal:controller.signal});
        if(response.status===401){window.location.replace('/login');return;}
        const data=await response.json();
        if(!response.ok)throw new Error(data.error||'Não foi possível carregar os usuários.');
        setMembers(data.users.filter((member:Member)=>member.active&&member.id!==user.id));
      }catch(cause){if(!controller.signal.aborted)setListError(cause instanceof Error?cause.message:'Não foi possível carregar os usuários.');}
      finally{if(!controller.signal.aborted)setLoading(false);}
    })();return()=>controller.abort();
  },[user.id,user.role,reload]);
  function selectAccount(id:string){setUserId(id);setCurrentPassword('');setNewPassword('');setConfirmPassword('');setVisible(false);setError('');setSuccess('');}
  async function submit(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();if(pending)return;setError('');setSuccess('');
    if(newPassword!==confirmPassword){setError('A confirmação deve ser igual à nova senha.');return;}
    setPending(true);
    try{
      const response=await fetch('/api/auth/password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId,currentPassword,newPassword,confirmPassword}),signal:AbortSignal.timeout(15000)});
      const data=await response.json().catch(()=>({}));
      if(response.status===401){window.location.replace('/login');return;}
      if(!response.ok)throw new Error(data.error||'Não foi possível alterar a senha. Tente novamente.');
      setCurrentPassword('');setNewPassword('');setConfirmPassword('');setVisible(false);
      if(data.relogin){window.location.replace('/login?senha=alterada');return;}
      setSuccess(`Senha de ${selected?.name||'usuário'} alterada. Essa pessoa deve entrar novamente com a nova senha.`);
    }catch(cause){setError(cause instanceof Error&&cause.name==='Error'?cause.message:'Não foi possível confirmar a alteração. Confira sua conexão e tente novamente.');}
    finally{setPending(false);}
  }
  function backdrop(event:React.MouseEvent<HTMLDialogElement>){
    if(event.target!==event.currentTarget||pending)return;
    const bounds=event.currentTarget.getBoundingClientRect();
    if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)onClose();
  }
  return <dialog ref={dialog} className="settings-dialog" aria-labelledby="password-settings-title" onCancel={event=>{if(pending)event.preventDefault();else onClose();}} onClick={backdrop}>
    <div className="settings-dialog-top"><span className="eyebrow">CONFIGURAÇÕES</span><button type="button" className="settings-close" onClick={onClose} disabled={pending} aria-label="Fechar configurações"><Icon name="close" size={19}/></button></div>
    <div className="settings-symbol"><Icon name="lock" size={24}/></div><h2 id="password-settings-title">Alterar senha</h2><p className="settings-description">{own?'Defina uma nova senha para sua conta.':'Defina uma nova senha para a pessoa selecionada.'}</p>
    <form className="settings-form" onSubmit={submit} aria-busy={pending}>
      {user.role==='admin'&&<label className="settings-field" htmlFor="password-account">Usuário<select id="password-account" value={userId} onChange={event=>selectAccount(event.target.value)} disabled={pending} autoFocus><option value={user.id}>Minha conta · {user.name} (@{user.login})</option>{members.map(member=><option key={member.id} value={member.id}>{member.name} (@{member.login})</option>)}</select></label>}
      {loading&&<p className="settings-hint" role="status">Carregando os usuários da equipe…</p>}
      {listError&&<div className="form-error" role="alert">{listError}<button type="button" className="quiet" onClick={()=>setReload(value=>value+1)}>Tentar novamente</button></div>}
      {!own&&<p className="settings-account-note">Use a sua senha de administrador, de @{user.login}, para autorizar a alteração.</p>}
      <label className="settings-field" htmlFor="settings-current-password">{own?'Sua senha atual':'Sua senha de administrador'}<input id="settings-current-password" name="currentPassword" type={visible?'text':'password'} value={currentPassword} onChange={event=>setCurrentPassword(event.target.value)} autoComplete="current-password" autoFocus={user.role!=='admin'} required maxLength={256} disabled={pending}/></label>
      <label className="settings-field" htmlFor="settings-new-password">Nova senha<input id="settings-new-password" name="newPassword" type={visible?'text':'password'} value={newPassword} onChange={event=>setNewPassword(event.target.value)} autoComplete="new-password" required minLength={8} maxLength={256} disabled={pending}/><small>Pelo menos 8 caracteres.</small></label>
      <label className="settings-field" htmlFor="settings-confirm-password">Confirmar nova senha<input id="settings-confirm-password" name="confirmPassword" type={visible?'text':'password'} value={confirmPassword} onChange={event=>setConfirmPassword(event.target.value)} autoComplete="new-password" required minLength={8} maxLength={256} disabled={pending}/></label>
      <button type="button" className="settings-show-password" onClick={()=>setVisible(!visible)} aria-pressed={visible} disabled={pending}><Icon name={visible?'hide':'eye'} size={17}/>{visible?'Ocultar senhas':'Mostrar senhas'}</button>
      {error&&<p className="form-error" role="alert">{error}</p>}{success&&<p className="success" role="status">{success}</p>}
      <p className="settings-hint">{own?'Depois de salvar, você precisará entrar novamente com a nova senha.':'Ao salvar, as sessões dessa pessoa serão encerradas.'}</p>
      <div className="settings-form-actions"><button type="button" className="quiet" onClick={onClose} disabled={pending}>Cancelar</button><button type="submit" className="primary" disabled={pending}>{pending?'Salvando…':'Salvar nova senha'}</button></div>
    </form>
  </dialog>;
}
