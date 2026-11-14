import Link from 'next/link';
import { requireUser } from '../../../lib/session';
import { Icon } from '../../../components/icons';
export default async function Dashboard() {
  const user = await requireUser();
  const modules = [
    ['/estoque', 'box', 'Estoque em dia', 'Cadastre produtos e acompanhe o que tem na loja.', 'ORGANIZAR'],
    ['/financeiro', 'wallet', 'Cada centavo conta', 'Registre entradas e acompanhe seus custos de compra.', 'CONTROLAR'],
    ['/mockup', 'mug', 'Sua arte em 3D', 'Crie e baixe mockups de canecas no estúdio 3D.', 'CRIAR'],
    ...(user.role === 'admin' ? [['/usuarios', 'users', 'Sua equipe, por perto', 'Crie os acessos de quem faz parte da sua loja.', 'CONECTAR']] : []),
  ];
  return <main className="app-content"><div className="eyebrow page-eyebrow">UM NOVO DIA. NOVAS POSSIBILIDADES.</div><h1 className="page-title">Olá, {user.name.split(' ')[0]}.</h1><p className="page-description">Seu próximo passo para cuidar da loja.</p><section className="welcome-banner"><div><div className="eyebrow">SUA JORNADA COMEÇA AQUI</div><h2>Pequenos passos. Grandes ideias.</h2><p>Organize seus produtos, cuide dos custos e dê vida às suas estampas. Uma coisa de cada vez.</p></div><span className="welcome-stamp"><Icon name="spark" size={37} /></span></section><div className="module-grid">{modules.map(([href, icon, title, description, action]) => <Link href={href} key={href} className="module-card"><div className="module-top"><Icon name={icon} size={24} /><span>{action} ↗</span></div><h3>{title}</h3><p>{description}</p></Link>)}</div><p className="step-note"><Icon name="check" size={16} />Seu primeiro passo: cadastre um produto e registre sua primeira entrada.</p></main>;
}
