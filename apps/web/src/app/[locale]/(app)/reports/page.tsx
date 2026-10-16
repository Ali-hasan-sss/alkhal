'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, PageHeader } from '@/components/ui';
import { money } from '@/lib/utils';
import { labelAr, OVERHEAD_METHOD_AR, OVERHEAD_METHOD_HINT_AR } from '@/lib/labels';

export default function ReportsPage() {
  const pnl = useQuery({
    queryKey: ['pnl'],
    queryFn: () =>
      api<{
        revenue: string;
        cogs: string;
        grossProfit: string;
        operatingExpenses: string;
        netOperatingProfit: string;
        allocationMethod: string;
      }>('/reports/pnl'),
  });
  const valuation = useQuery({
    queryKey: ['valuation'],
    queryFn: () => api<{ total: string }>('/reports/inventory-valuation'),
  });
  const payables = useQuery({
    queryKey: ['payables'],
    queryFn: () => api<{ total: string }>('/reports/payables'),
  });
  const overhead = useQuery({
    queryKey: ['overhead'],
    queryFn: () =>
      api<{ method: string; totalOverhead: string; allocations: Array<{ category: string; amount: string }> }>(
        '/reports/overhead',
      ),
  });

  return (
    <div className="space-y-6">
      <PageHeader title="التقارير" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <div className="text-sm text-stone-500">الإيرادات</div>
          <div className="text-2xl font-bold">{money(pnl.data?.revenue)}</div>
        </Card>
        <Card>
          <div className="text-sm text-stone-500">تكلفة البضاعة</div>
          <div className="text-2xl font-bold">{money(pnl.data?.cogs)}</div>
        </Card>
        <Card>
          <div className="text-sm text-stone-500">مجمل الربح</div>
          <div className="text-2xl font-bold">{money(pnl.data?.grossProfit)}</div>
        </Card>
        <Card>
          <div className="text-sm text-stone-500">صافي الربح التشغيلي</div>
          <div className="text-2xl font-bold">{money(pnl.data?.netOperatingProfit)}</div>
        </Card>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <h2 className="mb-2 font-semibold">قيمة المخزون</h2>
          <div className="text-xl">{money(valuation.data?.total)}</div>
        </Card>
        <Card>
          <h2 className="mb-2 font-semibold">مستحقات الموردين</h2>
          <div className="text-xl">{money(payables.data?.total)}</div>
        </Card>
        <Card>
          <h2 className="mb-2 font-semibold">التكاليف الثابتة</h2>
          <div className="text-sm font-semibold text-burgundy">
            {labelAr(OVERHEAD_METHOD_AR, overhead.data?.method ?? pnl.data?.allocationMethod)}
          </div>
          <p className="mt-1 text-xs text-stone-500">
            {labelAr(OVERHEAD_METHOD_HINT_AR, overhead.data?.method ?? pnl.data?.allocationMethod)}
          </p>
          <div className="mt-2 text-xl">{money(overhead.data?.totalOverhead)}</div>
          {(overhead.data?.allocations ?? []).length > 0 ? (
            <ul className="mt-3 space-y-1 text-sm text-stone-600">
              {overhead.data!.allocations.map((row) => (
                <li key={row.category} className="flex justify-between gap-3">
                  <span>{row.category}</span>
                  <span className="tabular-nums">{money(row.amount)}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </Card>
      </div>
    </div>
  );
}
