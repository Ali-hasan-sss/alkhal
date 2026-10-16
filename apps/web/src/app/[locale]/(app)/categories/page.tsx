'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { Button, Card, Input, Label, PageHeader, Select } from '@/components/ui';
import { Badge, DataTable, Modal, Td, Tr } from '@/components/table';

type Category = {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  sortOrder: number;
  active: boolean;
};

const empty = { code: '', nameAr: '', nameEn: '', sortOrder: '0', active: true };

export default function CategoriesPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState('');

  const { data } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api<Category[]>('/categories'),
  });

  const rows = useMemo(() => {
    const q = search.trim();
    return (data ?? []).filter((c) => !q || c.nameAr.includes(q) || c.nameEn.toLowerCase().includes(q.toLowerCase()));
  }, [data, search]);

  const save = useMutation({
    mutationFn: () => {
      const body = {
        code: form.code,
        nameAr: form.nameAr,
        nameEn: form.nameEn || form.nameAr,
        sortOrder: Number(form.sortOrder) || 0,
        active: form.active,
      };
      return editingId
        ? api(`/categories/${editingId}`, { method: 'PATCH', body: JSON.stringify(body) })
        : api('/categories', { method: 'POST', body: JSON.stringify(body) });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categories'] });
      setOpen(false);
    },
    onError: (err: Error) => setError(err instanceof ApiError ? err.messageAr : err.message),
  });

  function openCreate() {
    setEditingId(null);
    setForm({ ...empty, code: `cat-${Date.now().toString(36)}` });
    setError('');
    setOpen(true);
  }

  function openEdit(c: Category) {
    setEditingId(c.id);
    setForm({
      code: c.code,
      nameAr: c.nameAr,
      nameEn: c.nameEn,
      sortOrder: String(c.sortOrder),
      active: c.active,
    });
    setError('');
    setOpen(true);
  }

  async function remove(c: Category) {
    if (!confirm(`حذف أو إيقاف الصنف «${c.nameAr}»؟`)) {
      return;
    }
    await api(`/categories/${c.id}`, { method: 'DELETE' });
    qc.invalidateQueries({ queryKey: ['categories'] });
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    save.mutate();
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="الأصناف"
        actions={
          <Button type="button" onClick={openCreate}>
            إضافة صنف
          </Button>
        }
      />
      <Card>
        <Input placeholder="بحث" value={search} onChange={(e) => setSearch(e.target.value)} />
      </Card>
      <DataTable headers={['الصنف', 'الرمز', 'الترتيب', 'الحالة', 'إجراءات']} empty={rows.length === 0}>
        {rows.map((c) => (
          <Tr key={c.id}>
            <Td>
              <div className="font-semibold">{c.nameAr}</div>
              <div className="text-xs text-stone-400">{c.nameEn}</div>
            </Td>
            <Td>{c.code}</Td>
            <Td numeric>{c.sortOrder}</Td>
            <Td>
              <Badge tone={c.active ? 'ok' : 'neutral'}>{c.active ? 'نشط' : 'موقوف'}</Badge>
            </Td>
            <Td>
              <div className="flex gap-2">
                <Button variant="ghost" type="button" onClick={() => openEdit(c)}>
                  تعديل
                </Button>
                <Button variant="danger" type="button" onClick={() => remove(c)}>
                  حذف
                </Button>
              </div>
            </Td>
          </Tr>
        ))}
      </DataTable>
      <Modal open={open} title={editingId ? 'تعديل الصنف' : 'صنف جديد'} onClose={() => setOpen(false)}>
        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <Label>الاسم بالعربي</Label>
            <Input value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} required />
          </div>
          <div>
            <Label>الاسم بالإنجليزي</Label>
            <Input value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} />
          </div>
          <div>
            <Label>الرمز</Label>
            <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required />
          </div>
          <div>
            <Label>الترتيب</Label>
            <Input value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
            />
            نشط
          </label>
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              إلغاء
            </Button>
            <Button type="submit" disabled={save.isPending}>
              حفظ
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
