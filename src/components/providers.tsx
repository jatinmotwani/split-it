'use client';

import { SerwistProvider } from '@serwist/turbopack/react';
import type { ReactNode } from 'react';
import { QueryProvider } from '@/client/query-provider';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SerwistProvider swUrl="/serwist/sw.js" disable={process.env.NODE_ENV !== 'production'}>
      <QueryProvider>{children}</QueryProvider>
    </SerwistProvider>
  );
}
