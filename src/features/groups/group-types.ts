import type { GroupType } from '@/lib/contracts/groups';

export const GROUP_TYPE_OPTIONS: { value: GroupType; label: string }[] = [
  { value: 'trip', label: 'Trip' },
  { value: 'home', label: 'Home' },
  { value: 'couple', label: 'Couple' },
  { value: 'other', label: 'Other' },
];
