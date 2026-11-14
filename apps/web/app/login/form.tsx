'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '../../components/icons';
export function LoginForm() {
  const [visible, setVisible] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [passwordChanged,setPasswordChanged]=useState(false);
  const router = useRouter();
  useEffect(() => {
    if(new URLSearchParams(location.search).get('senha')==='alterada')setPasswordChanged(true);
    if (new URLSearchParams(location.search).get('erro') === 'conexao') setError('Não foi possível conectar ao servidor. Tente novamente em instantes.');
    // Retire the old offline shell so it cannot bypass the new login screen.
    if ('serviceWorker' in navigator) void navigator.serviceWorker.getRegistrations().then(registrations => { for (const registration of registrations) if (new URL(registration.scope).pathname === '/') void registration.unregister(); });
  }, []);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending) return;
    const form = new FormData(event.currentTarget);
    setPending(true); setError('');
    try {
      const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ login: form.get('login'), password: form.get('password'), remember: form.get('remember') === 'on' }), signal: AbortSignal.timeout(15000) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Não foi possível entrar. Tente novamente em instantes.');
      router.replace('/inicio'); router.refresh();
    } catch (error) { setError(error instanceof Error && error.name !== 'TimeoutError' && error.name !== 'TypeError' ? error.message : 'Sem conexão com o servidor. Confira sua internet e tente novamente.'); }
    finally { setPending(false); }
  }
  return <form className="login-form" onSubmit={submit} aria-busy={pending}>
    {passwordChanged&&<p className="settings-login-notice" role="status">Senha alterada. Entre novamente com a nova senha.</p>}
    <label htmlFor="login">Usuário</label><div className="input-wrap"><Icon name="user" /><input id="login" name="login" autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="Seu usuário" required maxLength={40} disabled={pending} /></div>
    <label htmlFor="password">Senha</label><div className="input-wrap"><Icon name="lock" /><input id="password" name="password" type={visible ? 'text' : 'password'} autoComplete="current-password" placeholder="Sua senha" required maxLength={256} disabled={pending} /><button className="reveal" type="button" onClick={() => setVisible(!visible)} aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'} aria-pressed={visible}><Icon name={visible ? 'hide' : 'eye'} /></button></div>
    <label className="remember"><input type="checkbox" name="remember" disabled={pending} /><span>Manter conectado neste dispositivo</span></label>
    {error && <div className="form-error" role="alert">{error}</div>}
    <button className="primary login-submit" type="submit" disabled={pending}><span>{pending ? 'Entrando…' : 'Entrar na minha loja'}</span>{pending ? <span className="spinner" /> : <Icon name="arrow" />}</button>
  </form>;
}
