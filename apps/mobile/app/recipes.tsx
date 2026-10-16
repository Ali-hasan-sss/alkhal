import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { api, ApiError } from '@/src/api';
import { OwnerShell } from '@/src/shell';
import {
  Chip,
  confirmDelete,
  Field,
  FormModal,
  GhostButton,
  PrimaryButton,
  RowCard,
  SearchField,
  Tabs,
} from '@/src/ui';
import { colors } from '@/src/theme';
import { useToast } from '@/src/toast';

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
  outputUnit?: { symbol: string };
};

type Ingredient = { id: string; nameAr: string; type: string; baseUnitId: string; active: boolean };
type Product = { id: string; nameAr: string; active: boolean };
type Unit = { id: string; nameAr: string; symbol: string };
type Category = { id: string; nameAr: string; active?: boolean };
type FormItem = { ingredientId: string; quantity: string; unitId: string };

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

const emptyItem = (): FormItem => ({ ingredientId: '', quantity: '1', unitId: '' });

export default function RecipesScreen() {
  const toast = useToast();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<'recipes' | 'prep'>(params.tab === 'prep' ? 'prep' : 'recipes');

  const [rows, setRows] = useState<Recipe[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [kind, setKind] = useState<'product' | 'prepared'>('prepared');
  const [nameAr, setNameAr] = useState('');
  const [productId, setProductId] = useState('');
  const [outputIngredientId, setOutputIngredientId] = useState('');
  const [outputQuantity, setOutputQuantity] = useState('1');
  const [outputUnitId, setOutputUnitId] = useState('');
  const [items, setItems] = useState<FormItem[]>([emptyItem()]);
  const [pick, setPick] = useState<{ type: 'product' | 'output' | 'item'; index?: number } | null>(null);
  const [pickSearch, setPickSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const [productQuickOpen, setProductQuickOpen] = useState(false);
  const [productQuickName, setProductQuickName] = useState('');
  const [productQuickCategoryId, setProductQuickCategoryId] = useState('');
  const [productQuickPrice, setProductQuickPrice] = useState('0');
  const [productQuickSaving, setProductQuickSaving] = useState(false);

  const [ready, setReady] = useState<Ready | null>(null);
  const [prepRecipeId, setPrepRecipeId] = useState('');
  const [prepQty, setPrepQty] = useState('1');
  const [prepPreview, setPrepPreview] = useState<PrepPreview | null>(null);
  const [prepSaving, setPrepSaving] = useState(false);
  const [prepPick, setPrepPick] = useState(false);
  const [prepPickSearch, setPrepPickSearch] = useState('');

  const load = useCallback(async () => {
    const [recipeRows, productRows, ingredientRows, unitRows, categoryRows] = await Promise.all([
      api<Recipe[]>('/recipes'),
      api<Product[]>('/products'),
      api<Ingredient[]>('/ingredients'),
      api<Unit[]>('/units'),
      api<Category[]>('/categories'),
    ]);
    setRows(recipeRows);
    setProducts(productRows.filter((p) => p.active));
    setIngredients(ingredientRows);
    setUnits(unitRows);
    setCategories(categoryRows.filter((c) => c.active !== false));
  }, []);

  const loadReady = useCallback(async () => {
    setReady(await api<Ready>('/production/ready'));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load().catch(() => undefined);
      if (tab === 'prep') {
        loadReady().catch(() => undefined);
      }
    }, [load, loadReady, tab]),
  );

  const prepared = ingredients.filter((i) => i.type === 'PREPARED' && i.active);
  const activeIngredients = ingredients.filter((i) => i.active);
  const prepRecipes = useMemo(
    () => rows.filter((r) => r.active && r.outputIngredientId),
    [rows],
  );
  const selectedPrep = prepRecipes.find((r) => r.id === prepRecipeId);

  useEffect(() => {
    if (tab !== 'prep' || !prepRecipeId || !(Number(prepQty) > 0)) {
      setPrepPreview(null);
      return;
    }
    let active = true;
    api<PrepPreview>(
      `/production/preview?quantity=${encodeURIComponent(prepQty)}&recipeId=${prepRecipeId}`,
    )
      .then((row) => {
        if (active) {
          setPrepPreview(row);
        }
      })
      .catch(() => {
        if (active) {
          setPrepPreview(null);
        }
      });
    return () => {
      active = false;
    };
  }, [tab, prepRecipeId, prepQty]);

  function startCreate() {
    setEditingId(null);
    setKind('prepared');
    setNameAr('');
    setProductId('');
    setOutputIngredientId('');
    setOutputQuantity('1');
    setOutputUnitId(units[0]?.id ?? '');
    setItems([emptyItem()]);
    setOpen(true);
  }

  function startEdit(row: Recipe) {
    setEditingId(row.id);
    setKind(row.outputIngredientId ? 'prepared' : 'product');
    setNameAr(row.nameAr);
    setProductId(row.productId ?? '');
    setOutputIngredientId(row.outputIngredientId ?? '');
    setOutputQuantity(String(row.outputQuantity));
    setOutputUnitId(row.outputUnitId);
    setItems(
      row.items.length
        ? row.items.map((item) => ({
            ingredientId: item.ingredientId,
            quantity: String(item.quantity),
            unitId: item.unitId,
          }))
        : [emptyItem()],
    );
    setOpen(true);
  }

  function labelFor(id: string, list: Array<{ id: string; nameAr: string }>) {
    return list.find((row) => row.id === id)?.nameAr ?? 'اختيار';
  }

  async function save() {
    const cleanItems = items.filter((item) => item.ingredientId && item.unitId && Number(item.quantity) > 0);
    if (!nameAr.trim() || !outputUnitId || cleanItems.length < 1) {
      Alert.alert('أدخل الاسم والوحدة ومادة واحدة على الأقل');
      return;
    }
    if (kind === 'product' && !productId) {
      Alert.alert('اختر المنتج');
      return;
    }
    if (kind === 'prepared' && !outputIngredientId) {
      Alert.alert('اختر المادة المحضّرة');
      return;
    }
    setSaving(true);
    try {
      const body = {
        nameAr: nameAr.trim(),
        nameEn: nameAr.trim(),
        productId: kind === 'product' ? productId : null,
        outputIngredientId: kind === 'prepared' ? outputIngredientId : null,
        outputQuantity,
        outputUnitId,
        wasteAllowancePercent: '0',
        items: cleanItems.map((item) => ({
          ingredientId: item.ingredientId,
          quantity: item.quantity,
          unitId: item.unitId,
        })),
      };
      if (editingId) {
        await api(`/recipes/${editingId}`, { method: 'PATCH', body: JSON.stringify(body) });
      } else {
        await api('/recipes', { method: 'POST', body: JSON.stringify(body) });
      }
      setOpen(false);
      await load();
    } catch (err) {
      Alert.alert(err instanceof ApiError ? err.messageAr : 'تعذر الحفظ');
    } finally {
      setSaving(false);
    }
  }

  async function saveProductQuick() {
    if (!productQuickName.trim() || !productQuickCategoryId) {
      Alert.alert('أدخل اسم المنتج والصنف');
      return;
    }
    setProductQuickSaving(true);
    try {
      const created = await api<Product>('/products', {
        method: 'POST',
        body: JSON.stringify({
          sku: `PRD-${Date.now().toString(36).toUpperCase()}`,
          nameAr: productQuickName.trim(),
          nameEn: productQuickName.trim(),
          categoryId: productQuickCategoryId,
          type: 'STANDARD',
          inventoryMode: 'RECIPE',
          pricingMethod: 'FIXED_PRICE',
          targetMarginPercent: '45',
          markupPercent: '0',
          sellingPrice: productQuickPrice || '0',
          sortOrder: 0,
          active: true,
        }),
      });
      await load();
      setProductId(created.id);
      setProductQuickOpen(false);
      toast('تم إنشاء المنتج واختياره', 'success');
    } catch (err) {
      Alert.alert(err instanceof ApiError ? err.messageAr : 'تعذر إنشاء المنتج');
    } finally {
      setProductQuickSaving(false);
    }
  }

  async function runPrep() {
    if (!prepRecipeId) {
      toast('اختر وصفة مادة محضّرة');
      return;
    }
    if (!(Number(prepQty) > 0)) {
      toast('أدخل كمية أكبر من صفر');
      return;
    }
    const missing = prepPreview?.consumption.find((row) => !row.sufficient);
    if (missing) {
      toast(`المادة غير كافية: ${missing.nameAr}`);
      return;
    }
    setPrepSaving(true);
    try {
      await api('/production/run', {
        method: 'POST',
        body: JSON.stringify({
          recipeId: prepRecipeId,
          plannedQuantity: prepQty,
          actualQuantity: prepQty,
          wasteQuantity: '0',
        }),
      });
      toast('تم التحضير وخصم المواد', 'success');
      await Promise.all([load(), loadReady()]);
    } catch (err) {
      toast(err instanceof ApiError ? err.messageAr : 'تعذر التحضير');
    } finally {
      setPrepSaving(false);
    }
  }

  const visible = rows.filter(
    (row) =>
      !search.trim() ||
      row.nameAr.includes(search.trim()) ||
      (row.product?.nameAr ?? '').includes(search.trim()),
  );

  const pickList =
    pick?.type === 'product'
      ? products.filter((row) => !pickSearch.trim() || row.nameAr.includes(pickSearch.trim()))
      : pick?.type === 'output'
        ? prepared.filter((row) => !pickSearch.trim() || row.nameAr.includes(pickSearch.trim()))
        : activeIngredients.filter((row) => !pickSearch.trim() || row.nameAr.includes(pickSearch.trim()));

  const prepPickList = prepRecipes.filter(
    (row) => !prepPickSearch.trim() || row.nameAr.includes(prepPickSearch.trim()),
  );

  return (
    <OwnerShell
      title="الوصفات والتحضير"
      action={
        tab === 'recipes' ? <PrimaryButton title="إضافة" onPress={startCreate} /> : undefined
      }
    >
      <View style={styles.wrap}>
        <Text style={styles.hint}>
          المواد المحضّرة تُحضَّر هنا. منتجات البيع تُباع من نقطة البيع عند توفر المكوّنات دون تحضير مسبق.
        </Text>
        <Tabs
          items={[
            { id: 'recipes', label: 'الوصفات' },
            { id: 'prep', label: 'التحضير' },
          ]}
          value={tab}
          onChange={(id) => {
            const next = id as 'recipes' | 'prep';
            setTab(next);
            if (next === 'prep') {
              loadReady().catch(() => undefined);
            }
          }}
        />

        {tab === 'recipes' ? (
          <>
            <SearchField value={search} onChangeText={setSearch} />
            <ScrollView>
              {visible.map((row) => (
                <RowCard
                  key={row.id}
                  title={row.nameAr}
                  subtitle={`${row.product?.nameAr ?? row.outputIngredient?.nameAr ?? ''} · ${row.items.length} مواد${row.active ? '' : ' · موقوفة'}`}
                  onEdit={() => startEdit(row)}
                  onDelete={() =>
                    confirmDelete(row.nameAr, () =>
                      api(`/recipes/${row.id}`, { method: 'DELETE' })
                        .then(load)
                        .catch((err) => Alert.alert(err instanceof ApiError ? err.messageAr : 'تعذر الحذف')),
                    )
                  }
                />
              ))}
            </ScrollView>
          </>
        ) : (
          <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
            <Text style={styles.section}>مواد محضّرة جاهزة</Text>
            {(ready?.preparedMaterials ?? []).length === 0 ? (
              <Text style={styles.empty}>لا توجد مواد محضّرة في المخزون بعد</Text>
            ) : (
              (ready?.preparedMaterials ?? []).map((row) => (
                <View key={row.ingredientId} style={styles.card}>
                  <Text style={styles.cardTitle}>
                    {row.nameAr} · {row.quantity} {row.unit}
                  </Text>
                  {row.productEstimates.map((est) => (
                    <Text key={est.productId} style={styles.meta}>
                      يكفي لحوالي {est.servings} × {est.nameAr}
                    </Text>
                  ))}
                </View>
              ))
            )}

            <Text style={styles.section}>تحضير مادة محضّرة</Text>
            <Text style={styles.meta}>
              مثال: صلصة بيتزا 1 كغ. البيتزا نفسها تُباع من نقطة البيع ولا تُحضَّر هنا.
            </Text>
            <View style={{ height: 8 }} />
            <PrimaryButton
              title={
                selectedPrep
                  ? `${selectedPrep.nameAr}${selectedPrep.outputIngredient ? ` → ${selectedPrep.outputIngredient.nameAr}` : ''}`
                  : 'اختر الوصفة'
              }
              onPress={() => {
                setPrepPickSearch('');
                setPrepPick(true);
              }}
            />
            <View style={{ height: 10 }} />
            <Field
              label={`الكمية الناتجة${selectedPrep?.outputUnit?.symbol ? ` (${selectedPrep.outputUnit.symbol})` : ''}`}
              value={prepQty}
              onChangeText={setPrepQty}
              keyboardType="decimal-pad"
            />
            {prepPreview ? (
              <View style={styles.preview}>
                <Text style={styles.previewTitle}>
                  يمكن تحضير حتى {prepPreview.currentServingsPossible} {prepPreview.recipe.outputUnit}
                </Text>
                {prepPreview.limitingIngredient ? (
                  <Text style={styles.danger}>المحدود: {prepPreview.limitingIngredient}</Text>
                ) : null}
                {prepPreview.consumption.map((row) => (
                  <Text key={`${row.nameAr}-${row.unit}`} style={[styles.meta, !row.sufficient && styles.danger]}>
                    {row.nameAr}: مطلوب {row.needed} / متوفر {row.available} {row.unit}
                    {row.sufficient ? '' : ' — غير كافٍ'}
                  </Text>
                ))}
              </View>
            ) : null}
            <View style={{ height: 10 }} />
            <PrimaryButton
              title={prepSaving ? 'جاري التحضير…' : 'تنفيذ التحضير'}
              onPress={runPrep}
              disabled={prepSaving || !prepRecipeId}
            />
          </ScrollView>
        )}
      </View>

      <FormModal
        visible={open}
        title={editingId ? 'تعديل وصفة' : 'إضافة وصفة'}
        onClose={() => setOpen(false)}
        onSave={save}
        saving={saving}
      >
        <Field label="اسم الوصفة" value={nameAr} onChangeText={setNameAr} />
        <Text style={styles.label}>الناتج</Text>
        <View style={styles.chips}>
          <Chip label="منتج للبيع" selected={kind === 'product'} onPress={() => setKind('product')} />
          <Chip label="مادة محضّرة" selected={kind === 'prepared'} onPress={() => setKind('prepared')} />
        </View>
        {kind === 'product' ? (
          <GhostButton
            title={productId ? labelFor(productId, products) : 'اختر المنتج'}
            onPress={() => {
              setPickSearch('');
              setPick({ type: 'product' });
            }}
          />
        ) : (
          <GhostButton
            title={outputIngredientId ? labelFor(outputIngredientId, prepared) : 'اختر المادة المحضّرة'}
            onPress={() => {
              setPickSearch('');
              setPick({ type: 'output' });
            }}
          />
        )}
        <Field label="كمية الناتج" value={outputQuantity} onChangeText={setOutputQuantity} keyboardType="decimal-pad" />
        <Text style={styles.label}>وحدة الناتج</Text>
        <View style={styles.chips}>
          {units.map((unit) => (
            <Chip
              key={unit.id}
              label={unit.symbol}
              selected={outputUnitId === unit.id}
              onPress={() => setOutputUnitId(unit.id)}
            />
          ))}
        </View>
        <Text style={styles.label}>المواد</Text>
        {items.map((item, index) => (
          <View key={index} style={styles.itemCard}>
            <GhostButton
              title={item.ingredientId ? labelFor(item.ingredientId, activeIngredients) : 'اختر مادة'}
              onPress={() => {
                setPickSearch('');
                setPick({ type: 'item', index });
              }}
            />
            <Field
              label="الكمية"
              value={item.quantity}
              onChangeText={(value) =>
                setItems((prev) => prev.map((row, i) => (i === index ? { ...row, quantity: value } : row)))
              }
              keyboardType="decimal-pad"
            />
            <View style={styles.chips}>
              {units.map((unit) => (
                <Chip
                  key={unit.id}
                  label={unit.symbol}
                  selected={item.unitId === unit.id}
                  onPress={() =>
                    setItems((prev) => prev.map((row, i) => (i === index ? { ...row, unitId: unit.id } : row)))
                  }
                />
              ))}
            </View>
            {items.length > 1 ? (
              <GhostButton
                title="حذف السطر"
                danger
                onPress={() => setItems((prev) => prev.filter((_, i) => i !== index))}
              />
            ) : null}
          </View>
        ))}
        <PrimaryButton title="إضافة مادة" onPress={() => setItems((prev) => [...prev, emptyItem()])} />
      </FormModal>

      <FormModal visible={Boolean(pick)} title="اختيار" onClose={() => setPick(null)} hideSave>
        <SearchField value={pickSearch} onChangeText={setPickSearch} />
        {pick?.type === 'product' ? (
          <PrimaryButton
            title="+ منتج جديد"
            onPress={() => {
              setPick(null);
              setProductQuickName('');
              setProductQuickPrice('0');
              setProductQuickCategoryId(categories[0]?.id ?? '');
              setProductQuickOpen(true);
            }}
          />
        ) : null}
        <View style={{ height: 8 }} />
        {pickList.map((row) => (
          <Pressable
            key={row.id}
            style={styles.pickRow}
            onPress={() => {
              if (pick?.type === 'product') {
                setProductId(row.id);
              } else if (pick?.type === 'output') {
                setOutputIngredientId(row.id);
                const ing = ingredients.find((i) => i.id === row.id);
                if (ing) {
                  setOutputUnitId(ing.baseUnitId);
                }
              } else if (pick?.type === 'item' && pick.index != null) {
                const ing = ingredients.find((i) => i.id === row.id);
                setItems((prev) =>
                  prev.map((item, i) =>
                    i === pick.index
                      ? { ...item, ingredientId: row.id, unitId: ing?.baseUnitId ?? item.unitId }
                      : item,
                  ),
                );
              }
              setPick(null);
            }}
          >
            <Text style={styles.pickText}>{row.nameAr}</Text>
          </Pressable>
        ))}
      </FormModal>

      <FormModal
        visible={productQuickOpen}
        title="منتج جديد"
        onClose={() => setProductQuickOpen(false)}
        onSave={saveProductQuick}
        saving={productQuickSaving}
      >
        <Field label="اسم المنتج" value={productQuickName} onChangeText={setProductQuickName} />
        <Field
          label="سعر البيع"
          value={productQuickPrice}
          onChangeText={setProductQuickPrice}
          keyboardType="decimal-pad"
        />
        <Text style={styles.label}>الصنف</Text>
        <View style={styles.chips}>
          {categories.map((c) => (
            <Chip
              key={c.id}
              label={c.nameAr}
              selected={productQuickCategoryId === c.id}
              onPress={() => setProductQuickCategoryId(c.id)}
            />
          ))}
        </View>
      </FormModal>

      <FormModal visible={prepPick} title="اختر وصفة مادة محضّرة" onClose={() => setPrepPick(false)} hideSave>
        <SearchField value={prepPickSearch} onChangeText={setPrepPickSearch} />
        {prepPickList.map((row) => (
          <Pressable
            key={row.id}
            style={styles.pickRow}
            onPress={() => {
              setPrepRecipeId(row.id);
              setPrepPick(false);
            }}
          >
            <Text style={styles.pickText}>
              {row.nameAr}
              {row.outputIngredient?.nameAr ? ` → ${row.outputIngredient.nameAr}` : ''}
              {` (${row.outputQuantity} ${row.outputUnit?.symbol ?? ''})`}
            </Text>
          </Pressable>
        ))}
      </FormModal>
    </OwnerShell>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 12 },
  hint: { color: colors.muted, textAlign: 'right', marginBottom: 10, lineHeight: 20 },
  label: { fontWeight: '700', textAlign: 'right', marginVertical: 8, color: colors.ink },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  itemCard: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
    gap: 8,
  },
  pickRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: colors.line,
  },
  pickText: { textAlign: 'right', color: colors.ink, fontWeight: '700' },
  section: { fontWeight: '800', color: colors.burgundy, textAlign: 'right', marginVertical: 8 },
  empty: { color: colors.muted, textAlign: 'right', marginBottom: 8 },
  card: {
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
    marginBottom: 8,
  },
  cardTitle: { fontWeight: '800', color: colors.ink, textAlign: 'right' },
  meta: { color: colors.muted, textAlign: 'right', marginTop: 4, lineHeight: 20 },
  danger: { color: colors.danger, fontWeight: '700', textAlign: 'right', marginTop: 4 },
  preview: {
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
    marginTop: 4,
  },
  previewTitle: { color: colors.burgundy, fontWeight: '800', textAlign: 'right', marginBottom: 6 },
});
