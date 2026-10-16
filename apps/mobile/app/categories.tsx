import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { api, ApiError } from '@/src/api';
import { OwnerShell } from '@/src/shell';
import { confirmDelete, Field, FormModal, PrimaryButton, RowCard, SearchField } from '@/src/ui';

type Category = { id: string; code: string; nameAr: string; nameEn: string; sortOrder: number; active: boolean };

export default function CategoriesScreen() {
  const [rows, setRows] = useState<Category[]>([]);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [nameAr, setNameAr] = useState('');
  const [code, setCode] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setRows(await api<Category[]>('/categories'));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load().catch(() => undefined);
    }, [load]),
  );

  function startCreate() {
    setEditingId(null);
    setNameAr('');
    setCode(`cat-${Date.now().toString(36)}`);
    setOpen(true);
  }

  function startEdit(row: Category) {
    setEditingId(row.id);
    setNameAr(row.nameAr);
    setCode(row.code);
    setOpen(true);
  }

  async function save() {
    if (!nameAr.trim()) {
      Alert.alert('الاسم مطلوب');
      return;
    }
    setSaving(true);
    try {
      const body = { code, nameAr: nameAr.trim(), nameEn: nameAr.trim() };
      if (editingId) {
        await api(`/categories/${editingId}`, { method: 'PATCH', body: JSON.stringify(body) });
      } else {
        await api('/categories', { method: 'POST', body: JSON.stringify(body) });
      }
      setOpen(false);
      await load();
    } catch (err) {
      Alert.alert(err instanceof ApiError ? err.messageAr : 'تعذر الحفظ');
    } finally {
      setSaving(false);
    }
  }

  const visible = rows.filter((row) => !search.trim() || row.nameAr.includes(search.trim()));

  return (
    <OwnerShell title="الأصناف" action={<PrimaryButton title="إضافة" onPress={startCreate} />}>
      <View style={styles.wrap}>
        <SearchField value={search} onChangeText={setSearch} />
        <ScrollView>
          {visible.map((row) => (
            <RowCard
              key={row.id}
              title={row.nameAr}
              subtitle={row.active ? row.code : `${row.code} · موقوف`}
              onEdit={() => startEdit(row)}
              onDelete={() =>
                confirmDelete(row.nameAr, () =>
                  api(`/categories/${row.id}`, { method: 'DELETE' })
                    .then(load)
                    .catch((err) => Alert.alert(err instanceof ApiError ? err.messageAr : 'تعذر الحذف')),
                )
              }
            />
          ))}
        </ScrollView>
      </View>
      <FormModal visible={open} title={editingId ? 'تعديل صنف' : 'إضافة صنف'} onClose={() => setOpen(false)} onSave={save} saving={saving}>
        <Field label="الاسم" value={nameAr} onChangeText={setNameAr} />
        <Field label="الرمز" value={code} onChangeText={setCode} />
      </FormModal>
    </OwnerShell>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 12 },
});
