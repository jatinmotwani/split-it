import Link from 'next/link';
import { APP_NAME } from '@/config/app';
import { SignOutButton } from '@/features/auth/sign-out-button';
import { getCurrentUser } from '@/server/auth/session';

export default async function HomePage() {
  const user = await getCurrentUser();
  return (
    <main>
      <h1>{APP_NAME}</h1>
      {user ? (
        <>
          <p>Hi, {user.name}</p>
          <SignOutButton />
        </>
      ) : (
        <Link href="/sign-in">Sign in</Link>
      )}
    </main>
  );
}
