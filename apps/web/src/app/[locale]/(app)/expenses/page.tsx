'use client';

import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button, Card, Input, Label, PageHeader, Select } from '@/components/ui';
import { money } from '@/lib/utils';

export default function ExpensesPage() {
  const qc = useQueryClient();
  const expenses = useQuery({
    queryKey: ['expenses'],
    queryFn: () =>
      api<Array<{ id: string; amount: string; description: string; expenseDate: string; category: { nameAr: string } }>>(
        '/expenses',
      ),
  });
  const cats = useQuery({
    queryKey: ['expense-categories'],
    queryFn: () => api<Array<{ id: string; nameAr: string }>>('/expense-categories'),
  });
  const [categoryId, setCategoryId] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');

  const create = useMutation({
    mutationFn: () =>
      api('/expenses', {
        method: 'POST',
        body: JSON.stringify({
          categoryId,
          amount,
          description,
          expenseDate: new Date().toISOString(),
          paid: true,
          paymentMethod: 'CASH',
        }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['expenses'] }),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    create.mutate();
  }

  return (
    <div className="space-y-6">
      <PageHeader title="المصروفات" />
      <Card>
        <form onSubmit={onSubmit} className="grid gap-3 md:grid-cols-4">
          <div>
            <Label>التصنيف</Label>
            <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required>
              <option value="">—</option>
              {(cats.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nameAr}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>المبلغ</Label>
            <Input value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </div>
          <div>
            <Label>الوصف</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} required />
          </div>
          <div className="flex items-end">
            <Button type="submit">حفظ</Button>
          </div>
        </form>
      </Card>
      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-start">
              <th className="py-2">التاريخ</th>
              <th>التصنيف</th>
              <th>الوصف</th>
              <th>المبلغ</th>
            </tr>
          </thead>
          <tbody>
            {(expenses.data ?? []).map((e) => (
              <tr key={e.id} className="border-b">
                <td className="py-2">{new Date(e.expenseDate).toLocaleDateString('ar')}</td>
                <td>{e.category.nameAr}</td>
                <td>{e.description}</td>
                <td>{money(e.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
