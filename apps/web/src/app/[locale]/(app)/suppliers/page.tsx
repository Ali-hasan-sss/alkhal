'use client';

import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button, Card, Input, Label, PageHeader } from '@/components/ui';
import { money } from '@/lib/utils';

export default function SuppliersPage() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => api<Array<{ id: string; nameAr: string; phone?: string; balance: string }>>('/suppliers'),
  });
  const [nameAr, setNameAr] = useState('');
  const [nameEn, setNameEn] = useState('');
  const create = useMutation({
    mutationFn: () =>
      api('/suppliers', {
        method: 'POST',
        body: JSON.stringify({ nameAr, nameEn: nameEn || nameAr }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['suppliers'] }),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    create.mutate();
  }

  return (
    <div className="space-y-6">
      <PageHeader title="الموردون" />
      <Card>
        <form onSubmit={onSubmit} className="grid gap-3 md:grid-cols-3">
          <div>
            <Label>الاسم</Label>
            <Input value={nameAr} onChange={(e) => setNameAr(e.target.value)} required />
          </div>
          <div>
            <Label>الاسم بالإنجليزي</Label>
            <Input value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
          </div>
          <div className="flex items-end">
            <Button type="submit">إضافة</Button>
          </div>
        </form>
      </Card>
      <Card>
        {(data ?? []).map((s) => (
          <div key={s.id} className="flex justify-between border-b py-2 text-sm">
            <span>{s.nameAr}</span>
            <span>الرصيد: {money(s.balance)}</span>
          </div>
        ))}
      </Card>
    </div>
  );
}
