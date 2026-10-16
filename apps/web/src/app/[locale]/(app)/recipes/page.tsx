'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { Button, Card, Input, Label, PageHeader, SearchSelect, Select, Tabs } from '@/components/ui';
import { Badge, DataTable, Modal, Td, Tr } from '@/components/table';

type RecipeItem = {
  ingredientId: string;
  quantity: string;
  unitId: string;
  isPackaging: boolean;
  ingredient?: { nameAr: string };
  unit?: { symbol: string };
};

type Recipe = {
  id: string;
  nameAr: string;
  nameEn: string;
  outputQuantity: string;
  outputUnitId: string;
  wasteAllowancePercent: string;
  notes?: string | null;
  active: boolean;
  productId?: string | null;
  outputIngredientId?: string | null;
  items: RecipeItem[];
  product?: { nameAr: string } | null;
  outputIngredient?: { nameAr: string } | null;
  outputUnit?: { symbol: string; nameAr: string };
};

type Ingredient = {
  id: string;
  nameAr: string;
  type: string;
  baseUnitId: string;
  active: boolean;
};
type Product = { id: string; nameAr: string; active: boolean };
type Unit = { id: string; nameAr: string; symbol: string; unitType?: string };
type Category = { id: string; nameAr: string; active?: boolean };

type FormItem = { ingredientId: string; quantity: string; unitId: string; isPackaging: boolean };

type IngredientTarget = { kind: 'output' } | { kind: 'item'; index: number };

type PrepPreview = {
  recipe: { nameAr: string; kind: 'PRODUCT' | 'PREPARED'; outputUnit: string };
  consumption: Array<{
    nameAr: string;
    type: string;
    unit: string;
    needed: string;
    available: string;
    sufficient: boolean;
  }>;
  currentServingsPossible: string;
  limitingIngredient: string | null;
};

type Ready = {
  preparedMaterials: Array<{
    ingredientId: string;
    nameAr: string;
    quantity: string;
    unit: string;
    productEstimates: Array<{ productId: string; nameAr: string; servings: string }>;
  }>;
};

const emptyItem = (): FormItem => ({ ingredientId: '', quantity: '1', unitId: '', isPackaging: false });

const emptyProductQuick = {
  nameAr: '',
  nameEn: '',
  categoryId: '',
  sellingPrice: '0',
};

const emptyIngredientQuick = {
  nameAr: '',
  nameEn: '',
  type: 'RAW',
  baseUnitId: '',
  costPerKg: '',
};

export default function RecipesPage() {
  const qc = useQueryClient();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') === 'prep' ? 'prep' : 'recipes';
  const [tab, setTab] = useState<'recipes' | 'prep'>(initialTab);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [kind, setKind] = useState<'product' | 'prepared' | 'both'>('prepared');
  const [error, setError] = useState('');
  const [prepRecipeId, setPrepRecipeId] = useState('');
  const [prepQty, setPrepQty] = useState('1');
  const [prepError, setPrepError] = useState('');
  const [form, setForm] = useState({
    nameAr: '',
    nameEn: '',
    productId: '',
    outputIngredientId: '',
    outputQuantity: '1',
    outputUnitId: '',
    wasteAllowancePercent: '0',
    notes: '',
    active: true,
    items: [emptyItem()],
  });

  const [productQuickOpen, setProductQuickOpen] = useState(false);
  const [productQuick, setProductQuick] = useState(emptyProductQuick);
  const [productQuickError, setProductQuickError] = useState('');

  const [ingredientQuickOpen, setIngredientQuickOpen] = useState(false);
  const [ingredientTarget, setIngredientTarget] = useState<IngredientTarget | null>(null);
  const [ingredientQuick, setIngredientQuick] = useState(emptyIngredientQuick);
  const [ingredientQuickError, setIngredientQuickError] = useState('');

  const recipes = useQuery({
    queryKey: ['recipes'],
    queryFn: () => api<Recipe[]>('/recipes'),
  });
  const products = useQuery({
    queryKey: ['products'],
    queryFn: () => api<Product[]>('/products'),
  });
  const ingredients = useQuery({
    queryKey: ['ingredients'],
    queryFn: () => api<Ingredient[]>('/ingredients'),
  });
  const units = useQuery({
    queryKey: ['units'],
    queryFn: () => api<Unit[]>('/units'),
  });
  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: () => api<Category[]>('/categories'),
  });
  const ready = useQuery({
    queryKey: ['production-ready'],
    queryFn: () => api<Ready>('/production/ready'),
    enabled: tab === 'prep',
  });
  const prepPreview = useQuery({
    queryKey: ['production-preview', prepRecipeId, prepQty],
    queryFn: () =>
      api<PrepPreview>(
        `/production/preview?quantity=${encodeURIComponent(prepQty)}&recipeId=${prepRecipeId}`,
      ),
    enabled: tab === 'prep' && Boolean(prepRecipeId) && Number(prepQty) > 0,
  });

  const prepared = (ingredients.data ?? []).filter((i) => i.type === 'PREPARED');
  const prepRecipes = useMemo(
    () => (recipes.data ?? []).filter((r) => r.active && r.outputIngredientId),
    [recipes.data],
  );
  const selectedPrepRecipe = prepRecipes.find((r) => r.id === prepRecipeId);
  const rows = useMemo(() => {
    const q = search.trim();
    return (recipes.data ?? []).filter(
      (r) =>
        !q ||
        r.nameAr.includes(q) ||
        r.nameEn.toLowerCase().includes(q.toLowerCase()) ||
        (r.product?.nameAr ?? '').includes(q),
    );
  }, [recipes.data, search]);

  const selectedIngredientUnit = (units.data ?? []).find((u) => u.id === ingredientQuick.baseUnitId);
  const costIsPerPiece = selectedIngredientUnit?.unitType === 'COUNT';

  function payload() {
    return {
      nameAr: form.nameAr,
      nameEn: form.nameEn || form.nameAr,
      productId: kind !== 'prepared' ? form.productId || null : null,
      outputIngredientId: kind !== 'product' ? form.outputIngredientId || null : null,
      outputQuantity: form.outputQuantity,
      outputUnitId: form.outputUnitId,
      wasteAllowancePercent: form.wasteAllowancePercent,
      notes: form.notes || undefined,
      active: form.active,
      items: form.items
        .filter((i) => i.ingredientId && i.unitId)
        .map((i) => ({
          ingredientId: i.ingredientId,
          quantity: i.quantity,
          unitId: i.unitId,
          isPackaging: i.isPackaging,
        })),
    };
  }

  const save = useMutation({
    mutationFn: () => {
      const body = payload();
      if (body.items.length < 1) {
        throw new Error('أضف مادة واحدة على الأقل للوصفة');
      }
      return editingId
        ? api(`/recipes/${editingId}`, { method: 'PATCH', body: JSON.stringify(body) })
        : api('/recipes', { method: 'POST', body: JSON.stringify(body) });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recipes'] });
      setOpen(false);
    },
    onError: (err: Error) => setError(err instanceof ApiError ? err.messageAr : err.message),
  });

  const createProductQuick = useMutation({
    mutationFn: () => {
      const body = {
        sku: `PRD-${Date.now().toString(36).toUpperCase()}`,
        nameAr: productQuick.nameAr,
        nameEn: productQuick.nameEn || productQuick.nameAr,
        categoryId: productQuick.categoryId,
        type: 'STANDARD',
        inventoryMode: 'RECIPE',
        pricingMethod: 'FIXED_PRICE',
        targetMarginPercent: '45',
        markupPercent: '0',
        sellingPrice: productQuick.sellingPrice || '0',
        sortOrder: 0,
        active: true,
      };
      return api<Product>('/products', { method: 'POST', body: JSON.stringify(body) });
    },
    onSuccess: async (created) => {
      await qc.invalidateQueries({ queryKey: ['products'] });
      setForm((prev) => ({ ...prev, productId: created.id }));
      setProductQuickOpen(false);
      setProductQuickError('');
    },
    onError: (err: Error) =>
      setProductQuickError(err instanceof ApiError ? err.messageAr : err.message),
  });

  const createIngredientQuick = useMutation({
    mutationFn: () => {
      const body = {
        sku: `ING-${Date.now().toString(36).toUpperCase()}`,
        nameAr: ingredientQuick.nameAr,
        nameEn: ingredientQuick.nameEn || ingredientQuick.nameAr,
        type: ingredientQuick.type,
        baseUnitId: ingredientQuick.baseUnitId,
        minimumStock: '0',
        reorderPoint: '0',
        targetStock: '0',
        costPerKg: ingredientQuick.costPerKg,
        active: true,
      };
      return api<Ingredient>('/ingredients', { method: 'POST', body: JSON.stringify(body) });
    },
    onSuccess: async (created) => {
      await qc.invalidateQueries({ queryKey: ['ingredients'] });
      await qc.invalidateQueries({ queryKey: ['inventory'] });
      if (ingredientTarget?.kind === 'output') {
        setForm((prev) => ({
          ...prev,
          outputIngredientId: created.id,
          outputUnitId: prev.outputUnitId || created.baseUnitId,
        }));
      } else if (ingredientTarget?.kind === 'item') {
        const index = ingredientTarget.index;
        setForm((prev) => ({
          ...prev,
          items: prev.items.map((item, i) =>
            i === index
              ? {
                  ...item,
                  ingredientId: created.id,
                  unitId: created.baseUnitId || item.unitId,
                  isPackaging: created.type === 'PACKAGING' ? true : item.isPackaging,
                }
              : item,
          ),
        }));
      }
      setIngredientQuickOpen(false);
      setIngredientTarget(null);
      setIngredientQuickError('');
    },
    onError: (err: Error) =>
      setIngredientQuickError(err instanceof ApiError ? err.messageAr : err.message),
  });

  function openCreate() {
    setEditingId(null);
    setKind('prepared');
    setForm({
      nameAr: '',
      nameEn: '',
      productId: '',
      outputIngredientId: '',
      outputQuantity: '1',
      outputUnitId: units.data?.[0]?.id ?? '',
      wasteAllowancePercent: '0',
      notes: '',
      active: true,
      items: [emptyItem()],
    });
    setError('');
    setOpen(true);
  }

  function openEdit(r: Recipe) {
    setEditingId(r.id);
    setKind(r.outputIngredientId && r.productId ? 'both' : r.outputIngredientId ? 'prepared' : 'product');
    setForm({
      nameAr: r.nameAr,
      nameEn: r.nameEn,
      productId: r.productId ?? '',
      outputIngredientId: r.outputIngredientId ?? '',
      outputQuantity: String(r.outputQuantity),
      outputUnitId: r.outputUnitId,
      wasteAllowancePercent: String(r.wasteAllowancePercent),
      notes: r.notes ?? '',
      active: r.active,
      items:
        r.items.length > 0
          ? r.items.map((i) => ({
              ingredientId: i.ingredientId,
              quantity: String(i.quantity),
              unitId: i.unitId,
              isPackaging: i.isPackaging,
            }))
          : [emptyItem()],
    });
    setError('');
    setOpen(true);
  }

  async function remove(r: Recipe) {
    if (!confirm(`حذف أو إيقاف الوصفة «${r.nameAr}»؟`)) {
      return;
    }
    await api(`/recipes/${r.id}`, { method: 'DELETE' });
    qc.invalidateQueries({ queryKey: ['recipes'] });
  }

  function setItem(index: number, patch: Partial<FormItem>) {
    setForm((prev) => ({
      ...prev,
      items: prev.items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    }));
  }

  function addItem() {
    setForm((prev) => ({ ...prev, items: [...prev.items, emptyItem()] }));
  }

  function removeItem(index: number) {
    setForm((prev) => ({
      ...prev,
      items: prev.items.length === 1 ? prev.items : prev.items.filter((_, i) => i !== index),
    }));
  }

  function onIngredientChange(index: number, ingredientId: string) {
    const ing = ingredients.data?.find((i) => i.id === ingredientId);
    setItem(index, { ingredientId, unitId: ing?.baseUnitId || form.items[index]?.unitId || '' });
  }

  function openProductQuick() {
    setProductQuick({
      ...emptyProductQuick,
      categoryId: (categories.data ?? []).find((c) => c.active !== false)?.id ?? '',
    });
    setProductQuickError('');
    setProductQuickOpen(true);
  }

  function openIngredientQuick(target: IngredientTarget) {
    const defaultType = target.kind === 'output' ? 'PREPARED' : 'RAW';
    setIngredientTarget(target);
    setIngredientQuick({
      ...emptyIngredientQuick,
      type: defaultType,
      baseUnitId: units.data?.[0]?.id ?? '',
    });
    setIngredientQuickError('');
    setIngredientQuickOpen(true);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    save.mutate();
  }

  const runPrep = useMutation({
    mutationFn: () =>
      api('/production/run', {
        method: 'POST',
        body: JSON.stringify({
          recipeId: prepRecipeId,
          plannedQuantity: prepQty,
          actualQuantity: prepQty,
          wasteQuantity: '0',
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['production'] });
      qc.invalidateQueries({ queryKey: ['production-ready'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['ingredients'] });
      qc.invalidateQueries({ queryKey: ['pos-catalog'] });
      qc.invalidateQueries({ queryKey: ['production-preview'] });
      qc.invalidateQueries({ queryKey: ['prepareable'] });
      setPrepError('');
    },
    onError: (err: Error) => setPrepError(err instanceof ApiError ? err.messageAr : err.message),
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="الوصفات والتحضير"
        actions={
          tab === 'recipes' ? (
            <Button type="button" onClick={openCreate}>
              إضافة وصفة
            </Button>
          ) : null
        }
      />
      <p className="text-sm text-stone-500">
        الوصفات التي تنتج مادة محضّرة (صلصة، عجينة…) تُحضَّر من تبويب التحضير. منتجات البيع (بيتزا…) تُباع مباشرة من نقطة البيع
        عند توفر المكوّنات دون تحضير مسبق.
      </p>
      <Tabs
        items={[
          { id: 'recipes', label: 'الوصفات' },
          { id: 'prep', label: 'التحضير' },
        ]}
        value={tab}
        onChange={(id) => setTab(id as 'recipes' | 'prep')}
      />

      {tab === 'recipes' ? (
        <>
      <Card>
        <Input placeholder="بحث عن وصفة أو منتج" value={search} onChange={(e) => setSearch(e.target.value)} />
      </Card>
      <DataTable
        headers={['الوصفة', 'الهدف', 'الكمية الناتجة', 'المكونات', 'الحالة', 'إجراءات']}
        empty={rows.length === 0}
      >
        {rows.map((r) => (
          <Tr key={r.id}>
            <Td>
              <div className="font-semibold">{r.nameAr}</div>
              <div className="text-xs text-stone-400">{r.nameEn}</div>
            </Td>
            <Td>
              {r.product?.nameAr && r.outputIngredient?.nameAr ? (
                <div className="space-y-1">
                  <Badge tone="ok">مادة: {r.outputIngredient.nameAr}</Badge>
                  <Badge tone="brand">تباع كـ {r.product.nameAr}</Badge>
                </div>
              ) : r.product?.nameAr ? (
                <Badge tone="brand">منتج: {r.product.nameAr}</Badge>
              ) : (
                <Badge tone="ok">مادة محضّرة: {r.outputIngredient?.nameAr ?? '—'}</Badge>
              )}
            </Td>
            <Td numeric>
              {r.outputQuantity} {r.outputUnit?.symbol ?? ''}
            </Td>
            <Td>
              <div className="max-w-xs text-xs leading-5 text-stone-600">
                {r.items.map((item, idx) => (
                  <div key={idx}>
                    {item.ingredient?.nameAr}: {item.quantity} {item.unit?.symbol}
                    {item.isPackaging ? ' (تغليف)' : ''}
                  </div>
                ))}
              </div>
            </Td>
            <Td>
              <Badge tone={r.active ? 'ok' : 'neutral'}>{r.active ? 'نشطة' : 'موقوفة'}</Badge>
            </Td>
            <Td>
              <div className="flex gap-2">
                <Button variant="ghost" type="button" onClick={() => openEdit(r)}>
                  تعديل
                </Button>
                <Button variant="danger" type="button" onClick={() => remove(r)}>
                  حذف
                </Button>
              </div>
            </Td>
          </Tr>
        ))}
      </DataTable>
        </>
      ) : (
        <div className="space-y-4">
          <Card>
            <h2 className="mb-2 text-base font-bold">مواد محضّرة جاهزة</h2>
            <p className="mb-3 text-sm text-stone-500">
              هنا فقط وصفات المواد المحضّرة. ناتجها يدخل مخزون المواد ويُستخدم في منتجات البيع عند الطلب.
            </p>
            {(ready.data?.preparedMaterials ?? []).length === 0 ? (
              <p className="text-sm text-stone-400">لا توجد مواد محضّرة في المخزون بعد</p>
            ) : (
              <ul className="grid gap-3 md:grid-cols-2">
                {(ready.data?.preparedMaterials ?? []).map((row) => (
                  <li key={row.ingredientId} className="rounded-xl border border-stone-200 p-3">
                    <div className="flex justify-between gap-2 font-medium">
                      <span>{row.nameAr}</span>
                      <span>
                        {row.quantity} {row.unit}
                      </span>
                    </div>
                    {row.productEstimates.length ? (
                      <ul className="mt-2 space-y-1 text-sm text-stone-600">
                        {row.productEstimates.map((est) => (
                          <li key={est.productId}>
                            يكفي لحوالي <strong>{est.servings}</strong> × {est.nameAr}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <h2 className="mb-2 text-base font-bold">تحضير مادة محضّرة</h2>
            <p className="mb-4 text-sm text-stone-500">
              مثال: صلصة بيتزا 1 كغ — يُخصم الطماطم والتوابل ويُضاف رصيد الصلصة. البيتزا نفسها لا تُحضَّر هنا؛ تُباع من نقطة البيع.
            </p>
            <form
              className="grid gap-3 md:grid-cols-3"
              onSubmit={(e) => {
                e.preventDefault();
                setPrepError('');
                runPrep.mutate();
              }}
            >
              <div className="md:col-span-2">
                <Label>الوصفة</Label>
                <Select value={prepRecipeId} onChange={(e) => setPrepRecipeId(e.target.value)} required>
                  <option value="">— اختر وصفة مادة محضّرة —</option>
                  {prepRecipes.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.nameAr}
                      {r.outputIngredient?.nameAr ? ` → ${r.outputIngredient.nameAr}` : ''}
                      {` (${r.outputQuantity} ${r.outputUnit?.symbol ?? ''})`}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>
                  الكمية الناتجة
                  {selectedPrepRecipe?.outputUnit?.symbol
                    ? ` (${selectedPrepRecipe.outputUnit.symbol})`
                    : ''}
                </Label>
                <Input value={prepQty} onChange={(e) => setPrepQty(e.target.value)} required min="0.0001" />
              </div>
              {prepError ? <p className="md:col-span-3 text-sm text-red-700">{prepError}</p> : null}
              <div className="md:col-span-3 flex justify-end">
                <Button type="submit" disabled={runPrep.isPending || !prepRecipeId}>
                  تنفيذ التحضير
                </Button>
              </div>
            </form>

            {prepPreview.data ? (
              <div className="mt-4 rounded-xl border border-stone-200 bg-cream p-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold">ما سيُخصم من المخزون</h3>
                  <span className="text-sm text-stone-600">
                    يمكن تحضير حتى <strong>{prepPreview.data.currentServingsPossible}</strong>{' '}
                    {prepPreview.data.recipe.outputUnit}
                    {prepPreview.data.limitingIngredient
                      ? ` · المحدود: ${prepPreview.data.limitingIngredient}`
                      : ''}
                  </span>
                </div>
                <ul className="space-y-1 text-sm">
                  {prepPreview.data.consumption.map((line) => (
                    <li
                      key={`${line.nameAr}-${line.unit}`}
                      className={line.sufficient ? 'text-stone-700' : 'font-medium text-red-700'}
                    >
                      {line.nameAr}: مطلوب {line.needed} {line.unit} · متوفر {line.available}{' '}
                      {line.sufficient ? '' : '— غير كافٍ'}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Card>
        </div>
      )}

      <Modal open={open} title={editingId ? 'تعديل الوصفة' : 'وصفة جديدة'} onClose={() => setOpen(false)} wide>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>اسم الوصفة بالعربي</Label>
              <Input value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} required />
            </div>
            <div>
              <Label>الاسم بالإنجليزي</Label>
              <Input value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} />
            </div>
            <div>
              <Label>نوع الوصفة</Label>
              <Select value={kind} onChange={(e) => setKind(e.target.value as 'product' | 'prepared' | 'both')}>
                <option value="prepared">مادة محضّرة (صلصة، عجينة…)</option>
                <option value="product">وصفة منتج للبيع</option>
                <option value="both">مادة محضّرة وتُباع أيضاً</option>
              </Select>
              <p className="mt-1 text-xs text-stone-500">
                للصلصة والعجينة: اختر «مادة محضّرة». منتج البيتزا يُربط لاحقاً من شاشة المنتجات بمكوّنات الوصفة.
              </p>
            </div>
            {kind !== 'prepared' ? (
              <div>
                <Label>{kind === 'both' ? 'المنتج الذي يُباع من ناتج هذه الوصفة' : 'المنتج'}</Label>
                <SearchSelect
                  value={form.productId}
                  onChange={(productId) => setForm({ ...form, productId })}
                  required
                  placeholder="ابحث واختر منتجاً…"
                  searchPlaceholder="بحث باسم المنتج…"
                  emptyLabel="لا يوجد منتج مطابق"
                  options={(products.data ?? [])
                    .filter((p) => p.active)
                    .map((p) => ({ value: p.id, label: p.nameAr }))}
                  footer={
                    <Button
                      type="button"
                      variant="ghost"
                      className="w-full"
                      onClick={() => {
                        openProductQuick();
                      }}
                    >
                      + إضافة منتج جديد
                    </Button>
                  }
                />
              </div>
            ) : null}
            {kind !== 'product' ? (
              <div>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <Label>المادة المحضّرة الناتجة</Label>
                  <Button type="button" variant="ghost" onClick={() => openIngredientQuick({ kind: 'output' })}>
                    + مادة جديدة
                  </Button>
                </div>
                <Select
                  value={form.outputIngredientId}
                  onChange={(e) => setForm({ ...form, outputIngredientId: e.target.value })}
                  required
                >
                  <option value="">—</option>
                  {prepared.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.nameAr}
                    </option>
                  ))}
                </Select>
              </div>
            ) : null}
            <div>
              <Label>كمية الناتج</Label>
              <Input value={form.outputQuantity} onChange={(e) => setForm({ ...form, outputQuantity: e.target.value })} />
            </div>
            <div>
              <Label>وحدة الناتج</Label>
              <Select value={form.outputUnitId} onChange={(e) => setForm({ ...form, outputUnitId: e.target.value })} required>
                <option value="">—</option>
                {(units.data ?? []).map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nameAr} ({u.symbol})
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>سماح الهدر %</Label>
              <Input
                value={form.wasteAllowancePercent}
                onChange={(e) => setForm({ ...form, wasteAllowancePercent: e.target.value })}
              />
            </div>
            <div>
              <Label>ملاحظات</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label>مكونات الوصفة</Label>
              <Button type="button" variant="ghost" onClick={addItem}>
                + إضافة سطر
              </Button>
            </div>
            <p className="mb-2 text-xs text-stone-500">
              يمكن خلط مادة أولية مع مادة ناتجة عن وصفة أخرى (عجينة، صوص، خلطة). إن لم تجد المادة في القائمة، أضفها من هنا مباشرة.
            </p>
            <div className="space-y-2">
              {form.items.map((item, index) => (
                <div key={index} className="grid gap-2 rounded-lg border border-stone-200 bg-cream p-3 md:grid-cols-12">
                  <div className="md:col-span-5">
                    <div className="mb-1 flex justify-end">
                      <Button type="button" variant="ghost" onClick={() => openIngredientQuick({ kind: 'item', index })}>
                        + مادة جديدة
                      </Button>
                    </div>
                    <Select
                      value={item.ingredientId}
                      onChange={(e) => onIngredientChange(index, e.target.value)}
                      required
                    >
                      <option value="">المادة</option>
                      {(ingredients.data ?? [])
                        .filter((i) => i.active)
                        .map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.nameAr}
                            {i.type === 'PREPARED' ? ' — ناتج وصفة' : i.type === 'RAW' ? ' — أولية' : ' — تغليف'}
                          </option>
                        ))}
                    </Select>
                  </div>
                  <div className="md:col-span-2">
                    <Input
                      placeholder="الكمية"
                      value={item.quantity}
                      onChange={(e) => setItem(index, { quantity: e.target.value })}
                      required
                    />
                  </div>
                  <div className="md:col-span-3">
                    <Select value={item.unitId} onChange={(e) => setItem(index, { unitId: e.target.value })} required>
                      <option value="">الوحدة</option>
                      {(units.data ?? []).map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.symbol}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="flex items-center gap-2 md:col-span-2">
                    <label className="flex items-center gap-1 text-xs">
                      <input
                        type="checkbox"
                        checked={item.isPackaging}
                        onChange={(e) => setItem(index, { isPackaging: e.target.checked })}
                      />
                      تغليف
                    </label>
                    <Button type="button" variant="danger" onClick={() => removeItem(index)}>
                      حذف
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
            />
            وصفة نشطة
          </label>
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              إلغاء
            </Button>
            <Button type="submit" disabled={save.isPending}>
              حفظ الوصفة
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={productQuickOpen}
        title="منتج جديد"
        onClose={() => setProductQuickOpen(false)}
        elevated
      >
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            createProductQuick.mutate();
          }}
        >
          <p className="text-xs text-stone-500">
            يُنشأ المنتج بطريقة المخزون «حسب الوصفة» ويُختار تلقائياً في الوصفة الحالية.
          </p>
          <div>
            <Label>اسم المنتج بالعربي</Label>
            <Input
              value={productQuick.nameAr}
              onChange={(e) => setProductQuick({ ...productQuick, nameAr: e.target.value })}
              required
            />
          </div>
          <div>
            <Label>الاسم بالإنجليزي</Label>
            <Input
              value={productQuick.nameEn}
              onChange={(e) => setProductQuick({ ...productQuick, nameEn: e.target.value })}
            />
          </div>
          <div>
            <Label>الصنف</Label>
            <Select
              value={productQuick.categoryId}
              onChange={(e) => setProductQuick({ ...productQuick, categoryId: e.target.value })}
              required
            >
              <option value="">—</option>
              {(categories.data ?? [])
                .filter((c) => c.active !== false)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nameAr}
                  </option>
                ))}
            </Select>
          </div>
          <div>
            <Label>سعر البيع</Label>
            <Input
              value={productQuick.sellingPrice}
              onChange={(e) => setProductQuick({ ...productQuick, sellingPrice: e.target.value })}
              required
            />
          </div>
          {productQuickError ? <p className="text-sm text-red-700">{productQuickError}</p> : null}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setProductQuickOpen(false)}>
              إلغاء
            </Button>
            <Button type="submit" disabled={createProductQuick.isPending}>
              حفظ واختيار
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={ingredientQuickOpen}
        title={ingredientTarget?.kind === 'output' ? 'مادة محضّرة جديدة' : 'مادة جديدة'}
        onClose={() => {
          setIngredientQuickOpen(false);
          setIngredientTarget(null);
        }}
        elevated
      >
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            createIngredientQuick.mutate();
          }}
        >
          <p className="text-xs text-stone-500">
            تُضاف المادة للمخزون بكمية صفر وتُختار تلقائياً في الوصفة. يمكن تعديل التفاصيل لاحقاً من شاشة المواد.
          </p>
          <div>
            <Label>اسم المادة بالعربي</Label>
            <Input
              value={ingredientQuick.nameAr}
              onChange={(e) => setIngredientQuick({ ...ingredientQuick, nameAr: e.target.value })}
              required
            />
          </div>
          <div>
            <Label>الاسم بالإنجليزي</Label>
            <Input
              value={ingredientQuick.nameEn}
              onChange={(e) => setIngredientQuick({ ...ingredientQuick, nameEn: e.target.value })}
            />
          </div>
          <div>
            <Label>النوع</Label>
            <Select
              value={ingredientQuick.type}
              onChange={(e) => setIngredientQuick({ ...ingredientQuick, type: e.target.value })}
              disabled={ingredientTarget?.kind === 'output'}
            >
              <option value="RAW">مادة أولية</option>
              <option value="PREPARED">مادة محضّرة</option>
              <option value="PACKAGING">تغليف</option>
            </Select>
          </div>
          <div>
            <Label>وحدة الأساس</Label>
            <Select
              value={ingredientQuick.baseUnitId}
              onChange={(e) => setIngredientQuick({ ...ingredientQuick, baseUnitId: e.target.value })}
              required
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
            <Label>{costIsPerPiece ? 'متوسط التكلفة للوحدة' : 'متوسط التكلفة للكيلوغرام'}</Label>
            <Input
              value={ingredientQuick.costPerKg}
              onChange={(e) => setIngredientQuick({ ...ingredientQuick, costPerKg: e.target.value })}
              required
              min="0.01"
              step="0.01"
              inputMode="decimal"
            />
          </div>
          {ingredientQuickError ? <p className="text-sm text-red-700">{ingredientQuickError}</p> : null}
          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setIngredientQuickOpen(false);
                setIngredientTarget(null);
              }}
            >
              إلغاء
            </Button>
            <Button type="submit" disabled={createIngredientQuick.isPending}>
              حفظ واختيار
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
