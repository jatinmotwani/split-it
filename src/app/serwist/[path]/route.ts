import { createSerwistRoute } from '@serwist/turbopack';

const revision = process.env.VERCEL_GIT_COMMIT_SHA ?? crypto.randomUUID();

// Serves /serwist/sw.js (bundled by esbuild at build time) with Service-Worker-Allowed: /
export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute(
  {
    swSrc: 'src/app/sw.ts',
    useNativeEsbuild: true,
    additionalPrecacheEntries: [{ url: '/offline', revision }],
  },
);
