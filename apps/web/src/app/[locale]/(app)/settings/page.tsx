'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button, Card, Label, PageHeader, Select } from '@/components/ui';
import {
  CURRENCY_NAME_AR,
  DEFAULT_CURRENCY,
  DEFAULT_CURRENCY_SYMBOL,
  OVERHEAD_METHOD_AR,
  OVERHEAD_METHOD_HINT_AR,
  labelAr,
} from '@/lib/labels';

const METHODS = ['BY_REVENUE', 'BY_SALES_QUANTITY', 'BY_DIRECT_COST'] as const;

export default function SettingsPage() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['restaurant'],
    queryFn: () =>
      api<{
        nameAr: string;
        nameEn: string;
        currency: string;
        currencySymbol?: string;
        overheadAllocationMethod: string;
        locale: string;
      }>('/restaurants/current'),
  });
  const [method, setMethod] = useState('BY_REVENUE');
  useEffect(() => {
    if (data) {
      setMethod(data.overheadAllocationMethod);
    }
  }, [data]);

  const save = useMutation({
    mutationFn: () =>
      api('/restaurants/current', {
        method: 'PATCH',
        body: JSON.stringify({
          currency: DEFAULT_CURRENCY,
          currencySymbol: DEFAULT_CURRENCY_SYMBOL,
          overheadAllocationMethod: method,
        }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['restaurant'] }),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    save.mutate();
  }

  return (
    <div>
      <PageHeader title="الإعدادات" />
      <Card className="max-w-xl space-y-4">
        <div>
          <div className="text-lg font-bold">{data?.nameAr ?? '…'}</div>
          <p className="mt-1 text-sm text-stone-500">
            العملة: {CURRENCY_NAME_AR} ({DEFAULT_CURRENCY_SYMBOL})
          </p>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <Label>طريقة توزيع التكاليف الثابتة</Label>
            <Select value={method} onChange={(e) => setMethod(e.target.value)}>
              {METHODS.map((code) => (
                <option key={code} value={code}>
                  {OVERHEAD_METHOD_AR[code]}
                </option>
              ))}
            </Select>
            <p className="mt-2 text-sm text-stone-600">{labelAr(OVERHEAD_METHOD_HINT_AR, method)}</p>
          </div>
          <ul className="space-y-2 rounded-lg bg-stone-50 p-3 text-sm text-stone-600">
            {METHODS.map((code) => (
              <li key={code}>
                <span className="font-semibold text-ink">{OVERHEAD_METHOD_AR[code]}: </span>
                {OVERHEAD_METHOD_HINT_AR[code]}
              </li>
            ))}
          </ul>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? 'جاري الحفظ…' : 'حفظ'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
