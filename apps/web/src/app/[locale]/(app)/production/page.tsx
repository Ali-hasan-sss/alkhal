'use client';

import { useEffect } from 'react';
import { useRouter } from '@/i18n/navigation';

/** Merged into /recipes (recipes + prep tabs). */
export default function ProductionRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/recipes?tab=prep');
  }, [router]);
  return <p className="p-6 text-sm text-stone-500">جاري التحويل إلى الوصفات والتحضير…</p>;
}
