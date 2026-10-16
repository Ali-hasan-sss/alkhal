import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { api, ApiError } from '@/src/api';
import { useAuth } from '@/src/auth';
import { money } from '@/src/money';
import { OwnerShell } from '@/src/shell';
import { Chip, FormModal, GhostButton, SearchField } from '@/src/ui';
import { colors } from '@/src/theme';
import { useToast } from '@/src/toast';

type SaleRow = {
  id: string;
  receiptNumber: string;
  status: string;
  customerName: string | null;
  notes: string | null;
  total: string;
  createdAt: string;
  completedAt: string | null;
  user: { id: string; nameAr: string };
  payments: Array<{ method: string; amount: string }>;
  items: Array<{ nameAr: string; quantity: string; lineTotal: string }>;
};

type Cashier = { id: string; nameAr: string; role: { nameAr: string } };
type DrawerRow = {
  cashierUserId: string;
  cashierNameAr: string;
  roleNameAr: string;
  cashDue: string;
  saleCount: number;
  currencySymbol: string;
};

const STATUS_LABEL: Record<string, string> = {
  COMPLETED: 'مكتمل',
  HELD: 'معلّق',
  CANCELLED: 'ملغى',
  REFUNDED: 'مسترجع',
  PARTIALLY_REFUNDED: 'مسترجع جزئياً',
  DRAFT: 'مسودة',
};

function payLabel(method: string) {
  if (method === 'CASH') {
    return 'نقد';
  }
  if (method === 'DEBT') {
    return 'دين';
  }
  if (method === 'CARD') {
    return 'بطاقة';
  }
  return method;
}

function formatWhen(iso?: string | null) {
  if (!iso) {
    return '';
  }
  return new Date(iso).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' });
}

export default function SalesScreen() {
  const toast = useToast();
  const { user } = useAuth();
  const symbol = user?.restaurant.currencySymbol || 'ل.س';
  const [rows, setRows] = useState<SaleRow[]>([]);
  const [cashiers, setCashiers] = useState<Cashier[]>([]);
  const [drawers, setDrawers] = useState<DrawerRow[]>([]);
  const [status, setStatus] = useState<'ALL' | 'COMPLETED' | 'HELD'>('ALL');
  const [cashierId, setCashierId] = useState('all');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<SaleRow | null>(null);
  const [collecting, setCollecting] = useState<string | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (status !== 'ALL') {
      params.set('status', status);
    }
    if (cashierId !== 'all') {
      params.set('userId', cashierId);
    }
    const query = params.toString();
    const [saleRows, cashierRows] = await Promise.all([
      api<SaleRow[]>(query ? `/sales?${query}` : '/sales'),
      api<Cashier[]>('/sales/cashiers'),
    ]);
    setRows(saleRows);
    setCashiers(cashierRows);
    try {
      setDrawers(await api<DrawerRow[]>('/pos/drawers'));
    } catch {
      setDrawers([]);
    }
  }, [status, cashierId]);

  useFocusEffect(
    useCallback(() => {
      load().catch((err) => toast(err instanceof ApiError ? err.messageAr : 'تعذر تحميل المبيعات'));
    }, [load, toast]),
  );

  function collect(row: DrawerRow) {
    if (!(Number(row.cashDue) > 0)) {
      toast('لا يوجد مبلغ صندوق لاستلامه');
      return;
    }
    Alert.alert(
      'استلام الصندوق',
      `استلام ${money(row.cashDue, row.currencySymbol || symbol)} من ${row.cashierNameAr} وتصفير الصندوق؟`,
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'استلام',
          onPress: async () => {
            setCollecting(row.cashierUserId);
            try {
              await api('/pos/drawers/collect', {
                method: 'POST',
                body: JSON.stringify({ cashierUserId: row.cashierUserId }),
              });
              toast(`تم استلام صندوق ${row.cashierNameAr}`, 'success');
              await load();
            } catch (err) {
              toast(err instanceof ApiError ? err.messageAr : 'تعذر استلام الصندوق');
            } finally {
              setCollecting(null);
            }
          },
        },
      ],
    );
  }

  const q = search.trim();
  const visible = rows.filter((row) => {
    if (!q) {
      return true;
    }
    return (
      row.receiptNumber.includes(q) ||
      (row.customerName ?? '').includes(q) ||
      row.user.nameAr.includes(q)
    );
  });

  return (
    <OwnerShell title="المبيعات">
      <View style={styles.wrap}>
        {drawers.length > 0 ? (
          <View>
            <Text style={styles.section}>صناديق الكاشير</Text>
            {drawers.map((row) => (
              <View key={row.cashierUserId} style={styles.drawer}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{row.cashierNameAr}</Text>
                  <Text style={styles.drawerAmount}>
                    {money(row.cashDue, row.currencySymbol || symbol)}
                  </Text>
                  <Text style={styles.meta}>{row.saleCount} مبيعات نقدية غير مستلمة اليوم</Text>
                </View>
                <GhostButton
                  title={collecting === row.cashierUserId ? 'جاري…' : 'استلام'}
                  onPress={() => collect(row)}
                />
              </View>
            ))}
          </View>
        ) : null}
        <View style={styles.chips}>
          <Chip label="الكل" selected={status === 'ALL'} onPress={() => setStatus('ALL')} />
          <Chip label="مكتمل" selected={status === 'COMPLETED'} onPress={() => setStatus('COMPLETED')} />
          <Chip label="معلّق" selected={status === 'HELD'} onPress={() => setStatus('HELD')} />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Chip label="كل الكاشير" selected={cashierId === 'all'} onPress={() => setCashierId('all')} />
          {cashiers.map((row) => (
            <Chip
              key={row.id}
              label={row.nameAr}
              selected={cashierId === row.id}
              onPress={() => setCashierId(row.id)}
            />
          ))}
        </ScrollView>
        <SearchField value={search} onChangeText={setSearch} placeholder="بحث بالفاتورة أو الزبون أو الكاشير" />
        <ScrollView>
          {visible.length === 0 ? <Text style={styles.empty}>لا توجد مبيعات</Text> : null}
          {visible.map((row) => {
            const pay = row.payments.map((p) => payLabel(p.method)).join('، ') || '—';
            return (
              <Pressable key={row.id} onPress={() => setOpen(row)} style={styles.card}>
                <View style={styles.cardTop}>
                  <Text style={styles.receipt}>{row.receiptNumber}</Text>
                  <Text style={styles.total}>{money(row.total, symbol)}</Text>
                </View>
                <Text style={styles.cashier}>الكاشير: {row.user.nameAr}</Text>
                <Text style={styles.meta}>
                  {row.customerName ? `الزبون: ${row.customerName} · ` : ''}
                  {pay} · {STATUS_LABEL[row.status] ?? row.status}
                </Text>
                <Text style={styles.when}>{formatWhen(row.completedAt || row.createdAt)}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
      <FormModal
        visible={Boolean(open)}
        title={open?.receiptNumber ?? 'الفاتورة'}
        onClose={() => setOpen(null)}
        hideSave
      >
        {open ? (
          <View>
            <Text style={styles.detailLine}>الكاشير: {open.user.nameAr}</Text>
            <Text style={styles.detailLine}>الزبون: {open.customerName ?? '—'}</Text>
            <Text style={styles.detailLine}>الحالة: {STATUS_LABEL[open.status] ?? open.status}</Text>
            <Text style={styles.detailLine}>
              الدفع: {open.payments.map((p) => `${payLabel(p.method)} ${money(p.amount, symbol)}`).join('، ') || '—'}
            </Text>
            <Text style={styles.detailLine}>الإجمالي: {money(open.total, symbol)}</Text>
            <Text style={styles.detailLine}>{formatWhen(open.completedAt || open.createdAt)}</Text>
            {open.notes ? <Text style={styles.detailLine}>ملاحظات: {open.notes}</Text> : null}
            <Text style={styles.itemsTitle}>الأصناف</Text>
            {open.items.map((item, index) => (
              <View key={`${open.id}-${index}`} style={styles.itemRow}>
                <Text style={styles.itemName}>{item.nameAr}</Text>
                <Text style={styles.itemMeta}>
                  {Number(item.quantity)} · {money(item.lineTotal, symbol)}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </FormModal>
    </OwnerShell>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 12 },
  section: { fontWeight: '800', color: colors.burgundy, textAlign: 'right', marginBottom: 8 },
  chips: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  empty: { color: colors.muted, textAlign: 'right', marginTop: 16 },
  drawer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.orange,
    padding: 12,
    marginBottom: 8,
  },
  cardTitle: { fontWeight: '800', color: colors.ink, textAlign: 'right' },
  drawerAmount: { color: colors.burgundy, fontWeight: '800', fontSize: 18, textAlign: 'right', marginTop: 2 },
  card: {
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
    marginBottom: 8,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  receipt: { fontWeight: '800', color: colors.ink, textAlign: 'right', flex: 1 },
  total: { fontWeight: '800', color: colors.burgundy },
  cashier: { color: colors.burgundy, fontWeight: '800', textAlign: 'right', marginTop: 8 },
  meta: { color: colors.muted, textAlign: 'right', marginTop: 4 },
  when: { color: colors.muted, textAlign: 'right', marginTop: 2, fontSize: 12 },
  detailLine: { color: colors.ink, textAlign: 'right', marginBottom: 6, fontWeight: '700' },
  itemsTitle: { color: colors.burgundy, fontWeight: '800', textAlign: 'right', marginTop: 10, marginBottom: 8 },
  itemRow: {
    backgroundColor: colors.white,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 10,
    marginBottom: 6,
  },
  itemName: { fontWeight: '700', color: colors.ink, textAlign: 'right' },
  itemMeta: { color: colors.muted, textAlign: 'right', marginTop: 4 },
});
