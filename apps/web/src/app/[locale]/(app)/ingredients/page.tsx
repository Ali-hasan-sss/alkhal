'use client';

import { useEffect } from 'react';
import { useRouter } from '@/i18n/navigation';

/** Merged into /inventory (materials + stock tabs). */
export default function IngredientsRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/inventory?tab=materials');
  }, [router]);
  return <p className="p-6 text-sm text-stone-500">جاري التحويل إلى المواد والمخزون…</p>;
}
