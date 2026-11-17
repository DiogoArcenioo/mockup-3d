import { StockApp, type Tab } from '../../../components/store/stock-app';
export default async function Stock({ searchParams }: { searchParams: Promise<{ aba?: string; novo?: string }> }) {
  const { aba, novo } = await searchParams;
  const tab: Tab = aba === 'produtos' || aba === 'vendas' ? aba : 'vender';
  return <StockApp initialTab={novo ? 'produtos' : tab} openWizard={Boolean(novo)} />;
}
