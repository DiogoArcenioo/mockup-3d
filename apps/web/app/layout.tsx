import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/dm-sans';
import './globals.css';
import '../components/password-settings.css';
export const metadata: Metadata = { title: 'Infinity — Gestão da loja', description: 'Infinity. Produtos, estoque, financeiro e criação em um só lugar.', robots: { index: false, follow: false } };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#111111' };
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="pt-BR"><body>{children}</body></html>; }
