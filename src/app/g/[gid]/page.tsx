import { AppShell } from '@/components/app-shell';
import { requirePageMembership } from '@/server/pages';

export default async function GroupPage({ params }: { params: Promise<{ gid: string }> }) {
  const { gid } = await params;
  const { membership } = await requirePageMembership(gid, `/g/${gid}`);
  return (
    <AppShell title={membership.group.name} back={{ href: '/', label: 'Back to groups' }}>
      <p className="text-muted-foreground">No expenses yet.</p>
    </AppShell>
  );
}
