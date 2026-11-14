import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
export type User = { id: string; name: string; login: string; role: 'admin' | 'user' };
export const apiUrl = process.env.API_INTERNAL_URL || 'http://127.0.0.1:3001';
export async function getSession(): Promise<{ user: User | null; unavailable: boolean }> {
  const cookie = (await cookies()).get('forma_auth');
  if (!cookie) return { user: null, unavailable: false };
  try {
    const response = await fetch(`${apiUrl}/api/auth/me`, { headers: { Cookie: `forma_auth=${cookie.value}` }, cache: 'no-store', signal: AbortSignal.timeout(10000) });
    if (response.status === 401) return { user: null, unavailable: false };
    if (!response.ok) return { user: null, unavailable: true };
    return { user: (await response.json()).user, unavailable: false };
  } catch { return { user: null, unavailable: true }; }
}
export async function requireUser() {
  const session = await getSession();
  if (!session.user) redirect(session.unavailable ? '/login?erro=conexao' : '/login');
  return session.user;
}
