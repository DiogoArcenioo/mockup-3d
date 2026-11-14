'use client';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useState, useRef, useEffect } from 'react';
import { Brand, Icon } from './icons';
import type { User } from '../lib/session';
import { PasswordSettings } from './password-settings';
export function AppShell({ user, children }: { user: User; children: React.ReactNode }) {
  const pathname = usePathname();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [menuOpen,setMenuOpen]=useState(false);
  const [settingsOpen,setSettingsOpen]=useState(false);
  const profileMenu=useRef<HTMLDivElement>(null);
  const profileButton=useRef<HTMLButtonElement>(null);
  const settingsButton=useRef<HTMLButtonElement>(null);
  useEffect(()=>{
    if(!menuOpen)return;
    settingsButton.current?.focus();
    const outside=(event:PointerEvent)=>{if(!profileMenu.current?.contains(event.target as Node))setMenuOpen(false);};
    const keyboard=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();setMenuOpen(false);profileButton.current?.focus();}};
    const blur=()=>setMenuOpen(false);
    document.addEventListener('pointerdown',outside);document.addEventListener('keydown',keyboard);window.addEventListener('blur',blur);
    return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',keyboard);window.removeEventListener('blur',blur);};
  },[menuOpen]);
  useEffect(()=>setMenuOpen(false),[pathname]);
  const closeSettings=()=>{setSettingsOpen(false);window.requestAnimationFrame(()=>profileButton.current?.focus());};
  const links = [['/inicio', 'home', 'Início'], ['/estoque', 'box', 'Estoque'], ['/financeiro', 'wallet', 'Financeiro'], ['/mockup', 'mug', 'Studio 3D'], ...(user.role === 'admin' ? [['/usuarios', 'users', 'Usuários']] : [])];
  async function logout() {
    setPending(true); setError('');
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error();
      window.location.replace('/login');
    } catch { setError('Não foi possível sair. Tente novamente.'); setPending(false); }
  }
  return <div className="app-shell"><aside className="app-sidebar"><Brand /><div className="nav-label">SEU NEGÓCIO</div><nav className="app-nav" aria-label="Menu principal">{links.map(([href, icon, label]) => <Link key={href} href={href} className={pathname === href ? 'active' : ''} aria-current={pathname === href ? 'page' : undefined}><Icon name={icon} /><span>{label}</span></Link>)}</nav><div className="sidebar-foot">Um passo de cada vez.<br />Seu negócio, sem limites.</div></aside><div className="app-workspace"><header className="app-header"><span className="app-header-title">Sua loja. Infinitas possibilidades.</span><span className="mobile-app-brand"><Brand /></span><div className="profile"><div className="profile-menu-wrap" ref={profileMenu} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node))setMenuOpen(false);}}><button ref={profileButton} type="button" className="profile-trigger" onClick={()=>setMenuOpen(!menuOpen)} onKeyDown={event=>{if(event.key==='ArrowDown'){event.preventDefault();setMenuOpen(true);}}} aria-haspopup="menu" aria-expanded={menuOpen} aria-controls="profile-settings-menu" aria-label={`Configurações de ${user.name}`}><span className="avatar">{user.name.slice(0,1).toUpperCase()}</span><span className="profile-info">{user.name}<small>{user.role==='admin'?'Administrador':'Equipe da loja'}</small></span><Icon name="chevron" size={13}/></button>{menuOpen&&<div className="profile-settings-menu" id="profile-settings-menu" role="menu" aria-label="Configurações da conta" onKeyDown={event=>{if(['ArrowUp','ArrowDown','Home','End'].includes(event.key)){event.preventDefault();settingsButton.current?.focus();}}}><span className="profile-menu-label">CONFIGURAÇÕES</span><button ref={settingsButton} type="button" role="menuitem" onClick={()=>{setMenuOpen(false);setSettingsOpen(true);}}><Icon name="lock" size={19}/><span>Alterar senha<small>{user.role==='admin'?'Sua conta e usuários da equipe':'Gerencie a senha da sua conta'}</small></span><Icon name="arrow" size={16}/></button></div>}</div><button className="quiet" onClick={logout} disabled={pending} aria-label="Sair da conta"><Icon name="logout" size={17} /><span>{pending ? 'Saindo…' : 'Sair'}</span></button></div></header>{error && <p className="form-error" role="alert">{error}</p>}{children}</div>{settingsOpen&&<PasswordSettings user={user} onClose={closeSettings}/>}</div>;
}
