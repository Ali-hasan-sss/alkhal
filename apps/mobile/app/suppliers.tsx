import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { api, ApiError } from '@/src/api';
import { useAuth } from '@/src/auth';
import { money } from '@/src/money';
import { OwnerShell } from '@/src/shell';
import { confirmDelete, Field, FormModal, PrimaryButton, RowCard, SearchField } from '@/src/ui';

type Supplier = {
  id: string;
  nameAr: string;
  phone?: string | null;
  active: boolean;
  balance: string;
};

export default function SuppliersScreen() {
  const { user } = useAuth();
  const symbol = user?.restaurant.currencySymbol || 'ل.س';
  const [rows, setRows] = useState<Supplier[]>([]);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [nameAr, setNameAr] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setRows(await api<Supplier[]>('/suppliers'));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load().catch(() => undefined);
    }, [load]),
  );

  function startCreate() {
    setEditingId(null);
    setNameAr('');
    setPhone('');
    setOpen(true);
  }

  function startEdit(row: Supplier) {
    setEditingId(row.id);
    setNameAr(row.nameAr);
    setPhone(row.phone ?? '');
    setOpen(true);
  }

  async function save() {
    if (!nameAr.trim()) {
      Alert.alert('الاسم مطلوب');
      return;
    }
    setSaving(true);
    try {
      const body = { nameAr: nameAr.trim(), nameEn: nameAr.trim(), phone: phone.trim() || undefined };
      if (editingId) {
        await api(`/suppliers/${editingId}`, { method: 'PATCH', body: JSON.stringify(body) });
      } else {
        await api('/suppliers', { method: 'POST', body: JSON.stringify(body) });
      }
      setOpen(false);
      await load();
    } catch (err) {
      Alert.alert(err instanceof ApiError ? err.messageAr : 'تعذر الحفظ');
    } finally {
      setSaving(false);
    }
  }

  const visible = rows.filter(
    (row) => !search.trim() || row.nameAr.includes(search.trim()) || (row.phone ?? '').includes(search.trim()),
  );

  return (
    <OwnerShell title="الموردون" action={<PrimaryButton title="إضافة" onPress={startCreate} />}>
      <View style={styles.wrap}>
        <SearchField value={search} onChangeText={setSearch} />
        <ScrollView>
          {visible.map((row) => (
            <RowCard
              key={row.id}
              title={row.nameAr}
              subtitle={`${row.phone || 'بدون هاتف'} · رصيد ${money(row.balance, symbol)}${row.active ? '' : ' · موقوف'}`}
              onEdit={() => startEdit(row)}
              onDelete={() =>
                confirmDelete(row.nameAr, () =>
                  api(`/suppliers/${row.id}`, { method: 'DELETE' })
                    .then(load)
                    .catch((err) => Alert.alert(err instanceof ApiError ? err.messageAr : 'تعذر الحذف')),
                )
              }
            />
          ))}
        </ScrollView>
      </View>
      <FormModal
        visible={open}
        title={editingId ? 'تعديل مورد' : 'إضافة مورد'}
        onClose={() => setOpen(false)}
        onSave={save}
        saving={saving}
      >
        <Field label="الاسم" value={nameAr} onChangeText={setNameAr} />
        <Field label="الهاتف" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      </FormModal>
    </OwnerShell>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 12 },
});
