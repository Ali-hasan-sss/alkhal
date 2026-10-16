'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { Button, Card, Label, PageHeader, Select } from '@/components/ui';
import { Badge, DataTable, Td, Tr } from '@/components/table';
import { money } from '@/lib/utils';
import { labelAr, PAYMENT_METHOD_AR, SALE_STATUS_AR } from '@/lib/labels';

type Sale = {
  id: string;
  receiptNumber: string;
  status: string;
  customerName: string | null;
  total: string;
  cogs: string;
  grossProfit: string;
  completedAt: string | null;
  user: { id: string; nameAr: string };
  payments: Array<{ method: string; amount: string }>;
};

type Cashier = { id: string; nameAr: string; role: { nameAr: string } };
type DrawerRow = {
  cashierUserId: string;
  cashierNameAr: string;
  roleNameAr: string;
  cashDue: string;
  saleCount: number;
  currencySymbol: string;
};

export default function SalesPage() {
  const qc = useQueryClient();
  const [cashierId, setCashierId] = useState('');
  const [error, setError] = useState('');

  const cashiers = useQuery({
    queryKey: ['sales-cashiers'],
    queryFn: () => api<Cashier[]>('/sales/cashiers'),
  });
  const drawers = useQuery({
    queryKey: ['pos-drawers'],
    queryFn: () => api<DrawerRow[]>('/pos/drawers'),
    retry: false,
  });
  const { data, refetch } = useQuery({
    queryKey: ['sales', cashierId],
    queryFn: () => api<Sale[]>(cashierId ? `/sales?userId=${cashierId}` : '/sales'),
  });

  const collect = useMutation({
    mutationFn: (cashierUserId: string) =>
      api('/pos/drawers/collect', {
        method: 'POST',
        body: JSON.stringify({ cashierUserId }),
      }),
    onSuccess: () => {
      setError('');
      qc.invalidateQueries({ queryKey: ['pos-drawers'] });
      qc.invalidateQueries({ queryKey: ['pos-catalog'] });
    },
    onError: (err: Error) => setError(err instanceof ApiError ? err.messageAr : err.message),
  });

  return (
    <div className="space-y-4">
      <PageHeader title="المبيعات" />
      {drawers.data ? (
        <Card>
          <h2 className="mb-3 text-base font-bold">صناديق الكاشير</h2>
          <p className="mb-3 text-sm text-stone-500">استلام المبلغ النقدي من الكاشير يصفّر صندوقه حتى المبيعات الجديدة.</p>
          {error ? <p className="mb-3 text-sm text-red-700">{error}</p> : null}
          <div className="grid gap-3 md:grid-cols-2">
            {drawers.data.map((row) => (
              <div key={row.cashierUserId} className="flex items-center justify-between gap-3 rounded-lg border border-stone-200 p-3">
                <div>
                  <div className="font-semibold">{row.cashierNameAr}</div>
                  <div className="text-burgundy text-lg font-extrabold">
                    {money(row.cashDue, row.currencySymbol)}
                  </div>
                  <div className="text-xs text-stone-500">{row.saleCount} مبيعات نقدية غير مستلمة اليوم</div>
                </div>
                <Button
                  type="button"
                  disabled={collect.isPending || !(Number(row.cashDue) > 0)}
                  onClick={() => {
                    if (
                      confirm(
                        `استلام ${money(row.cashDue, row.currencySymbol)} من ${row.cashierNameAr} وتصفير الصندوق؟`,
                      )
                    ) {
                      collect.mutate(row.cashierUserId);
                    }
                  }}
                >
                  استلام
                </Button>
              </div>
            ))}
          </div>
        </Card>
      ) : null}
      <Card>
        <div className="mb-4 max-w-xs">
          <Label>تصفية حسب الكاشير</Label>
          <Select value={cashierId} onChange={(e) => setCashierId(e.target.value)}>
            <option value="">كل الكاشير</option>
            {(cashiers.data ?? []).map((row) => (
              <option key={row.id} value={row.id}>
                {row.nameAr}
              </option>
            ))}
          </Select>
        </div>
        <DataTable
          embedded
          headers={['رقم', 'الزبون', 'الدفع', 'الحالة', 'الإجمالي', 'التكلفة', 'الربح', 'الكاشير', '']}
          empty={(data ?? []).length === 0}
        >
          {(data ?? []).map((s) => (
            <Tr key={s.id}>
              <Td>{s.receiptNumber}</Td>
              <Td>{s.customerName ?? '—'}</Td>
              <Td>
                {s.payments.map((p) => labelAr(PAYMENT_METHOD_AR, p.method)).join('، ') || '—'}
              </Td>
              <Td>
                <Badge tone={s.status === 'COMPLETED' ? 'ok' : 'neutral'}>
                  {labelAr(SALE_STATUS_AR, s.status)}
                </Badge>
              </Td>
              <Td numeric>{money(s.total)}</Td>
              <Td numeric>{money(s.cogs)}</Td>
              <Td numeric>{money(s.grossProfit)}</Td>
              <Td>{s.user.nameAr}</Td>
              <Td>
                {s.status === 'COMPLETED' ? (
                  <Button
                    variant="ghost"
                    onClick={() =>
                      api(`/sales/${s.id}/refund`, {
                        method: 'POST',
                        body: JSON.stringify({ reason: 'استرجاع من الواجهة' }),
                      }).then(() => refetch())
                    }
                  >
                    استرجاع
                  </Button>
                ) : null}
              </Td>
            </Tr>
          ))}
        </DataTable>
      </Card>
    </div>
  );
}
