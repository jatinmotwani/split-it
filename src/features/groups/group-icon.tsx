import { Heart, House, Plane, Users, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

const ICONS: Record<string, LucideIcon> = {
  trip: Plane,
  home: House,
  couple: Heart,
  other: Users,
  direct: Users,
};

export function GroupIcon({ type, className }: { type: string; className?: string }) {
  const Icon = ICONS[type] ?? Users;
  return (
    <span
      className={cn(
        'inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground',
        className,
      )}
    >
      <Icon className="size-5" aria-hidden />
    </span>
  );
}
