'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '@/lib/api';
import { Card, PageHeader } from '@/components/ui';
import { Badge, DataTable, Td, Tr } from '@/components/table';
import { money } from '@/lib/utils';
import { labelAr, OVERHEAD_METHOD_AR } from '@/lib/labels';

type Dashboard = {
  today: {
    sales: string;
    orders: number;
    cogs: string;
    grossProfit: string;
    expenses: string;
    netProfit: string;
  };
  trend: Array<{ date: string; sales: string; profit: string }>;
  topProducts: Array<{ nameAr: string; quantity: string; total: string; profit: string }>;
  salesByCategory: Array<{ nameAr: string; total: string }>;
  expensesByCategory: Array<{ nameAr: string; total: string }>;
  lowStock: Array<{
    nameAr: string;
    quantity: string;
    reorderPoint: string;
    targetStock: string;
    unit: string;
  }>;
  overheadAllocationMethod: string;
};

const KPI_TONES = [
  { bar: 'bg-orange', value: 'text-orange' },
  { bar: 'bg-burgundy', value: 'text-burgundy' },
  { bar: 'bg-orange', value: 'text-orange' },
  { bar: 'bg-burgundy', value: 'text-burgundy' },
  { bar: 'bg-stone-400', value: 'text-ink' },
  { bar: 'bg-orange', value: 'text-orange' },
];

export default function DashboardPage() {
  const t = useTranslations('dashboard');
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api<Dashboard>('/reports/dashboard'),
  });

  if (isLoading || !data) {
    return (
      <div className="flex h-full min-h-80 items-center justify-center text-stone-500">
        جاري تحميل لوحة التحكم…
      </div>
    );
  }

  const kpis = [
    { label: t('todaySales'), value: money(data.today.sales) },
    { label: t('todayOrders'), value: String(data.today.orders) },
    { label: t('todayCogs'), value: money(data.today.cogs) },
    { label: t('todayGross'), value: money(data.today.grossProfit) },
    { label: t('todayExpenses'), value: money(data.today.expenses) },
    { label: t('todayNet'), value: money(data.today.netProfit) },
  ];

  return (
    <div className="space-y-6 pb-4">
      <PageHeader
        title="لوحة التحكم"
        actions={
          <div className="text-sm text-stone-500">
            {t('allocation')}: <Badge tone="brand">{labelAr(OVERHEAD_METHOD_AR, data.overheadAllocationMethod)}</Badge>
          </div>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {kpis.map((kpi, i) => (
          <Card key={kpi.label} className="overflow-hidden p-0">
            <div className={`h-1.5 ${KPI_TONES[i].bar}`} />
            <div className="p-5">
              <div className="text-sm font-semibold text-stone-500">{kpi.label}</div>
              <div className={`mt-2 text-2xl font-extrabold tabular-nums ${KPI_TONES[i].value}`}>{kpi.value}</div>
            </div>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 text-base font-extrabold text-burgundy">{t('salesTrend')}</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value) => [value, 'المبيعات']} />
                <Line type="monotone" dataKey="sales" stroke="#E85D04" strokeWidth={2} dot={false} name="المبيعات" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <h2 className="mb-4 text-base font-extrabold text-burgundy">{t('profitTrend')}</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="profit" stroke="#7B2D3B" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="overflow-hidden p-0">
          <div className="border-b border-stone-100 px-5 py-3 text-base font-extrabold text-burgundy">
            {t('topProducts')}
          </div>
          <DataTable
            embedded
            headers={['#', 'المنتج', 'الكمية', 'المبيعات', 'الربح']}
            empty={data.topProducts.length === 0}
          >
            {data.topProducts.map((p, idx) => (
              <Tr key={p.nameAr}>
                <Td>
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-orange/10 text-xs font-bold text-orange">
                    {idx + 1}
                  </span>
                </Td>
                <Td>
                  <span className="font-medium">{p.nameAr}</span>
                </Td>
                <Td numeric>{p.quantity}</Td>
                <Td numeric>{money(p.total)}</Td>
                <Td numeric>
                  <span className="text-burgundy">{money(p.profit)}</span>
                </Td>
              </Tr>
            ))}
          </DataTable>
        </Card>
        <Card className="overflow-hidden p-0">
          <div className="border-b border-stone-100 px-5 py-3 text-base font-extrabold text-burgundy">
            {t('lowStock')}
          </div>
          <DataTable
            embedded
            headers={['المادة', 'الحالي', 'حد الطلب', 'المستهدف', 'الحالة']}
            empty={data.lowStock.length === 0}
          >
            {data.lowStock.map((s) => (
              <Tr key={s.nameAr}>
                <Td>
                  <span className="font-medium">{s.nameAr}</span>
                </Td>
                <Td numeric>
                  {s.quantity} {s.unit}
                </Td>
                <Td numeric>
                  {s.reorderPoint} {s.unit}
                </Td>
                <Td numeric>
                  {s.targetStock} {s.unit}
                </Td>
                <Td>
                  <Badge tone="danger">منخفض</Badge>
                </Td>
              </Tr>
            ))}
          </DataTable>
        </Card>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <h2 className="mb-4 text-base font-extrabold text-burgundy">{t('byCategory')}</h2>
          <div className="mb-4 h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.salesByCategory}>
                <XAxis dataKey="nameAr" tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value) => [value, 'المبيعات']} />
                <Bar dataKey="total" radius={[6, 6, 0, 0]} name="المبيعات">
                  {data.salesByCategory.map((_, i) => (
                    <Cell key={i} fill={i % 2 === 0 ? '#E85D04' : '#7B2D3B'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <DataTable headers={['التصنيف', 'المبيعات']} empty={data.salesByCategory.length === 0}>
            {data.salesByCategory.map((c) => (
              <Tr key={c.nameAr}>
                <Td>{c.nameAr}</Td>
                <Td numeric>{money(c.total)}</Td>
              </Tr>
            ))}
          </DataTable>
        </Card>
        <Card>
          <h2 className="mb-4 text-base font-extrabold text-burgundy">{t('expenseBreakdown')}</h2>
          <DataTable headers={['البند', 'المبلغ']} empty={(data.expensesByCategory ?? []).length === 0}>
            {(data.expensesByCategory ?? []).map((e) => (
              <Tr key={e.nameAr}>
                <Td>{e.nameAr}</Td>
                <Td numeric>{money(e.total)}</Td>
              </Tr>
            ))}
          </DataTable>
        </Card>
      </div>
    </div>
  );
}
