'use client';
import { useState, useEffect, useCallback } from 'react';
import { Icon } from '../../../components/icons';
type Member = { id: string; name: string; login: string; role: string; active: boolean };
export function UsersPanel() {
  const [users, setUsers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/users', { cache: 'no-store', signal: AbortSignal.timeout(15000) });
      if (response.status === 401) { window.location.replace('/login'); return; }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setUsers(data.users);
    } catch { setError('Não foi possível carregar a equipe. Tente novamente.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending) return;
    const form = event.currentTarget;
    setPending(true); setError(''); setSuccess('');
    try {
      const response = await fetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(form))), signal: AbortSignal.timeout(15000) });
      const data = await response.json();
      if (response.status === 401) { window.location.replace('/login'); return; }
      if (!response.ok) throw new Error(data.error);
      form.reset(); setSuccess(`Acesso de ${data.user.name} criado. Compartilhe o usuário e a senha com essa pessoa.`); await load();
    } catch (error) { setError(error instanceof Error && error.name === 'Error' ? error.message : 'Não foi possível criar o acesso. Tente novamente.'); }
    finally { setPending(false); }
  }
  return <>{error && <div className="form-error" role="alert">{error}<button className="quiet" onClick={() => { setError(''); void load(); }}>Tentar novamente</button></div>}{success && <p className="success" role="status">{success}</p>}<div className="users-layout"><form className="users-form" onSubmit={submit} aria-busy={pending}><h2>Novo acesso</h2><fieldset disabled={pending} style={{ border: 0, padding: 0, margin: 0 }}><label>Nome<input name="name" required maxLength={100} autoComplete="off" placeholder="Como a pessoa se chama?" /></label><label>Usuário<input name="login" required minLength={3} maxLength={40} pattern="[a-zA-Z0-9._\-]{3,40}" autoCapitalize="none" autoComplete="off" spellCheck={false} placeholder="Ex.: maria" /></label><label>Senha inicial<input name="password" type="password" required minLength={8} maxLength={256} autoComplete="new-password" placeholder="Pelo menos 8 caracteres" /></label><label>Permissão<select name="role" defaultValue="user"><option value="user">Equipe da loja</option><option value="admin">Administrador</option></select></label><button className="primary" type="submit"><span>{pending ? 'Criando acesso…' : 'Criar acesso'}</span><Icon name="arrow" size={18} /></button></fieldset></form><section className="users-list" aria-live="polite"><h2>Quem está com você <span style={{ color: '#999', fontWeight: 400 }}>({users.length})</span></h2>{loading ? <p className="page-description">Carregando equipe…</p> : users.map(user => <div className="user-row" key={user.id}><div><strong>{user.name}</strong><small>@{user.login}{!user.active && ' · Inativo'}</small></div><span className="role-badge">{user.role === 'admin' ? 'Administrador' : 'Equipe'}</span></div>)}</section></div></>;
}
