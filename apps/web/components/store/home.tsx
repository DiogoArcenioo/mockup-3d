'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Icon } from '../icons';
import { api, money, isLow, today, time, type OrdersPage, type Product } from './lib';
import './store.css';

export function HomeDashboard({ firstName }: { firstName: string }) {
  const [day, setDay] = useState<OrdersPage | null>(null);
  const [low, setLow] = useState<Product[] | null>(null);
  useEffect(() => {
    const t = today();
    api<OrdersPage>(`orders?from=${t}&to=${t}`).then(setDay).catch(() => {});
    api<{ products: Product[] }>('products').then(d => setLow(d.products.filter(p => isLow(p) || (p.type === 'resale' && p.stock <= 0)))).catch(() => {});
  }, []);
  return <main className="app-content st-page st-home">
    <h1 className="page-title">Olá, {firstName}.</h1>
    <Link href="/estoque?aba=vender" className="st-cta">
      <span className="st-cta-icon"><Icon name="cart" size={30} /></span>
      <span><strong>Nova venda</strong><small>Escolha os produtos e feche</small></span>
      <Icon name="arrow" size={24} />
    </Link>
    <div className="st-stats">
      <Link href="/estoque?aba=vendas"><span>Vendido hoje</span><strong>{day ? money(day.totalCents) : '—'}</strong><small>{day ? `${day.count} ${day.count === 1 ? 'venda' : 'vendas'}` : ' '}</small></Link>
      <Link href="/estoque?aba=produtos" className={low?.length ? 'st-stat-warn' : ''}><span>Para repor</span><strong>{low ? low.length : '—'}</strong><small>{low ? (low.length ? 'produtos' : 'tudo em dia') : ' '}</small></Link>
    </div>
    <div className="st-shortcuts">
      <Link href="/estoque?novo=1"><Icon name="plus" size={20} /><span>Cadastrar produto</span></Link>
      <Link href="/estoque?aba=produtos"><Icon name="box" size={20} /><span>Estoque</span></Link>
      <Link href="/financeiro"><Icon name="wallet" size={20} /><span>Financeiro</span></Link>
    </div>
    {day && day.orders.length > 0 && <section className="st-recent">
      <h2>Últimas de hoje</h2>
      <div className="st-list">{day.orders.slice(0, 5).map(o => <div key={o.id} className="st-row st-row-static"><span className="st-order-icon"><Icon name="cart" size={16} /></span><span className="st-row-info"><strong>{o.customer}</strong><small>{time(o.createdAt)}{o.sellerName ? ' · ' + o.sellerName.split(' ')[0] : ''}</small></span><span className="st-row-stock"><strong>{money(o.totalCents)}</strong></span></div>)}</div>
    </section>}
  </main>;
}
