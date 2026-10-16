'use client';

import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button, Card, Input, Label, PageHeader } from '@/components/ui';
import { labelAr, STOCK_COUNT_STATUS_AR } from '@/lib/labels';

export default function CountsPage() {
  const qc = useQueryClient();
  const counts = useQuery({
    queryKey: ['counts'],
    queryFn: () =>
      api<Array<{ id: string; status: string; createdAt: string; items: Array<{ difference: string }> }>>(
        '/stock-counts',
      ),
  });
  const inventory = useQuery({
    queryKey: ['inventory'],
    queryFn: () =>
      api<Array<{ ingredientId: string; quantity: string; ingredient: { nameAr: string } }>>('/inventory'),
  });
  const [actuals, setActuals] = useState<Record<string, string>>({});

  const create = useMutation({
    mutationFn: () =>
      api('/stock-counts', {
        method: 'POST',
        body: JSON.stringify({
          items: (inventory.data ?? []).map((row) => ({
            ingredientId: row.ingredientId,
            actualQuantity: actuals[row.ingredientId] ?? row.quantity,
          })),
        }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['counts'] }),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    create.mutate();
  }

  return (
    <div className="space-y-6">
      <PageHeader title="الجرد الفعلي" />
      <Card>
        <form onSubmit={onSubmit} className="space-y-3">
          {(inventory.data ?? []).slice(0, 20).map((row) => (
            <div key={row.ingredientId} className="grid grid-cols-3 gap-3 text-sm">
              <div>{row.ingredient.nameAr}</div>
              <div>النظام: {row.quantity}</div>
              <Input
                value={actuals[row.ingredientId] ?? row.quantity}
                onChange={(e) => setActuals((s) => ({ ...s, [row.ingredientId]: e.target.value }))}
              />
            </div>
          ))}
          <Button type="submit">حفظ العد</Button>
        </form>
      </Card>
      <Card>
        {(counts.data ?? []).map((c) => (
          <div key={c.id} className="mb-2 flex items-center justify-between border-b py-2">
            <span>
              {labelAr(STOCK_COUNT_STATUS_AR, c.status)} — {new Date(c.createdAt).toLocaleString('ar')}
            </span>
            {c.status === 'COUNTED' ? (
              <Button
                onClick={() =>
                  api(`/stock-counts/${c.id}/approve`, { method: 'POST' }).then(() =>
                    qc.invalidateQueries({ queryKey: ['counts'] }),
                  )
                }
              >
                اعتماد
              </Button>
            ) : null}
          </div>
        ))}
      </Card>
    </div>
  );
}
