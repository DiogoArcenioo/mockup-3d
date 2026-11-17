import { shiftDate, today } from '../store/lib';

export type Period = 'month' | 'last' | 'week' | 'year' | 'all';
export const periodRange = (p: Period) => {
  const t = today(), first = t.slice(0, 8) + '01';
  if (p === 'month') return { from: first, to: t };
  if (p === 'last') { const end = shiftDate(first, -1); return { from: end.slice(0, 8) + '01', to: end }; }
  if (p === 'week') return { from: shiftDate(t, -6), to: t };
  if (p === 'year') return { from: t.slice(0, 5) + '01-01', to: t };
  return { from: '2000-01-01', to: '2100-12-31' };
};
export const periodOptions: [Period, string][] = [['month', 'Este mês'], ['last', 'Mês passado'], ['week', '7 dias'], ['year', 'Ano'], ['all', 'Tudo']];
