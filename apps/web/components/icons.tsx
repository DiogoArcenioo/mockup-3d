export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    arrow: <><path d="M5 12h14m-5-5 5 5-5 5" /></>,
    user: <><circle cx="12" cy="8" r="4" /><path d="M5 21v-2a7 7 0 0 1 14 0v2" /></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="3" /><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" /></>,
    eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
    hide: <><path d="m3 3 18 18M10 5.2a11 11 0 0 1 2-.2c6.5 0 10 7 10 7a17 17 0 0 1-3 4M6 6C3.5 8.4 2 12 2 12s3.5 7 10 7a11 11 0 0 0 5-1.3" /></>,
    home: <><path d="m3 10 9-7 9 7v10H3V10Z" /><path d="M9 20v-7h6v7" /></>,
    box: <><path d="m12 3 9 5v9l-9 5-9-5V8l9-5Zm0 9 9-4M12 12 3 8m9 4v10M7.5 5.5l9 5" /></>,
    wallet: <><rect x="3" y="5" width="18" height="15" rx="3" /><path d="M17 12h4v5h-4a2.5 2.5 0 0 1 0-5ZM3 8V5l14-3v3" /></>,
    mug: <><path d="M4 5h13v11a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V5Zm13 2h2a3 3 0 0 1 0 6h-2M8 2v1m5-1v1" /></>,
    users: <><circle cx="9" cy="8" r="3" /><path d="M3 21v-2a6 6 0 0 1 12 0v2m1-16a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 4v2" /></>,
    logout: <><path d="M9 3H4v18h5m5-5 5-4-5-4m-5 4h11" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    chevron: <path d="m6 9 6 6 6-6" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    spark: <><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.box}</svg>;
}
export function Brand() { return <span className="brand">Infinity<span>.</span><span className="brand-tag">GESTÃO DA LOJA</span></span>; }
