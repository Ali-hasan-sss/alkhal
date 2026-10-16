'use client';

import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button, Card, Input, Label, PageHeader, Select } from '@/components/ui';
import { money } from '@/lib/utils';
import { labelAr, PURCHASE_STATUS_AR } from '@/lib/labels';

type Purchase = {
  id: string;
  invoiceNumber: string;
  status: string;
  total: string;
  remaining: string;
  invoiceDate: string;
  supplier: { nameAr: string };
};

export default function PurchasesPage() {
  const qc = useQueryClient();
  const purchases = useQuery({
    queryKey: ['purchases'],
    queryFn: () => api<Purchase[]>('/purchases'),
  });
  const suppliers = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => api<Array<{ id: string; nameAr: string }>>('/suppliers'),
  });
  const ingredients = useQuery({
    queryKey: ['ingredients'],
    queryFn: () => api<Array<{ id: string; nameAr: string; baseUnitId: string }>>('/ingredients'),
  });
  const units = useQuery({
    queryKey: ['units'],
    queryFn: () => api<Array<{ id: string; nameAr: string }>>('/units'),
  });

  const [supplierId, setSupplierId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [ingredientId, setIngredientId] = useState('');
  const [unitId, setUnitId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unitCost, setUnitCost] = useState('0');

  const create = useMutation({
    mutationFn: () =>
      api('/purchases', {
        method: 'POST',
        body: JSON.stringify({
          supplierId,
          invoiceNumber,
          invoiceDate: new Date().toISOString(),
          items: [{ ingredientId, quantity, unitId, unitCost }],
        }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['purchases'] }),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    create.mutate();
  }

  return (
    <div className="space-y-6">
      <PageHeader title="المشتريات" />
      <Card>
        <form onSubmit={onSubmit} className="grid gap-3 md:grid-cols-3">
          <div>
            <Label>المورد</Label>
            <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} required>
              <option value="">—</option>
              {(suppliers.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nameAr}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>رقم الفاتورة</Label>
            <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} required />
          </div>
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
            <Label>الوحدة</Label>
            <Select value={unitId} onChange={(e) => setUnitId(e.target.value)} required>
              <option value="">—</option>
              {(units.data ?? []).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nameAr}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>الكمية</Label>
            <Input value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </div>
          <div>
            <Label>تكلفة الوحدة</Label>
            <Input value={unitCost} onChange={(e) => setUnitCost(e.target.value)} />
          </div>
          <div className="flex items-end">
            <Button type="submit">إنشاء مسودة</Button>
          </div>
        </form>
      </Card>
      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-start">
              <th className="py-2">الفاتورة</th>
              <th>المورد</th>
              <th>الحالة</th>
              <th>الإجمالي</th>
              <th>المتبقي</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(purchases.data ?? []).map((p) => (
              <tr key={p.id} className="border-b">
                <td className="py-2">{p.invoiceNumber}</td>
                <td>{p.supplier.nameAr}</td>
                <td>{labelAr(PURCHASE_STATUS_AR, p.status)}</td>
                <td>{money(p.total)}</td>
                <td>{money(p.remaining)}</td>
                <td>
                  {p.status === 'DRAFT' ? (
                    <Button
                      onClick={() =>
                        api(`/purchases/${p.id}/post`, { method: 'POST' }).then(() =>
                          qc.invalidateQueries({ queryKey: ['purchases'] }),
                        )
                      }
                    >
                      ترحيل
                    </Button>
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
