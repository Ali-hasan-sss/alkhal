'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { Button, Card, Input, PageHeader } from '@/components/ui';
import { money } from '@/lib/utils';

type DebtRow = {
  id: string;
  customerName: string;
  amount: string;
  remainingAmount: string;
  status: 'OPEN' | 'SETTLED' | 'CANCELLED';
  createdAt: string;
  settledAt: string | null;
  sale: { receiptNumber: string; completedAt: string | null; user: { nameAr: string } };
  settlements: Array<{ id: string; amount: string; paidAt: string; user: { nameAr: string } }>;
};

type DebtsResponse = {
  summary: { outstanding: string; openCustomerCount: number; openCount: number };
  customers: Array<{ customerName: string; remaining: string; amount: string; openCount: number }>;
  debts: DebtRow[];
};

const statusLabel: Record<DebtRow['status'], string> = {
  OPEN: 'مفتوح',
  SETTLED: 'مسدد',
  CANCELLED: 'ملغى',
};

function formatDate(value: string | null) {
  if (!value) {
    return '—';
  }
  return new Date(value).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' });
}

export default function DebtsPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<'OPEN' | 'ALL'>('OPEN');
  const [settleId, setSettleId] = useState<string | null>(null);
  const [settleAmount, setSettleAmount] = useState('');
  const [message, setMessage] = useState('');

  const debts = useQuery({
    queryKey: ['debts', status],
    queryFn: () => api<DebtsResponse>(status === 'ALL' ? '/debts' : '/debts?status=OPEN'),
  });

  const settle = useMutation({
    mutationFn: ({ id, amount }: { id: string; amount: string }) =>
      api(`/debts/${id}/settle`, {
        method: 'POST',
        body: JSON.stringify({ amount, method: 'CASH' }),
      }),
    onSuccess: () => {
      setSettleId(null);
      setSettleAmount('');
      setMessage('تم تسديد الدين');
      qc.invalidateQueries({ queryKey: ['debts'] });
      qc.invalidateQueries({ queryKey: ['sales'] });
    },
    onError: (err: Error) => setMessage(err instanceof ApiError ? err.messageAr : err.message),
  });

  function startSettle(row: DebtRow) {
    setSettleId(row.id);
    setSettleAmount(row.remainingAmount);
    setMessage('');
  }

  return (
    <div className="space-y-6">
      <PageHeader title="سجل الديون" />
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <div className="text-sm text-stone-500">إجمالي الديون المفتوحة</div>
          <div className="mt-1 text-2xl font-bold text-burgundy">{money(debts.data?.summary.outstanding)}</div>
        </Card>
        <Card>
          <div className="text-sm text-stone-500">عدد الزبائن المدينين</div>
          <div className="mt-1 text-2xl font-bold">{debts.data?.summary.openCustomerCount ?? 0}</div>
        </Card>
        <Card>
          <div className="text-sm text-stone-500">عدد الفواتير المفتوحة</div>
          <div className="mt-1 text-2xl font-bold">{debts.data?.summary.openCount ?? 0}</div>
        </Card>
      </div>

      <Card>
        <h2 className="mb-3 text-lg font-semibold">حسب الزبون</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-start">
              <th className="py-2">الزبون</th>
              <th>الفواتير المفتوحة</th>
              <th>أصل الدين</th>
              <th>المتبقي</th>
            </tr>
          </thead>
          <tbody>
            {(debts.data?.customers ?? []).length === 0 ? (
              <tr>
                <td className="py-4 text-stone-500" colSpan={4}>
                  لا توجد ديون مفتوحة
                </td>
              </tr>
            ) : (
              (debts.data?.customers ?? []).map((row) => (
                <tr key={row.customerName} className="border-b">
                  <td className="py-2 font-medium">{row.customerName}</td>
                  <td>{row.openCount}</td>
                  <td>{money(row.amount)}</td>
                  <td className="font-semibold text-burgundy">{money(row.remaining)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>

      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">سجل الفواتير</h2>
          <div className="flex gap-2">
            <Button variant={status === 'OPEN' ? 'primary' : 'ghost'} onClick={() => setStatus('OPEN')}>
              المفتوحة
            </Button>
            <Button variant={status === 'ALL' ? 'primary' : 'ghost'} onClick={() => setStatus('ALL')}>
              الكل
            </Button>
          </div>
        </div>
        {message ? <p className="mb-3 text-sm text-burgundy">{message}</p> : null}
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-start">
              <th className="py-2">الفاتورة</th>
              <th>الزبون</th>
              <th>التاريخ</th>
              <th>المبلغ</th>
              <th>المتبقي</th>
              <th>الحالة</th>
              <th>الموظف</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(debts.data?.debts ?? []).map((row) => (
              <tr key={row.id} className="border-b align-top">
                <td className="py-2">{row.sale.receiptNumber}</td>
                <td>{row.customerName}</td>
                <td>{formatDate(row.sale.completedAt ?? row.createdAt)}</td>
                <td>{money(row.amount)}</td>
                <td>{money(row.remainingAmount)}</td>
                <td>{statusLabel[row.status]}</td>
                <td>{row.sale.user.nameAr}</td>
                <td>
                  {row.status === 'OPEN' ? (
                    settleId === row.id ? (
                      <div className="flex min-w-48 items-center gap-2">
                        <Input
                          value={settleAmount}
                          onChange={(e) => setSettleAmount(e.target.value)}
                          className="h-9"
                        />
                        <Button
                          disabled={settle.isPending}
                          onClick={() => settle.mutate({ id: row.id, amount: settleAmount })}
                        >
                          تسديد
                        </Button>
                        <Button variant="ghost" onClick={() => setSettleId(null)}>
                          إلغاء
                        </Button>
                      </div>
                    ) : (
                      <Button variant="ghost" onClick={() => startSettle(row)}>
                        تسديد
                      </Button>
                    )
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
