import { redirect } from 'next/navigation';
import { requireUser } from '../../../lib/session';
import { UsersPanel } from './panel';
export default async function Users() {
  const user = await requireUser();
  if (user.role !== 'admin') redirect('/inicio');
  return <main className="app-content"><div className="eyebrow page-eyebrow">QUEM FAZ ACONTECER COM VOCÊ</div><h1 className="page-title">Sua equipe.</h1><p className="page-description">Somente administradores podem criar acessos à loja.</p><UsersPanel /></main>;
}
