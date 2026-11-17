import { FinanceApp } from '../../../components/finance/finance-app';
export default async function Finance({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  const { aba } = await searchParams;
  return <FinanceApp initialTab={aba === 'devedores' || aba === 'relatorios' ? aba : 'extrato'} />;
}
