'use client';

import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button, Card, Input, Label, PageHeader, Select } from '@/components/ui';
import { money } from '@/lib/utils';

export default function WastePage() {
  const qc = useQueryClient();
  const waste = useQuery({
    queryKey: ['waste'],
    queryFn: () =>
      api<Array<{ id: string; quantity: string; totalCost: string; ingredient: { nameAr: string }; reason: { nameAr: string } }>>(
        '/waste',
      ),
  });
  const reasons = useQuery({
    queryKey: ['waste-reasons'],
    queryFn: () => api<Array<{ id: string; nameAr: string }>>('/waste/reasons'),
  });
  const ingredients = useQuery({
    queryKey: ['ingredients'],
    queryFn: () => api<Array<{ id: string; nameAr: string; baseUnitId: string }>>('/ingredients'),
  });
  const [ingredientId, setIngredientId] = useState('');
  const [reasonId, setReasonId] = useState('');
  const [quantity, setQuantity] = useState('1');

  const create = useMutation({
    mutationFn: () => {
      const ing = ingredients.data?.find((i) => i.id === ingredientId);
      return api('/waste', {
        method: 'POST',
        body: JSON.stringify({
          ingredientId,
          reasonId,
          quantity,
          unitId: ing?.baseUnitId,
        }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['waste'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['production-ready'] });
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    create.mutate();
  }

  return (
    <div className="space-y-6">
      <PageHeader title="الهدر" />
      <Card>
        <form onSubmit={onSubmit} className="grid gap-3 md:grid-cols-4">
          <div>
            <Label>المادة</Label>
            <Select value={ingredientId} onChange={(e) => setIngredientId(e.target.value)} required>
              <option value="">—</option>
              {(ingredients.data ?? []).map((i) => (
                <option key={i.id} value={i.id}>
                  {i.nameAr}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>السبب</Label>
            <Select value={reasonId} onChange={(e) => setReasonId(e.target.value)} required>
              <option value="">—</option>
              {(reasons.data ?? []).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nameAr}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>الكمية</Label>
            <Input value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </div>
          <div className="flex items-end">
            <Button type="submit">تسجيل هدر</Button>
          </div>
        </form>
      </Card>
      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-start">
              <th className="py-2">المادة</th>
              <th>السبب</th>
              <th>الكمية</th>
              <th>التكلفة</th>
            </tr>
          </thead>
          <tbody>
            {(waste.data ?? []).map((w) => (
              <tr key={w.id} className="border-b">
                <td className="py-2">{w.ingredient.nameAr}</td>
                <td>{w.reason.nameAr}</td>
                <td>{w.quantity}</td>
                <td>{money(w.totalCost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
