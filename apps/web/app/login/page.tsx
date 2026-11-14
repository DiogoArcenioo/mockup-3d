import { redirect } from 'next/navigation';
import { getSession } from '../../lib/session';
import { Brand, Icon } from '../../components/icons';
import { MerchArt } from '../../components/merch-art';
import { LoginForm } from './form';
export default async function LoginPage() {
  const { user } = await getSession();
  if (user) redirect('/inicio');
  return <main className="login-page">
    <section className="login-story" aria-label="Bem-vindo ao Infinity">
      <Brand />
      <div className="story-content"><div className="eyebrow"><span className="status-dot" /> O SEU PRÓXIMO PASSO COMEÇA AQUI</div>
        <h1>Sua criatividade.<br />Seu negócio.<br /><span>Sem limites.</span></h1>
        <p>Menos complicação na gestão.<br />Mais espaço para criar e vender.</p>
        <MerchArt />
        <div className="story-categories"><span>CANECAS</span><i /> <span>CAMISETAS</span><i /><span>CAPINHAS</span></div>
      </div>
      <div className="story-footer"><span>FEITO PARA QUEM FAZ ACONTECER.</span><Icon name="spark" size={22} /></div>
    </section>
    <section className="login-panel"><div className="mobile-brand"><Brand /><span className="mobile-label">SUA LOJA. SEM LIMITES.</span></div>
      <div className="login-form-wrap"><div className="welcome-symbol"><Icon name="mug" size={29} /><span><Icon name="spark" size={14} /></span></div>
        <div className="eyebrow form-eyebrow">BOM TER VOCÊ POR AQUI</div><h2>Um novo dia.<br />Infinitas possibilidades.</h2>
        <p className="form-description">Entre para cuidar da sua loja.</p><LoginForm />
        <div className="access-note"><Icon name="lock" size={17} /><p>Seu acesso é criado pelo administrador.<br />Precisa de ajuda? Fale com o responsável pela loja.</p></div>
      </div><footer className="login-footer"><span>Infinity © {new Date().getFullYear()}</span><span>Um passo de cada vez. Sempre em frente.</span></footer>
    </section>
  </main>;
}
