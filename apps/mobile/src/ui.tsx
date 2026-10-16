import { type ReactNode } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { colors } from './theme';

export function Field({
  label,
  value,
  onChangeText,
  keyboardType,
  placeholder,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  keyboardType?: 'default' | 'decimal-pad' | 'phone-pad' | 'email-address';
  placeholder?: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        style={styles.input}
      />
    </View>
  );
}

export function PrimaryButton({
  title,
  onPress,
  disabled,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[styles.primary, disabled && styles.disabled]}>
      <Text style={styles.primaryText}>{title}</Text>
    </Pressable>
  );
}

export function GhostButton({
  title,
  onPress,
  danger,
}: {
  title: string;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <Pressable onPress={onPress} style={styles.ghost}>
      <Text style={[styles.ghostText, danger && { color: colors.danger }]}>{title}</Text>
    </Pressable>
  );
}

export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, selected && styles.chipOn]}>
      <Text style={[styles.chipText, selected && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

export function Tabs({
  items,
  value,
  onChange,
}: {
  items: Array<{ id: string; label: string }>;
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <View style={styles.tabs}>
      {items.map((item) => {
        const on = value === item.id;
        return (
          <Pressable key={item.id} onPress={() => onChange(item.id)} style={[styles.tab, on && styles.tabOn]}>
            <Text style={[styles.tabText, on && styles.tabTextOn]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function SearchField({
  value,
  onChangeText,
  placeholder = 'بحث',
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <TextInput
      placeholder={placeholder}
      placeholderTextColor={colors.muted}
      value={value}
      onChangeText={onChangeText}
      style={styles.search}
    />
  );
}

export function RowCard({
  title,
  subtitle,
  onEdit,
  onDelete,
  extra,
}: {
  title: string;
  subtitle?: string;
  onEdit?: () => void;
  onDelete?: () => void;
  extra?: ReactNode;
}) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        {subtitle ? <Text style={styles.rowSub}>{subtitle}</Text> : null}
      </View>
      {extra}
      {onEdit ? <GhostButton title="تعديل" onPress={onEdit} /> : null}
      {onDelete ? <GhostButton title="حذف" danger onPress={onDelete} /> : null}
    </View>
  );
}

export function FormModal({
  visible,
  title,
  onClose,
  onSave,
  children,
  saving,
  hideSave,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  onSave?: () => void;
  children: ReactNode;
  saving?: boolean;
  hideSave?: boolean;
}) {
  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalWrap}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>{title}</Text>
          <ScrollView keyboardShouldPersistTaps="handled">{children}</ScrollView>
          <View style={styles.modalActions}>
            <GhostButton title="إلغاء" onPress={onClose} />
            {hideSave ? null : (
              <PrimaryButton title={saving ? 'جاري الحفظ…' : 'حفظ'} onPress={onSave ?? onClose} disabled={saving} />
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function confirmDelete(name: string, onYes: () => void) {
  Alert.alert('تأكيد الحذف', `حذف «${name}»؟`, [
    { text: 'إلغاء', style: 'cancel' },
    { text: 'حذف', style: 'destructive', onPress: onYes },
  ]);
}

const styles = StyleSheet.create({
  field: { marginBottom: 10 },
  label: { color: colors.ink, fontWeight: '700', marginBottom: 6, textAlign: 'right' },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    textAlign: 'right',
    color: colors.ink,
    backgroundColor: colors.white,
  },
  primary: {
    backgroundColor: colors.orange,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
  },
  primaryText: { color: colors.white, fontWeight: '800' },
  disabled: { opacity: 0.5 },
  ghost: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  ghostText: { color: colors.burgundy, fontWeight: '700' },
  chip: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.white,
  },
  chipOn: { backgroundColor: colors.burgundy, borderColor: colors.burgundy },
  chipText: { color: colors.ink, fontWeight: '700' },
  chipTextOn: { color: colors.white },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  tab: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
  },
  tabOn: { backgroundColor: colors.orange, borderColor: colors.orange },
  tabText: { color: colors.ink, fontWeight: '800' },
  tabTextOn: { color: colors.white },
  search: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    textAlign: 'right',
    marginBottom: 10,
    color: colors.ink,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
    marginBottom: 8,
  },
  rowTitle: { fontWeight: '800', color: colors.ink, textAlign: 'right' },
  rowSub: { color: colors.muted, marginTop: 4, textAlign: 'right' },
  modalWrap: { flex: 1, backgroundColor: '#0006', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: colors.cream,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    maxHeight: '88%',
    padding: 16,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: colors.burgundy, textAlign: 'right', marginBottom: 12 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 12 },
});
