'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from '@/i18n/navigation';
import { Sidebar } from '@/components/sidebar';

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  useEffect(() => {
    if (!localStorage.getItem('accessToken')) {
      router.replace('/login');
    }
  }, [router]);
  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar />
      <main className="app-scroll min-h-0 min-w-0 flex-1 p-6">{children}</main>
    </div>
  );
}
