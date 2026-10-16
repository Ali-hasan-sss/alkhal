import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
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

type BalanceRow = {
  ingredientId: string;
  quantity: string;
  ingredient: {
    id: string;
    nameAr: string;
    sku: string;
    active: boolean;
    type: string;
    baseUnit: { id: string; symbol: string };
  };
};

type Ingredient = {
  id: string;
  sku: string;
  nameAr: string;
  type: string;
  active: boolean;
  costPerKg: string;
  baseUnitId: string;
  baseUnit: { symbol: string };
  inventoryBalance?: { quantity: string };
};

type Unit = { id: string; nameAr: string; symbol: string };

const TYPES = [
  { id: 'RAW', label: 'خام' },
  { id: 'PREPARED', label: 'محضّر' },
  { id: 'PACKAGING', label: 'تغليف' },
] as const;

export default function InventoryScreen() {
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<'stock' | 'materials'>(params.tab === 'materials' ? 'materials' : 'stock');
  const [balances, setBalances] = useState<BalanceRow[]>([]);
  const [materials, setMaterials] = useState<Ingredient[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [search, setSearch] = useState('');

  const [current, setCurrent] = useState<BalanceRow | null>(null);
  const [mode, setMode] = useState<'receive' | 'adjust' | null>(null);
  const [qty, setQty] = useState('');
  const [notes, setNotes] = useState('');
  const [stockSaving, setStockSaving] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [nameAr, setNameAr] = useState('');
  const [sku, setSku] = useState('');
  const [costPerKg, setCostPerKg] = useState('');
  const [type, setType] = useState<(typeof TYPES)[number]['id']>('RAW');
  const [baseUnitId, setBaseUnitId] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [balanceRows, materialRows, unitRows] = await Promise.all([
      api<BalanceRow[]>('/inventory'),
      api<Ingredient[]>('/ingredients'),
      api<Unit[]>('/units'),
    ]);
    setBalances(balanceRows);
    setMaterials(materialRows);
    setUnits(unitRows);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load().catch(() => undefined);
    }, [load]),
  );

  function startReceive(row: BalanceRow) {
    setCurrent(row);
    setMode('receive');
    setQty('');
    setNotes('إضافة كمية للمخزون');
  }

  function startAdjust(row: BalanceRow) {
    setCurrent(row);
    setMode('adjust');
    setQty('0');
    setNotes('تعديل من تطبيق الموبايل');
  }

  function startCreate() {
    setEditingId(null);
    setNameAr('');
    setSku(`ING-${Date.now().toString(36).toUpperCase()}`);
    setCostPerKg('');
    setType('RAW');
    setBaseUnitId(units[0]?.id ?? '');
    setFormOpen(true);
  }

  function startEditMaterial(row: Ingredient) {
    setEditingId(row.id);
    setNameAr(row.nameAr);
    setSku(row.sku);
    setCostPerKg(row.costPerKg ?? '');
    setType((TYPES.find((t) => t.id === row.type)?.id ?? 'RAW') as (typeof TYPES)[number]['id']);
    setBaseUnitId(row.baseUnitId);
    setFormOpen(true);
  }

  async function saveStock() {
    if (!current || !mode) {
      return;
    }
    if (mode === 'receive' && !(Number(qty) > 0)) {
      Alert.alert('أدخل كمية أكبر من صفر');
      return;
    }
    if (mode === 'adjust' && !notes.trim()) {
      Alert.alert('سبب التعديل مطلوب');
      return;
    }
    setStockSaving(true);
    try {
      if (mode === 'receive') {
        await api('/inventory/receive', {
          method: 'POST',
          body: JSON.stringify({
            ingredientId: current.ingredientId,
            quantity: qty,
            notes: notes.trim() || 'إضافة كمية للمخزون',
          }),
        });
      } else {
        await api('/inventory/adjust', {
          method: 'POST',
          body: JSON.stringify({
            ingredientId: current.ingredientId,
            quantity: qty,
            notes: notes.trim(),
          }),
        });
      }
      setMode(null);
      await load();
    } catch (err) {
      Alert.alert(err instanceof ApiError ? err.messageAr : 'تعذر الحفظ');
    } finally {
      setStockSaving(false);
    }
  }

  async function saveMaterial() {
    if (!nameAr.trim() || !baseUnitId || !(Number(costPerKg) > 0)) {
      Alert.alert('أكمل الاسم والوحدة والتكلفة');
      return;
    }
    setSaving(true);
    try {
      const body = {
        sku,
        nameAr: nameAr.trim(),
        nameEn: nameAr.trim(),
        type,
        baseUnitId,
        costPerKg,
      };
      if (editingId) {
        await api(`/ingredients/${editingId}`, { method: 'PATCH', body: JSON.stringify(body) });
      } else {
        await api('/ingredients', { method: 'POST', body: JSON.stringify(body) });
      }
      setFormOpen(false);
      await load();
    } catch (err) {
      Alert.alert(err instanceof ApiError ? err.messageAr : 'تعذر الحفظ');
    } finally {
      setSaving(false);
    }
  }

  const stockVisible = balances.filter(
    (row) =>
      !search.trim() ||
      row.ingredient.nameAr.includes(search.trim()) ||
      row.ingredient.sku.includes(search.trim()),
  );
  const materialsVisible = materials.filter(
    (row) => !search.trim() || row.nameAr.includes(search.trim()) || row.sku.includes(search.trim()),
  );

  return (
    <OwnerShell
      title="المواد والمخزون"
      action={<PrimaryButton title="مادة" onPress={startCreate} />}
    >
      <View style={styles.wrap}>
        <Text style={styles.hint}>
          عرّف المواد مع سعرها، ثم أضف الكميات. المواد المحضّرة تظهر بعد التحضير من صفحة الوصفات.
        </Text>
        <Tabs
          items={[
            { id: 'stock', label: 'الأرصدة' },
            { id: 'materials', label: 'تعريف المواد' },
          ]}
          value={tab}
          onChange={(id) => setTab(id as 'stock' | 'materials')}
        />
        <SearchField value={search} onChangeText={setSearch} />
        <ScrollView>
          {tab === 'stock'
            ? stockVisible.map((row) => (
                <RowCard
                  key={row.ingredientId}
                  title={row.ingredient.nameAr}
                  subtitle={`${row.ingredient.sku} · الرصيد ${row.quantity} ${row.ingredient.baseUnit.symbol}${row.ingredient.active ? '' : ' · موقوف'}`}
                  extra={
                    <>
                      <GhostButton title="استلام" onPress={() => startReceive(row)} />
                      <GhostButton title="تصحيح" onPress={() => startAdjust(row)} />
                    </>
                  }
                />
              ))
            : materialsVisible.map((row) => (
                <RowCard
                  key={row.id}
                  title={row.nameAr}
                  subtitle={`${row.sku} · مخزون ${row.inventoryBalance?.quantity ?? '0'} ${row.baseUnit.symbol}${row.active ? '' : ' · موقوف'}`}
                  onEdit={() => startEditMaterial(row)}
                  onDelete={() =>
                    confirmDelete(row.nameAr, () =>
                      api(`/ingredients/${row.id}`, { method: 'DELETE' })
                        .then(load)
                        .catch((err) => Alert.alert(err instanceof ApiError ? err.messageAr : 'تعذر الحذف')),
                    )
                  }
                />
              ))}
        </ScrollView>
      </View>

      <FormModal
        visible={mode !== null}
        title={
          mode === 'receive'
            ? `استلام — ${current?.ingredient.nameAr ?? ''}`
            : `تصحيح — ${current?.ingredient.nameAr ?? ''}`
        }
        onClose={() => setMode(null)}
        onSave={saveStock}
        saving={stockSaving}
      >
        <Field
          label={mode === 'receive' ? 'الكمية المضافة' : 'كمية التعديل (+ أو −)'}
          value={qty}
          onChangeText={setQty}
          keyboardType="decimal-pad"
        />
        <Field label="ملاحظة" value={notes} onChangeText={setNotes} />
      </FormModal>

      <FormModal
        visible={formOpen}
        title={editingId ? 'تعديل مادة' : 'إضافة مادة'}
        onClose={() => setFormOpen(false)}
        onSave={saveMaterial}
        saving={saving}
      >
        <Field label="الاسم" value={nameAr} onChangeText={setNameAr} />
        <Field label="الرمز" value={sku} onChangeText={setSku} />
        <Field
          label="التكلفة / كغ أو قطعة"
          value={costPerKg}
          onChangeText={setCostPerKg}
          keyboardType="decimal-pad"
        />
        <Text style={styles.label}>النوع</Text>
        <View style={styles.chips}>
          {TYPES.map((row) => (
            <Chip key={row.id} label={row.label} selected={type === row.id} onPress={() => setType(row.id)} />
          ))}
        </View>
        <Text style={styles.label}>الوحدة</Text>
        <View style={styles.chips}>
          {units.map((unit) => (
            <Chip
              key={unit.id}
              label={`${unit.nameAr} (${unit.symbol})`}
              selected={baseUnitId === unit.id}
              onPress={() => setBaseUnitId(unit.id)}
            />
          ))}
        </View>
      </FormModal>
    </OwnerShell>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 12 },
  hint: { color: colors.muted, textAlign: 'right', marginBottom: 10, lineHeight: 20 },
  label: { fontWeight: '700', textAlign: 'right', marginBottom: 8, color: colors.ink },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
});
