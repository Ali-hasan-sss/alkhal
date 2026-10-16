import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { api, ApiError } from '@/src/api';
import { useAuth } from '@/src/auth';
import { money } from '@/src/money';
import { OwnerShell } from '@/src/shell';
import { Chip, Field, FormModal, GhostButton, RowCard, SearchField } from '@/src/ui';
import { colors } from '@/src/theme';
import { useToast } from '@/src/toast';

type DebtRow = {
  id: string;
  customerName: string;
  amount: string;
  remainingAmount: string;
  status: 'OPEN' | 'SETTLED' | 'CANCELLED';
  createdAt: string;
  sale: { receiptNumber: string; completedAt: string | null; user: { nameAr: string } };
};

type DebtsResponse = {
  summary: { outstanding: string; openCustomerCount: number; openCount: number };
  customers: Array<{ customerName: string; remaining: string; amount: string; openCount: number }>;
  debts: DebtRow[];
};

const statusLabel: Record<DebtRow['status'], string> = {
  OPEN: 'مفتوح',
  SETTLED: 'مسدد',
  CANCELLED: 'ملغى',
};

export default function DebtsScreen() {
  const toast = useToast();
  const { user } = useAuth();
  const symbol = user?.restaurant.currencySymbol || 'ل.س';
  const [data, setData] = useState<DebtsResponse | null>(null);
  const [status, setStatus] = useState<'OPEN' | 'ALL'>('OPEN');
  const [search, setSearch] = useState('');
  const [settle, setSettle] = useState<DebtRow | null>(null);
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setData(await api<DebtsResponse>(status === 'ALL' ? '/debts' : '/debts?status=OPEN'));
  }, [status]);

  useFocusEffect(
    useCallback(() => {
      load().catch((err) => toast(err instanceof ApiError ? err.messageAr : 'تعذر تحميل الديون'));
    }, [load, toast]),
  );

  async function saveSettle() {
    if (!settle) {
      return;
    }
    if (!(Number(amount) > 0)) {
      toast('أدخل مبلغ التسديد');
      return;
    }
    setSaving(true);
    try {
      await api(`/debts/${settle.id}/settle`, {
        method: 'POST',
        body: JSON.stringify({ amount, method: 'CASH' }),
      });
      setSettle(null);
      toast('تم تسديد المبلغ', 'success');
      await load();
    } catch (err) {
      toast(err instanceof ApiError ? err.messageAr : 'تعذر التسديد');
    } finally {
      setSaving(false);
    }
  }

  const q = search.trim();
  const debts = (data?.debts ?? []).filter(
    (row) => !q || row.customerName.includes(q) || row.sale.receiptNumber.includes(q),
  );

  return (
    <OwnerShell title="الديون">
      <View style={styles.wrap}>
        <View style={styles.summary}>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>المتبقي</Text>
            <Text style={styles.statValue}>{money(data?.summary.outstanding, symbol)}</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>زبائن</Text>
            <Text style={styles.statValue}>{data?.summary.openCustomerCount ?? 0}</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>فواتير</Text>
            <Text style={styles.statValue}>{data?.summary.openCount ?? 0}</Text>
          </View>
        </View>
        <View style={styles.chips}>
          <Chip label="المفتوحة" selected={status === 'OPEN'} onPress={() => setStatus('OPEN')} />
          <Chip label="الكل" selected={status === 'ALL'} onPress={() => setStatus('ALL')} />
        </View>
        <SearchField value={search} onChangeText={setSearch} placeholder="بحث بالزبون أو الفاتورة" />
        <ScrollView>
          {(data?.customers ?? []).length > 0 && status === 'OPEN' ? (
            <Text style={styles.section}>حسب الزبون</Text>
          ) : null}
          {status === 'OPEN'
            ? (data?.customers ?? [])
                .filter((row) => !q || row.customerName.includes(q))
                .map((row) => (
                  <RowCard
                    key={row.customerName}
                    title={row.customerName}
                    subtitle={`${row.openCount} فواتير · متبقي ${money(row.remaining, symbol)}`}
                  />
                ))
            : null}
          <Text style={styles.section}>الفواتير</Text>
          {debts.map((row) => (
            <RowCard
              key={row.id}
              title={row.customerName}
              subtitle={`${row.sale.receiptNumber} · الكاشير: ${row.sale.user.nameAr} · ${statusLabel[row.status]} · متبقي ${money(row.remainingAmount, symbol)}`}
              extra={
                row.status === 'OPEN' ? (
                  <GhostButton
                    title="تسديد"
                    onPress={() => {
                      setSettle(row);
                      setAmount(row.remainingAmount);
                    }}
                  />
                ) : undefined
              }
            />
          ))}
        </ScrollView>
      </View>
      <FormModal
        visible={Boolean(settle)}
        title={`تسديد — ${settle?.customerName ?? ''}`}
        onClose={() => setSettle(null)}
        onSave={saveSettle}
        saving={saving}
      >
        <Field label="المبلغ" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
      </FormModal>
    </OwnerShell>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 12 },
  summary: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  stat: {
    flex: 1,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    padding: 10,
  },
  statLabel: { color: colors.muted, textAlign: 'right', fontSize: 12 },
  statValue: { color: colors.burgundy, fontWeight: '800', textAlign: 'right', marginTop: 4 },
  chips: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  section: { fontWeight: '800', color: colors.burgundy, textAlign: 'right', marginVertical: 8 },
});
