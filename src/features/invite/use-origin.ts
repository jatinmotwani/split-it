'use client';

import { useSyncExternalStore } from 'react';

const noop = () => () => {};

/** The origin the user is on; empty during server rendering (the server can't know it). */
export function useOrigin(): string {
  return useSyncExternalStore(
    noop,
    () => window.location.origin,
    () => '',
  );
}
