import { requireUser } from '../../lib/session';
import { AppShell } from '../../components/app-shell';
export const dynamic = 'force-dynamic';
export default async function SystemLayout({ children }: { children: React.ReactNode }) { const user = await requireUser(); return <AppShell user={user}>{children}</AppShell>; }
