import { requireUser } from '../../../lib/session';
import { HomeDashboard } from '../../../components/store/home';
export default async function Dashboard() {
  const user = await requireUser();
  return <HomeDashboard firstName={user.name.split(' ')[0]} />;
}
