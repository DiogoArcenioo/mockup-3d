'use client';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../icons';
import { categories, money, type Product } from './lib';

/** Painel modal: sobe de baixo no celular, centralizado no computador. */
export function Sheet({ title, onClose, children, busy, wide, back }: { title: string; onClose: () => void; children: React.ReactNode; busy?: boolean; wide?: boolean; back?: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog ref={ref} className={`st-sheet${wide ? ' st-sheet-wide' : ''}`} aria-label={title}
    onCancel={e => { e.preventDefault(); if (!busy) onClose(); }}
    onClick={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
    <div className="st-sheet-body">
      <header className="st-sheet-head">
        {back ? <button type="button" className="st-icon-btn" onClick={back} disabled={busy} aria-label="Voltar"><Icon name="back" size={20} /></button> : <span className="st-grip" />}
        <h2>{title}</h2>
        <button type="button" className="st-icon-btn" onClick={onClose} disabled={busy} aria-label="Fechar"><Icon name="close" size={20} /></button>
      </header>
      {children}
    </div>
  </dialog>;
}

/** Digita como em app de banco: 3 → 5 → 0 vira R$ 3,50. */
export function MoneyInput({ value, onChange, label, autoFocus, id, large }: { value: number | null; onChange: (cents: number | null) => void; label: string; autoFocus?: boolean; id?: string; large?: boolean }) {
  return <input id={id} className={`st-money${large ? ' st-money-lg' : ''}`} inputMode="numeric" aria-label={label} autoFocus={autoFocus} placeholder="R$ 0,00"
    value={value === null ? '' : money(value)}
    onFocus={e => { const el = e.currentTarget; requestAnimationFrame(() => { if (document.activeElement === el) el.select(); }); }}
    onClick={e => e.currentTarget.select()}
    onChange={e => { const digits = e.target.value.replace(/\D/g, '').slice(0, 11); onChange(digits ? Number(digits) : null); }} />;
}

export function Stepper({ value, onChange, min = 0, max, label, decimals }: { value: number; onChange: (v: number) => void; min?: number; max?: number; label: string; decimals?: boolean }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value).replace('.', ',')), [value]);
  const clamp = (v: number) => Math.max(min, max === undefined ? v : Math.min(max, v));
  return <div className="st-stepper" role="group" aria-label={label}>
    <button type="button" onClick={() => onChange(clamp(Math.round((value - 1) * 1000) / 1000))} disabled={value <= min} aria-label="Diminuir"><Icon name="minus" size={18} /></button>
    <input inputMode={decimals ? 'decimal' : 'numeric'} aria-label={label} value={text}
      onChange={e => { const raw = e.target.value.replace(decimals ? /[^\d,.]/g : /\D/g, ''); setText(raw); const n = Number(raw.replace(',', '.')); if (raw && Number.isFinite(n)) onChange(clamp(decimals ? Math.round(n * 1000) / 1000 : Math.trunc(n))); }}
      onBlur={() => setText(String(value).replace('.', ','))} />
    <button type="button" onClick={() => onChange(clamp(value + 1))} disabled={max !== undefined && value >= max} aria-label="Aumentar"><Icon name="plus" size={18} /></button>
  </div>;
}

export function Thumb({ product, size = 48 }: { product: Pick<Product, 'photoUrl' | 'category' | 'type' | 'name'>; size?: number }) {
  const [failed, setFailed] = useState(false);
  const icon = product.category ? categories[product.category].icon : product.type === 'consumption' ? 'flask' : 'box';
  return <span className="st-thumb" style={{ width: size, height: size }}>
    {product.photoUrl && !failed ? <img src={product.photoUrl} alt="" loading="lazy" onError={() => setFailed(true)} /> : <Icon name={icon} size={Math.round(size * 0.42)} />}
  </span>;
}

export function Chips<T extends string>({ options, value, onChange, label }: { options: [T, string][]; value: T; onChange: (v: T) => void; label: string }) {
  return <div className="st-chips" role="group" aria-label={label}>
    {options.map(([id, text]) => <button type="button" key={id} aria-pressed={value === id} onClick={() => onChange(id)}>{text}</button>)}
  </div>;
}

export function ErrorText({ children }: { children: React.ReactNode }) {
  return children ? <p className="st-error" role="alert">{children}</p> : null;
}
