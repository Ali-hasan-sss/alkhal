import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { api, ApiError } from '@/src/api';
import { useAuth } from '@/src/auth';
import { money } from '@/src/money';
import { OwnerShell } from '@/src/shell';
import { Chip, Field, FormModal, GhostButton, RowCard, SearchField } from '@/src/ui';
import { colors } from '@/src/theme';

type Product = {
  id: string;
  sku: string;
  nameAr: string;
  sellingPrice: string;
  pricingMethod: string;
  targetMarginPercent: string;
  markupPercent: string;
  active: boolean;
  category?: { nameAr: string };
};

type CostRow = {
  id: string;
  cost: string;
  materialCost: string;
  packagingCost: string;
  overheadPerUnit: string;
  fullCost: string;
  sellingPrice: string;
  suggestedPrice: string;
  recommendedPrice: string;
  operatingProfit: string;
  targetMarginPercent: string;
  markupPercent: string;
  pricingMethod: string;
};

type OverheadInfo = { from: string; to: string; method: string; totalOverhead: string };
type CostsResponse = { overhead?: OverheadInfo; products: CostRow[] } | CostRow[];

const METHODS = [
  { id: 'FIXED_PRICE', label: 'سعر ثابت' },
  { id: 'MARKUP_PERCENT', label: 'إضافة على التكلفة' },
  { id: 'GROSS_MARGIN_PERCENT', label: 'هامش ربح' },
] as const;

function costRows(data: CostsResponse | null | undefined): CostRow[] {
  if (!data) {
    return [];
  }
  return Array.isArray(data) ? data : data.products;
}

function overheadFrom(data: CostsResponse | null | undefined): OverheadInfo | null {
  if (!data || Array.isArray(data)) {
    return null;
  }
  return data.overhead ?? null;
}

function priceFromMethod(fullCost: string, method: string, marginPercent: string, markupPercent: string): string {
  const cost = Number(fullCost);
  if (!(cost > 0)) {
    return '0';
  }
  if (method === 'MARKUP_PERCENT') {
    return (cost * (1 + Number(markupPercent || 0) / 100)).toFixed(2);
  }
  const margin = Number(marginPercent || 40) / 100;
  if (margin >= 1 || margin < 0) {
    return cost.toFixed(2);
  }
  return (cost / (1 - margin)).toFixed(2);
}

export default function ProductsScreen() {
  const { user } = useAuth();
  const symbol = user?.restaurant.currencySymbol || 'ل.س';
  const [rows, setRows] = useState<Product[]>([]);
  const [costs, setCosts] = useState<CostRow[]>([]);
  const [overhead, setOverhead] = useState<OverheadInfo | null>(null);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<Product | null>(null);
  const [sellingPrice, setSellingPrice] = useState('');
  const [pricingMethod, setPricingMethod] = useState<(typeof METHODS)[number]['id']>('FIXED_PRICE');
  const [targetMarginPercent, setTargetMarginPercent] = useState('40');
  const [markupPercent, setMarkupPercent] = useState('50');
  const [saving, setSaving] = useState(false);

  const [prepareable, setPrepareable] = useState<
    Record<string, { prepareable: string; limitingIngredient: string | null }>
  >({});

  const load = useCallback(async () => {
    const [list, costData, prepareableData] = await Promise.all([
      api<Product[]>('/products'),
      api<CostsResponse>('/reports/product-costs'),
      api<Record<string, { prepareable: string; limitingIngredient: string | null }>>(
        '/production/prepareable',
      ).catch(() => ({})),
    ]);
    setRows(list);
    setCosts(costRows(costData));
    setOverhead(overheadFrom(costData));
    setPrepareable(prepareableData);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load().catch(() => undefined);
    }, [load]),
  );

  const costMap = Object.fromEntries(costs.map((row) => [row.id, row]));

  function startEdit(row: Product) {
    const cost = costMap[row.id];
    setCurrent(row);
    setSellingPrice(String(row.sellingPrice));
    setPricingMethod((METHODS.find((m) => m.id === row.pricingMethod)?.id ?? 'FIXED_PRICE') as (typeof METHODS)[number]['id']);
    setTargetMarginPercent(cost?.targetMarginPercent || row.targetMarginPercent || '40');
    setMarkupPercent(cost?.markupPercent || row.markupPercent || '50');
    setOpen(true);
  }

  async function save() {
    if (!current) {
      return;
    }
    if (!(Number(sellingPrice) > 0)) {
      Alert.alert('أدخل سعر بيع أكبر من صفر');
      return;
    }
    setSaving(true);
    try {
      await api(`/products/${current.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          sellingPrice,
          pricingMethod,
          targetMarginPercent,
          markupPercent,
        }),
      });
      setOpen(false);
      await load();
    } catch (err) {
      Alert.alert(err instanceof ApiError ? err.messageAr : 'تعذر حفظ السعر');
    } finally {
      setSaving(false);
    }
  }

  const visible = rows.filter(
    (row) => !search.trim() || row.nameAr.includes(search.trim()) || row.sku.includes(search.trim()),
  );
  const cost = current ? costMap[current.id] : undefined;

  return (
    <OwnerShell title="المنتجات">
      <View style={styles.wrap}>
        <Text style={styles.hint}>
          «متاح للبيع» حسب مكوّنات الوصفة في المخزون — يُباع من نقطة البيع دون تحضير مسبق. سعر البيع يضعه المدير؛ التكلفة
          والسعر المقترح يظهران تلقائياً.
        </Text>
        {overhead && Number(overhead.totalOverhead) <= 0 ? (
          <Text style={styles.warn}>
            لا توجد مصروفات تشغيل في آخر 30 يوماً، لذلك حصة التشغيل حالياً صفر. سجّل الإيجار والكهرباء والأجور من شاشة المصروفات في الويب حتى يدخل الربح التشغيلي في السعر.
          </Text>
        ) : null}
        <SearchField value={search} onChangeText={setSearch} />
        <ScrollView>
          {visible.map((row) => {
            const rowCost = costMap[row.id];
            const avail = prepareable[row.id];
            const availText = avail
              ? ` · متاح ${avail.prepareable}${avail.limitingIngredient ? ` (ينقص: ${avail.limitingIngredient})` : ''}`
              : '';
            return (
              <RowCard
                key={row.id}
                title={row.nameAr}
                subtitle={`${row.category?.nameAr ?? ''} · البيع ${money(row.sellingPrice, symbol)}${rowCost ? ` · تكلفة ${money(rowCost.fullCost ?? rowCost.cost, symbol)} · مقترح ${money(rowCost.recommendedPrice, symbol)}` : ''}${availText}${row.active ? '' : ' · موقوف'}`}
                extra={<GhostButton title="السعر" onPress={() => startEdit(row)} />}
              />
            );
          })}
        </ScrollView>
      </View>
      <FormModal
        visible={open}
        title={current ? `سعر — ${current.nameAr}` : 'تعديل السعر'}
        onClose={() => setOpen(false)}
        onSave={save}
        saving={saving}
      >
        {cost ? (
          <View style={styles.box}>
            <Text style={styles.boxTitle}>حساب التكلفة (آخر 30 يوماً)</Text>
            <Text style={styles.boxLine}>مواد: {money(cost.materialCost, symbol)}</Text>
            <Text style={styles.boxLine}>تغليف: {money(cost.packagingCost, symbol)}</Text>
            <Text style={styles.boxLine}>حصة التشغيل: {money(cost.overheadPerUnit, symbol)}</Text>
            <Text style={styles.boxStrong}>التكلفة الكاملة: {money(cost.fullCost, symbol)}</Text>
            <Text style={styles.boxStrong}>
              السعر حسب الطريقة: {money(priceFromMethod(cost.fullCost, pricingMethod, targetMarginPercent, markupPercent), symbol)}
            </Text>
            <Text style={styles.boxStrong}>السعر المقترح بهامش الربح: {money(cost.recommendedPrice, symbol)}</Text>
            <Text style={styles.boxLine}>ربح التشغيل بالسعر الحالي: {money(cost.operatingProfit, symbol)}</Text>
            <GhostButton
              title="وضع السعر المحسوب في سعر البيع"
              onPress={() => {
                setSellingPrice(priceFromMethod(cost.fullCost, pricingMethod, targetMarginPercent, markupPercent));
              }}
            />
            <GhostButton
              title="اعتماد السعر المقترح"
              onPress={() => {
                setSellingPrice(cost.recommendedPrice);
                setPricingMethod('FIXED_PRICE');
              }}
            />
          </View>
        ) : null}
        <Text style={styles.hint}>طريقة التسعير</Text>
        <View style={styles.chips}>
          {METHODS.map((row) => (
            <Chip
              key={row.id}
              label={row.label}
              selected={pricingMethod === row.id}
              onPress={() => setPricingMethod(row.id)}
            />
          ))}
        </View>
        <Field label="سعر البيع" value={sellingPrice} onChangeText={setSellingPrice} keyboardType="decimal-pad" />
        {pricingMethod === 'GROSS_MARGIN_PERCENT' ? (
          <Field
            label="هامش الربح المستهدف %"
            value={targetMarginPercent}
            onChangeText={setTargetMarginPercent}
            keyboardType="decimal-pad"
          />
        ) : null}
        {pricingMethod === 'MARKUP_PERCENT' ? (
          <Field
            label="نسبة الإضافة على التكلفة %"
            value={markupPercent}
            onChangeText={setMarkupPercent}
            keyboardType="decimal-pad"
          />
        ) : null}
      </FormModal>
    </OwnerShell>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 12 },
  hint: { color: colors.muted, textAlign: 'right', marginBottom: 10 },
  warn: { color: colors.burgundy, textAlign: 'right', marginBottom: 10, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  box: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    gap: 6,
  },
  boxTitle: { fontWeight: '800', color: colors.burgundy, textAlign: 'right', marginBottom: 4 },
  boxLine: { color: colors.ink, textAlign: 'right' },
  boxStrong: { color: colors.burgundy, fontWeight: '800', textAlign: 'right' },
});
