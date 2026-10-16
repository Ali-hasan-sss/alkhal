'use client';

import { useTranslations } from 'next-intl';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import { BrandLogo } from '@/components/brand-logo';
import { api, clearTokens } from '@/lib/api';
import { cn } from '@/lib/utils';

const items = [
  { href: '/', key: 'dashboard' },
  { href: '/pos', key: 'pos' },
  { href: '/sales', key: 'sales' },
  { href: '/debts', key: 'debts' },
  { href: '/inventory', key: 'inventory' },
  { href: '/purchases', key: 'purchases' },
  { href: '/suppliers', key: 'suppliers' },
  { href: '/recipes', key: 'recipes' },
  { href: '/products', key: 'products' },
  { href: '/categories', key: 'categories' },
  { href: '/waste', key: 'waste' },
  { href: '/counts', key: 'counts' },
  { href: '/expenses', key: 'expenses' },
  { href: '/employees', key: 'employees' },
  { href: '/reports', key: 'reports' },
  { href: '/settings', key: 'settings' },
] as const;

export function Sidebar() {
  const t = useTranslations('nav');
  const brand = useTranslations();
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch {
      /* ignore */
    }
    clearTokens();
    router.replace('/login');
  }

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-e border-stone-200 bg-white">
      <div className="flex shrink-0 items-center gap-3 border-b border-burgundy/15 px-4 py-4">
        <BrandLogo size={64} className="h-16 w-16 shrink-0" />
        <div>
          <div className="text-xl font-bold text-burgundy">{brand('brand')}</div>
          <div className="text-sm text-orange">Al-Khal snacks</div>
        </div>
      </div>
      <nav className="app-scroll min-h-0 flex-1 px-3 py-3">
        {items.map((item) => {
          const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'mb-1 block rounded-xl px-3 py-2.5 text-sm font-semibold',
                active ? 'bg-orange text-white shadow-sm' : 'text-ink hover:bg-cream',
              )}
            >
              {t(item.key)}
            </Link>
          );
        })}
      </nav>
      <button
        type="button"
        onClick={logout}
        className="m-3 shrink-0 rounded-xl border border-stone-200 px-3 py-2.5 text-sm font-semibold text-burgundy hover:bg-cream"
      >
        {t('logout')}
      </button>
    </aside>
  );
}
