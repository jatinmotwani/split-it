import { Skeleton } from '@/components/ui/skeleton';

export default function GroupLoading() {
  return (
    <div className="min-h-dvh" aria-busy="true" aria-label="Loading group">
      <div className="h-14 border-b" />
      <div className="mx-auto grid max-w-lg gap-4 px-4 pt-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-5 w-24" />
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    </div>
  );
}
