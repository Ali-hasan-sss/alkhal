'use client';

import { FormEvent, Suspense, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { Button, Card, Input, Label, PageHeader, Select, Tabs } from '@/components/ui';
import { Badge, DataTable, Modal, Td, Tr } from '@/components/table';
import { money } from '@/lib/utils';
import { INGREDIENT_TYPE_AR, labelAr } from '@/lib/labels';

type BalanceRow = {
  id: string;
  ingredientId: string;
  quantity: string;
  averageCost: string;
  costPerKg: string;
  ingredient: {
    id: string;
    nameAr: string;
    nameEn: string;
    sku: string;
    type: string;
    categoryId?: string | null;
    reorderPoint: string;
    minimumStock: string;
    targetStock: string;
    active: boolean;
    baseUnit: { id: string; symbol: string; code: string; unitType: string };
    category?: { nameAr: string } | null;
  };
};

type Ingredient = {
  id: string;
  sku: string;
  nameAr: string;
  nameEn: string;
  type: string;
  categoryId?: string | null;
  baseUnitId: string;
  minimumStock: string;
  reorderPoint: string;
  targetStock: string;
  averageCost: string;
  costPerKg: string;
  active: boolean;
  baseUnit: { symbol: string; nameAr: string; code: string; unitType: string };
  category?: { nameAr: string } | null;
  inventoryBalance?: { quantity: string };
};

type Unit = { id: string; nameAr: string; symbol: string; code: string; unitType: string };

const emptyForm = {
  sku: '',
  nameAr: '',
  nameEn: '',
  type: 'RAW',
  categoryId: '',
  baseUnitId: '',
  minimumStock: '0',
  reorderPoint: '0',
  targetStock: '0',
  costPerKg: '',
  active: true,
};

export default function InventoryPage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-stone-500">جاري التحميل…</p>}>
      <InventoryPageInner />
    </Suspense>
  );
}

function InventoryPageInner() {
  const qc = useQueryClient();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') === 'materials' ? 'materials' : 'stock';
  const [tab, setTab] = useState<'stock' | 'materials'>(initialTab);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const [current, setCurrent] = useState<BalanceRow | null>(null);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [receiveQty, setReceiveQty] = useState('');
  const [receiveUnitId, setReceiveUnitId] = useState('');
  const [receiveNotes, setReceiveNotes] = useState('');
  const [adjustQty, setAdjustQty] = useState('0');
  const [adjustNotes, setAdjustNotes] = useState('');

  const inventory = useQuery({
    queryKey: ['inventory'],
    queryFn: () => api<BalanceRow[]>('/inventory'),
  });
  const ingredients = useQuery({
    queryKey: ['ingredients'],
    queryFn: () => api<Ingredient[]>('/ingredients'),
  });
  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: () => api<Array<{ id: string; nameAr: string }>>('/categories'),
  });
  const units = useQuery({
    queryKey: ['units'],
    queryFn: () => api<Unit[]>('/units'),
  });

  const stockRows = useMemo(() => {
    const q = search.trim();
    return (inventory.data ?? []).filter((r) => {
      const i = r.ingredient;
      return !q || i.nameAr.includes(q) || i.sku.includes(q);
    });
  }, [inventory.data, search]);

  const materialRows = useMemo(() => {
    const q = search.trim();
    return (ingredients.data ?? []).filter(
      (i) => !q || i.nameAr.includes(q) || i.sku.includes(q) || i.nameEn.toLowerCase().includes(q.toLowerCase()),
    );
  }, [ingredients.data, search]);

  const selectedUnit = (units.data ?? []).find((u) => u.id === form.baseUnitId);
  const costIsPerPiece = selectedUnit?.unitType === 'COUNT';

  const saveMaterial = useMutation({
    mutationFn: () => {
      const body = {
        sku: form.sku,
        nameAr: form.nameAr,
        nameEn: form.nameEn || form.nameAr,
        type: form.type,
        categoryId: form.categoryId || undefined,
        baseUnitId: form.baseUnitId,
        minimumStock: form.minimumStock,
        reorderPoint: form.reorderPoint,
        targetStock: form.targetStock,
        costPerKg: form.costPerKg,
        active: form.active,
      };
      return editingId
        ? api(`/ingredients/${editingId}`, { method: 'PATCH', body: JSON.stringify(body) })
        : api('/ingredients', { method: 'POST', body: JSON.stringify(body) });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ingredients'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['product-costs'] });
      setFormOpen(false);
    },
    onError: (err: Error) => setError(err instanceof ApiError ? err.messageAr : err.message),
  });

  const receive = useMutation({
    mutationFn: () =>
      api('/inventory/receive', {
        method: 'POST',
        body: JSON.stringify({
          ingredientId: current?.ingredientId,
          quantity: receiveQty,
          unitId: receiveUnitId || undefined,
          notes: receiveNotes || 'إضافة كمية للمخزون',
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['ingredients'] });
      setReceiveOpen(false);
    },
    onError: (err: Error) => setError(err instanceof ApiError ? err.messageAr : err.message),
  });

  const adjust = useMutation({
    mutationFn: () =>
      api('/inventory/adjust', {
        method: 'POST',
        body: JSON.stringify({
          ingredientId: current?.ingredientId,
          quantity: adjustQty,
          notes: adjustNotes || 'تعديل من شاشة المخزون',
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['ingredients'] });
      setAdjustOpen(false);
    },
    onError: (err: Error) => setError(err instanceof ApiError ? err.messageAr : err.message),
  });

  function openCreate() {
    setEditingId(null);
    setForm({
      ...emptyForm,
      sku: `ING-${Date.now().toString(36).toUpperCase()}`,
      baseUnitId: units.data?.[0]?.id ?? '',
    });
    setError('');
    setFormOpen(true);
  }

  function openEditMaterial(i: Ingredient) {
    setEditingId(i.id);
    setForm({
      sku: i.sku,
      nameAr: i.nameAr,
      nameEn: i.nameEn,
      type: i.type,
      categoryId: i.categoryId ?? '',
      baseUnitId: i.baseUnitId,
      minimumStock: String(i.minimumStock),
      reorderPoint: String(i.reorderPoint),
      targetStock: String(i.targetStock),
      costPerKg: i.costPerKg ?? '',
      active: i.active,
    });
    setError('');
    setFormOpen(true);
  }

  function openEditFromStock(row: BalanceRow) {
    openEditMaterial({
      id: row.ingredient.id,
      sku: row.ingredient.sku,
      nameAr: row.ingredient.nameAr,
      nameEn: row.ingredient.nameEn,
      type: row.ingredient.type,
      categoryId: row.ingredient.categoryId,
      baseUnitId: row.ingredient.baseUnit.id,
      minimumStock: row.ingredient.minimumStock,
      reorderPoint: row.ingredient.reorderPoint,
      targetStock: row.ingredient.targetStock,
      averageCost: row.averageCost,
      costPerKg: row.costPerKg,
      active: row.ingredient.active,
      baseUnit: {
        symbol: row.ingredient.baseUnit.symbol,
        nameAr: '',
        code: row.ingredient.baseUnit.code,
        unitType: row.ingredient.baseUnit.unitType,
      },
      category: row.ingredient.category,
    });
  }

  async function removeMaterial(i: Ingredient) {
    if (!confirm(`حذف أو إيقاف المادة «${i.nameAr}»؟`)) {
      return;
    }
    await api(`/ingredients/${i.id}`, { method: 'DELETE' });
    qc.invalidateQueries({ queryKey: ['ingredients'] });
    qc.invalidateQueries({ queryKey: ['inventory'] });
  }

  function openReceive(row: BalanceRow) {
    setCurrent(row);
    setReceiveQty('');
    setReceiveUnitId(row.ingredient.baseUnit.id);
    setReceiveNotes('');
    setError('');
    setReceiveOpen(true);
  }

  function openAdjust(row: BalanceRow) {
    setCurrent(row);
    setAdjustQty('0');
    setAdjustNotes('');
    setError('');
    setAdjustOpen(true);
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="المواد والمخزون"
        actions={
          <Button type="button" onClick={openCreate}>
            إضافة مادة
          </Button>
        }
      />
      <p className="text-sm text-stone-500">
        عرّف المواد مع سعرها ووحدتها، ثم أضف الكميات للمخزون. المواد المحضّرة تظهر هنا بعد التحضير من صفحة الوصفات.
      </p>
      <Tabs
        items={[
          { id: 'stock', label: 'الأرصدة والكميات' },
          { id: 'materials', label: 'تعريف المواد' },
        ]}
        value={tab}
        onChange={(id) => setTab(id as 'stock' | 'materials')}
      />
      <Card>
        <Input placeholder="بحث بالاسم أو الرمز" value={search} onChange={(e) => setSearch(e.target.value)} />
      </Card>

      {tab === 'stock' ? (
        <DataTable
          headers={['المادة', 'النوع', 'الكمية', 'حد الطلب', 'التكلفة', 'القيمة', 'إجراءات']}
          empty={stockRows.length === 0}
        >
          {stockRows.map((row) => {
            const qty = Number(row.quantity);
            const low = qty <= Number(row.ingredient.reorderPoint);
            return (
              <Tr key={row.id}>
                <Td>
                  <div className="font-semibold">{row.ingredient.nameAr}</div>
                  <div className="text-xs text-stone-400">
                    {row.ingredient.sku} · {row.ingredient.category?.nameAr ?? ''}
                  </div>
                </Td>
                <Td>
                  <Badge tone="brand">{labelAr(INGREDIENT_TYPE_AR, row.ingredient.type)}</Badge>
                </Td>
                <Td numeric>
                  {low ? <Badge tone="danger">منخفض</Badge> : null}{' '}
                  {row.quantity} {row.ingredient.baseUnit.symbol}
                </Td>
                <Td numeric>{row.ingredient.reorderPoint}</Td>
                <Td numeric>
                  {money(row.costPerKg)}
                  {row.ingredient.baseUnit.unitType === 'COUNT' ? ' / وحدة' : ' / كغ'}
                </Td>
                <Td numeric>{money(Number(row.quantity) * Number(row.averageCost))}</Td>
                <Td>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" type="button" onClick={() => openReceive(row)}>
                      إضافة كمية
                    </Button>
                    <Button variant="ghost" type="button" onClick={() => openEditFromStock(row)}>
                      تعديل
                    </Button>
                    <Button variant="ghost" type="button" onClick={() => openAdjust(row)}>
                      تصحيح
                    </Button>
                  </div>
                </Td>
              </Tr>
            );
          })}
        </DataTable>
      ) : (
        <DataTable
          headers={['المادة', 'النوع', 'المخزون', 'حد الطلب', 'التكلفة', 'الحالة', 'إجراءات']}
          empty={materialRows.length === 0}
        >
          {materialRows.map((i) => {
            const qty = Number(i.inventoryBalance?.quantity ?? 0);
            const low = qty <= Number(i.reorderPoint);
            return (
              <Tr key={i.id}>
                <Td>
                  <div className="font-semibold">{i.nameAr}</div>
                  <div className="text-xs text-stone-400">
                    {i.sku} · {i.category?.nameAr ?? '—'}
                  </div>
                </Td>
                <Td>
                  <Badge tone="brand">{labelAr(INGREDIENT_TYPE_AR, i.type)}</Badge>
                </Td>
                <Td numeric>
                  <span className={low ? 'text-red-700' : ''}>
                    {i.inventoryBalance?.quantity ?? 0} {i.baseUnit.symbol}
                  </span>
                </Td>
                <Td numeric>{i.reorderPoint}</Td>
                <Td numeric>
                  {money(i.costPerKg)}
                  {i.baseUnit.unitType === 'COUNT' ? ' / وحدة' : ' / كغ'}
                </Td>
                <Td>
                  <Badge tone={i.active ? 'ok' : 'neutral'}>{i.active ? 'نشطة' : 'موقوفة'}</Badge>
                </Td>
                <Td>
                  <div className="flex gap-2">
                    <Button variant="ghost" type="button" onClick={() => openEditMaterial(i)}>
                      تعديل
                    </Button>
                    <Button variant="danger" type="button" onClick={() => removeMaterial(i)}>
                      حذف
                    </Button>
                  </div>
                </Td>
              </Tr>
            );
          })}
        </DataTable>
      )}

      <Modal open={formOpen} title={editingId ? 'تعديل المادة' : 'مادة جديدة'} onClose={() => setFormOpen(false)} wide>
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            saveMaterial.mutate();
          }}
          className="grid gap-3 md:grid-cols-2"
        >
          <div>
            <Label>الاسم بالعربي</Label>
            <Input value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} required />
          </div>
          <div>
            <Label>الاسم بالإنجليزي</Label>
            <Input value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} />
          </div>
          <div>
            <Label>الرمز SKU</Label>
            <Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} required />
          </div>
          <div>
            <Label>النوع</Label>
            <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="RAW">مادة أولية</option>
              <option value="PREPARED">مادة محضّرة</option>
              <option value="PACKAGING">تغليف</option>
            </Select>
          </div>
          <div>
            <Label>الصنف</Label>
            <Select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
              <option value="">—</option>
              {(categories.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nameAr}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>وحدة الأساس</Label>
            <Select
              value={form.baseUnitId}
              onChange={(e) => setForm({ ...form, baseUnitId: e.target.value })}
              required
              disabled={Boolean(editingId)}
            >
              <option value="">—</option>
              {(units.data ?? []).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nameAr} ({u.symbol})
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>حد إعادة الطلب</Label>
            <Input value={form.reorderPoint} onChange={(e) => setForm({ ...form, reorderPoint: e.target.value })} />
          </div>
          <div>
            <Label>المخزون المستهدف</Label>
            <Input value={form.targetStock} onChange={(e) => setForm({ ...form, targetStock: e.target.value })} />
          </div>
          <div>
            <Label>{costIsPerPiece ? 'سعر / تكلفة الوحدة' : 'سعر / تكلفة الكيلوغرام'}</Label>
            <Input
              value={form.costPerKg}
              onChange={(e) => setForm({ ...form, costPerKg: e.target.value })}
              required
              min="0.01"
              step="0.01"
              inputMode="decimal"
            />
            <p className="mt-1 text-xs text-stone-500">يُستخدم لحساب تكلفة الوصفة وسعر المنتج المقترح.</p>
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
              />
              نشطة
            </label>
          </div>
          {error ? <p className="md:col-span-2 text-sm text-red-700">{error}</p> : null}
          <div className="md:col-span-2 flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setFormOpen(false)}>
              إلغاء
            </Button>
            <Button type="submit" disabled={saveMaterial.isPending}>
              حفظ
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={receiveOpen}
        title={`إضافة كمية — ${current?.ingredient.nameAr ?? ''}`}
        onClose={() => setReceiveOpen(false)}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            receive.mutate();
          }}
          className="space-y-3"
        >
          <p className="text-sm text-stone-500">
            الكمية الحالية: {current?.quantity} {current?.ingredient.baseUnit.symbol}
          </p>
          <div>
            <Label>الكمية المضافة</Label>
            <Input value={receiveQty} onChange={(e) => setReceiveQty(e.target.value)} required min="0.0001" />
          </div>
          <div>
            <Label>الوحدة</Label>
            <Select value={receiveUnitId} onChange={(e) => setReceiveUnitId(e.target.value)}>
              {(units.data ?? []).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nameAr} ({u.symbol})
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>ملاحظة</Label>
            <Input value={receiveNotes} onChange={(e) => setReceiveNotes(e.target.value)} placeholder="اختياري" />
          </div>
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setReceiveOpen(false)}>
              إلغاء
            </Button>
            <Button type="submit" disabled={receive.isPending}>
              إضافة للمخزون
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={adjustOpen} title={`تصحيح كمية — ${current?.ingredient.nameAr ?? ''}`} onClose={() => setAdjustOpen(false)}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            adjust.mutate();
          }}
          className="space-y-3"
        >
          <p className="text-sm text-stone-500">
            الكمية الحالية: {current?.quantity} {current?.ingredient.baseUnit.symbol}. موجبة للزيادة أو سالبة للنقص.
          </p>
          <div>
            <Label>الكمية (+ أو −)</Label>
            <Input value={adjustQty} onChange={(e) => setAdjustQty(e.target.value)} required />
          </div>
          <div>
            <Label>سبب التعديل</Label>
            <Input value={adjustNotes} onChange={(e) => setAdjustNotes(e.target.value)} required />
          </div>
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setAdjustOpen(false)}>
              إلغاء
            </Button>
            <Button type="submit" disabled={adjust.isPending}>
              تطبيق
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
