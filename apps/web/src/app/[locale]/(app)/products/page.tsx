'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { Button, Card, Input, Label, PageHeader, Select } from '@/components/ui';
import { Badge, DataTable, Modal, Td, Tr } from '@/components/table';
import { money } from '@/lib/utils';
import { labelAr, PRODUCT_TYPE_AR } from '@/lib/labels';

type Category = { id: string; nameAr: string; active: boolean };
type Unit = { id: string; nameAr: string; symbol: string };
type Ingredient = { id: string; nameAr: string; type: string; baseUnitId: string; active: boolean };
type RecipeOption = {
  id: string;
  nameAr: string;
  outputIngredientId?: string | null;
  outputIngredient?: { nameAr: string } | null;
  outputUnit?: { id: string; symbol: string };
};
type Component = {
  recipeId?: string | null;
  ingredientId?: string | null;
  quantity: string;
  unitId: string;
  isPackaging: boolean;
  recipe?: { nameAr: string; outputIngredient?: { nameAr: string } | null } | null;
  ingredient?: { nameAr: string } | null;
  unit?: { symbol: string };
};
type Product = {
  id: string;
  sku: string;
  nameAr: string;
  nameEn: string;
  sellingPrice: string;
  pricingMethod: string;
  targetMarginPercent: string;
  markupPercent: string;
  type: string;
  inventoryMode: string;
  directIngredientId?: string | null;
  active: boolean;
  sortOrder: number;
  categoryId: string;
  category: { nameAr: string };
  components?: Component[];
};

type ProductCost = {
  id: string;
  cost: string;
  fullCost?: string;
  overheadPerUnit?: string;
  recommendedPrice?: string;
  suggestedPrice?: string;
  sellingPrice: string;
  targetMarginPercent: string;
  operatingProfit?: string;
};

type FormComponent = {
  kind: 'recipe' | 'ingredient';
  recipeId: string;
  ingredientId: string;
  quantity: string;
  unitId: string;
  isPackaging: boolean;
};

const emptyForm = {
  sku: '',
  nameAr: '',
  nameEn: '',
  categoryId: '',
  type: 'STANDARD',
  inventoryMode: 'RECIPE',
  directIngredientId: '',
  pricingMethod: 'FIXED_PRICE',
  targetMarginPercent: '45',
  markupPercent: '0',
  sellingPrice: '0',
  sortOrder: '0',
  active: true,
};

const emptyComponent = (): FormComponent => ({
  kind: 'recipe',
  recipeId: '',
  ingredientId: '',
  quantity: '1',
  unitId: '',
  isPackaging: false,
});

export default function ProductsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [components, setComponents] = useState<FormComponent[]>([]);
  const [error, setError] = useState('');

  const products = useQuery({
    queryKey: ['products'],
    queryFn: () => api<Product[]>('/products'),
  });
  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: () => api<Category[]>('/categories'),
  });
  const ingredients = useQuery({
    queryKey: ['ingredients'],
    queryFn: () => api<Ingredient[]>('/ingredients'),
  });
  const recipeOptions = useQuery({
    queryKey: ['recipes'],
    queryFn: () => api<RecipeOption[]>('/recipes'),
  });
  const units = useQuery({
    queryKey: ['units'],
    queryFn: () => api<Unit[]>('/units'),
  });
  const costs = useQuery({
    queryKey: ['product-costs'],
    queryFn: () =>
      api<
        | Array<ProductCost>
        | { products: ProductCost[] }
      >('/reports/product-costs'),
  });
  const prepareable = useQuery({
    queryKey: ['prepareable'],
    queryFn: () =>
      api<Record<string, { prepareable: string; limitingIngredient: string | null }>>(
        '/production/prepareable',
      ),
  });
  const costList = Array.isArray(costs.data) ? costs.data : costs.data?.products ?? [];
  const costMap = Object.fromEntries(costList.map((c) => [c.id, c]));

  const rows = useMemo(() => {
    const q = search.trim();
    return (products.data ?? []).filter(
      (p) => !q || p.nameAr.includes(q) || p.nameEn.toLowerCase().includes(q.toLowerCase()) || p.sku.includes(q),
    );
  }, [products.data, search]);

  const save = useMutation({
    mutationFn: () => {
      const body = {
        sku: form.sku,
        nameAr: form.nameAr,
        nameEn: form.nameEn || form.nameAr,
        categoryId: form.categoryId,
        type: form.type,
        inventoryMode: form.inventoryMode,
        directIngredientId: form.directIngredientId || undefined,
        pricingMethod: form.pricingMethod,
        targetMarginPercent: form.targetMarginPercent,
        markupPercent: form.markupPercent,
        sellingPrice: form.sellingPrice,
        sortOrder: Number(form.sortOrder) || 0,
        active: form.active,
        components: components
          .filter((c) => (c.kind === 'recipe' ? c.recipeId : c.ingredientId) && c.unitId)
          .map((c, index) => ({
            recipeId: c.kind === 'recipe' ? c.recipeId : undefined,
            ingredientId: c.kind === 'ingredient' ? c.ingredientId : undefined,
            quantity: c.quantity,
            unitId: c.unitId,
            isPackaging: c.isPackaging,
            sortOrder: index,
          })),
      };
      return editingId
        ? api(`/products/${editingId}`, { method: 'PATCH', body: JSON.stringify(body) })
        : api('/products', { method: 'POST', body: JSON.stringify(body) });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['product-costs'] });
      qc.invalidateQueries({ queryKey: ['recipes'] });
      qc.invalidateQueries({ queryKey: ['prepareable'] });
      setOpen(false);
    },
    onError: (err: Error) => setError(err instanceof ApiError ? err.messageAr : err.message),
  });

  function openCreate() {
    setEditingId(null);
    setForm({
      ...emptyForm,
      sku: `PRD-${Date.now().toString(36).toUpperCase()}`,
      categoryId: categories.data?.[0]?.id ?? '',
    });
    setComponents([]);
    setError('');
    setOpen(true);
  }

  function openEdit(p: Product) {
    setEditingId(p.id);
    setForm({
      sku: p.sku,
      nameAr: p.nameAr,
      nameEn: p.nameEn,
      categoryId: p.categoryId,
      type: p.type,
      inventoryMode: p.inventoryMode,
      directIngredientId: p.directIngredientId ?? '',
      pricingMethod: p.pricingMethod,
      targetMarginPercent: String(p.targetMarginPercent),
      markupPercent: String(p.markupPercent),
      sellingPrice: String(p.sellingPrice),
      sortOrder: String(p.sortOrder ?? 0),
      active: p.active,
    });
    setComponents(
      (p.components ?? []).map((c) => ({
        kind: c.recipeId ? 'recipe' : 'ingredient',
        recipeId: c.recipeId ?? '',
        ingredientId: c.ingredientId ?? '',
        quantity: String(c.quantity),
        unitId: c.unitId,
        isPackaging: c.isPackaging,
      })),
    );
    setError('');
    setOpen(true);
  }

  async function remove(p: Product) {
    if (!confirm(`حذف أو إيقاف المنتج «${p.nameAr}»؟`)) {
      return;
    }
    await api(`/products/${p.id}`, { method: 'DELETE' });
    qc.invalidateQueries({ queryKey: ['products'] });
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    save.mutate();
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="المنتجات"
        actions={
          <Button onClick={openCreate} type="button">
            إضافة منتج
          </Button>
        }
      />
      <p className="text-sm text-stone-500">
        اربط المنتج بمكوّنات الوصفة (صلصة، فطر…). «يمكن تحضير» = الكمية القابلة للبيع فوراً من نقطة البيع حسب المخزون، دون
        تحضير مسبق. سعر البيع يضعه المدير؛ التكلفة والسعر المقترح يظهران تلقائياً (مواد + تشغيل + هامش).
      </p>
      <Card className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input placeholder="بحث بالاسم أو الرمز" value={search} onChange={(e) => setSearch(e.target.value)} />
      </Card>
      <DataTable
        headers={[
          'المنتج',
          'التصنيف',
          'متاح للبيع',
          'التكلفة',
          'سعر البيع',
          'السعر المقترح',
          'الحالة',
          'إجراءات',
        ]}
        empty={rows.length === 0}
      >
        {rows.map((p) => (
          <Tr key={p.id}>
            <Td>
              <div className="font-semibold">{p.nameAr}</div>
              <div className="text-xs text-stone-400">
                {p.sku} · {labelAr(PRODUCT_TYPE_AR, p.type)}
              </div>
              {(p.components ?? []).length > 0 ? (
                <div className="mt-1 text-xs text-stone-500">
                  {(p.components ?? [])
                    .map((c) => c.recipe?.nameAr ?? c.ingredient?.nameAr)
                    .filter(Boolean)
                    .join(' + ')}
                </div>
              ) : null}
            </Td>
            <Td>{p.category.nameAr}</Td>
            <Td numeric>
              {p.inventoryMode === 'RECIPE' ? (
                <div>
                  <div className="font-semibold">{prepareable.data?.[p.id]?.prepareable ?? '—'}</div>
                  {prepareable.data?.[p.id]?.limitingIngredient ? (
                    <div className="text-xs text-stone-400">
                      محدود بـ {prepareable.data[p.id].limitingIngredient}
                    </div>
                  ) : null}
                </div>
              ) : (
                '—'
              )}
            </Td>
            <Td numeric>{money(costMap[p.id]?.fullCost ?? costMap[p.id]?.cost ?? 0)}</Td>
            <Td numeric>{money(p.sellingPrice)}</Td>
            <Td numeric>{money(costMap[p.id]?.recommendedPrice ?? 0)}</Td>
            <Td>
              <Badge tone={p.active ? 'ok' : 'neutral'}>{p.active ? 'نشط' : 'موقوف'}</Badge>
            </Td>
            <Td>
              <div className="flex gap-2">
                <Button variant="ghost" type="button" onClick={() => openEdit(p)}>
                  تعديل
                </Button>
                <Button variant="danger" type="button" onClick={() => remove(p)}>
                  حذف
                </Button>
              </div>
            </Td>
          </Tr>
        ))}
      </DataTable>

      <Modal open={open} title={editingId ? 'تعديل المنتج' : 'منتج جديد'} onClose={() => setOpen(false)} wide>
        <form onSubmit={onSubmit} className="grid gap-3 md:grid-cols-2">
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
            <Label>الصنف</Label>
            <Select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} required>
              <option value="">—</option>
              {(categories.data ?? [])
                .filter((c) => c.active)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nameAr}
                  </option>
                ))}
            </Select>
          </div>
          <div>
            <Label>نوع المنتج</Label>
            <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="STANDARD">عادي</option>
              <option value="ADDON">إضافة</option>
              <option value="MODIFIER">معدل</option>
            </Select>
          </div>
          <div>
            <Label>طريقة المخزون</Label>
            <Select value={form.inventoryMode} onChange={(e) => setForm({ ...form, inventoryMode: e.target.value })}>
              <option value="RECIPE">حسب الوصفة</option>
              <option value="DIRECT">خصم مادة مباشرة</option>
              <option value="NONE">بدون مخزون</option>
            </Select>
          </div>
          {form.inventoryMode === 'DIRECT' ? (
            <div className="md:col-span-2">
              <Label>المادة المرتبطة</Label>
              <Select
                value={form.directIngredientId}
                onChange={(e) => setForm({ ...form, directIngredientId: e.target.value })}
              >
                <option value="">—</option>
                {(ingredients.data ?? []).map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.nameAr}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}
          <div>
            <Label>طريقة التسعير</Label>
            <Select value={form.pricingMethod} onChange={(e) => setForm({ ...form, pricingMethod: e.target.value })}>
              <option value="FIXED_PRICE">سعر ثابت</option>
              <option value="MARKUP_PERCENT">هامش إضافة %</option>
              <option value="GROSS_MARGIN_PERCENT">هامش ربح إجمالي %</option>
            </Select>
          </div>
          <div>
            <Label>سعر البيع (يُستخدم في نقطة البيع)</Label>
            <Input value={form.sellingPrice} onChange={(e) => setForm({ ...form, sellingPrice: e.target.value })} />
            {editingId && costMap[editingId]?.fullCost ? (
              <p className="mt-1 text-xs text-stone-500">
                التكلفة الكاملة {money(costMap[editingId].fullCost)} · حصة التشغيل{' '}
                {money(costMap[editingId].overheadPerUnit ?? 0)} · ربح التشغيل{' '}
                {money(costMap[editingId].operatingProfit ?? 0)}
              </p>
            ) : null}
            {editingId && costMap[editingId]?.recommendedPrice ? (
              <button
                type="button"
                className="mt-1 text-sm text-orange"
                onClick={() =>
                  setForm({
                    ...form,
                    sellingPrice: costMap[editingId].recommendedPrice ?? form.sellingPrice,
                    pricingMethod: 'FIXED_PRICE',
                  })
                }
              >
                اعتماد السعر المقترح {money(costMap[editingId].recommendedPrice)}
              </button>
            ) : null}
          </div>
          <div>
            <Label>الهامش المستهدف %</Label>
            <Input
              value={form.targetMarginPercent}
              onChange={(e) => setForm({ ...form, targetMarginPercent: e.target.value })}
            />
          </div>
          <div>
            <Label>نسبة الإضافة %</Label>
            <Input value={form.markupPercent} onChange={(e) => setForm({ ...form, markupPercent: e.target.value })} />
          </div>
          <div>
            <Label>ترتيب العرض</Label>
            <Input value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
              />
              نشط ويظهر في نقطة البيع
            </label>
          </div>
          {form.inventoryMode === 'RECIPE' ? (
            <div className="md:col-span-2 space-y-2">
              <div className="flex items-center justify-between">
                <Label>الوصفات والمواد المرتبطة</Label>
                <div className="flex gap-2">
                  <Button type="button" variant="ghost" onClick={() => setComponents((prev) => [...prev, emptyComponent()])}>
                    + وصفة (عجينة / صوص)
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() =>
                      setComponents((prev) => [...prev, { ...emptyComponent(), kind: 'ingredient' }])
                    }
                  >
                    + مادة
                  </Button>
                </div>
              </div>
              <p className="text-xs text-stone-500">
                اربط البيتزا بوصفة العجينة ووصفة الصوص، ثم أضف الموزاريلا أو أي مادة أولية. لا تُعاد كتابة مكونات العجينة.
              </p>
              {components.map((row, index) => {
                const preparedRecipes = (recipeOptions.data ?? []).filter((r) => r.outputIngredientId);
                return (
                  <div key={index} className="grid gap-2 rounded-lg border border-stone-200 bg-cream p-3 md:grid-cols-12">
                    <div className="md:col-span-5">
                      {row.kind === 'recipe' ? (
                        <Select
                          value={row.recipeId}
                          onChange={(e) => {
                            const recipe = preparedRecipes.find((r) => r.id === e.target.value);
                            setComponents((prev) =>
                              prev.map((c, i) =>
                                i === index
                                  ? {
                                      ...c,
                                      recipeId: e.target.value,
                                      unitId: recipe?.outputUnit?.id || c.unitId,
                                    }
                                  : c,
                              ),
                            );
                          }}
                        >
                          <option value="">وصفة محضّرة</option>
                          {preparedRecipes.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.nameAr}
                              {r.outputIngredient ? ` → ${r.outputIngredient.nameAr}` : ''}
                            </option>
                          ))}
                        </Select>
                      ) : (
                        <Select
                          value={row.ingredientId}
                          onChange={(e) => {
                            const ing = (ingredients.data ?? []).find((i) => i.id === e.target.value);
                            setComponents((prev) =>
                              prev.map((c, i) =>
                                i === index
                                  ? { ...c, ingredientId: e.target.value, unitId: ing?.baseUnitId || c.unitId }
                                  : c,
                              ),
                            );
                          }}
                        >
                          <option value="">مادة أولية / محضّرة / تغليف</option>
                          {(ingredients.data ?? [])
                            .filter((i) => i.active)
                            .map((i) => (
                              <option key={i.id} value={i.id}>
                                {i.nameAr}
                                {i.type === 'PREPARED' ? ' — ناتج وصفة' : ''}
                              </option>
                            ))}
                        </Select>
                      )}
                    </div>
                    <div className="md:col-span-2">
                      <Input
                        placeholder="الكمية"
                        value={row.quantity}
                        onChange={(e) =>
                          setComponents((prev) =>
                            prev.map((c, i) => (i === index ? { ...c, quantity: e.target.value } : c)),
                          )
                        }
                      />
                    </div>
                    <div className="md:col-span-3">
                      <Select
                        value={row.unitId}
                        onChange={(e) =>
                          setComponents((prev) =>
                            prev.map((c, i) => (i === index ? { ...c, unitId: e.target.value } : c)),
                          )
                        }
                      >
                        <option value="">الوحدة</option>
                        {(units.data ?? []).map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.nameAr} ({u.symbol})
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div className="flex items-center gap-2 md:col-span-2">
                      <label className="flex items-center gap-1 text-xs">
                        <input
                          type="checkbox"
                          checked={row.isPackaging}
                          onChange={(e) =>
                            setComponents((prev) =>
                              prev.map((c, i) => (i === index ? { ...c, isPackaging: e.target.checked } : c)),
                            )
                          }
                        />
                        تغليف
                      </label>
                      <Button
                        type="button"
                        variant="danger"
                        onClick={() => setComponents((prev) => prev.filter((_, i) => i !== index))}
                      >
                        حذف
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
          {error ? <p className="md:col-span-2 text-sm text-red-700">{error}</p> : null}
          <div className="md:col-span-2 flex justify-end gap-2 pt-2">
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
