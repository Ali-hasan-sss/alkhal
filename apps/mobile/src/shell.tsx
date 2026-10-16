import { type ReactNode, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Redirect, usePathname, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from './auth';
import { isOwner } from './owner';
import { colors } from './theme';

export const OWNER_LINKS = [
  { href: '/pos', label: 'نقطة البيع' },
  { href: '/sales', label: 'المبيعات' },
  { href: '/inventory', label: 'المواد والمخزون' },
  { href: '/recipes', label: 'الوصفات والتحضير' },
  { href: '/products', label: 'المنتجات' },
  { href: '/categories', label: 'الأصناف' },
  { href: '/suppliers', label: 'الموردون' },
  { href: '/debts', label: 'الديون' },
] as const;

export function OwnerDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  if (!open || !user) {
    return null;
  }
  return (
    <View style={styles.overlay}>
      <View style={styles.panel}>
        <View style={styles.brand}>
          <Image source={require('../assets/logo.png')} style={styles.logo} resizeMode="contain" />
          <View>
            <Text style={styles.brandTitle}>الخال</Text>
            <Text style={styles.brandUser}>{user.nameAr}</Text>
          </View>
        </View>
        {OWNER_LINKS.map((link) => {
          const active = pathname === link.href;
          return (
            <Pressable
              key={link.href}
              onPress={() => {
                onClose();
                router.push(link.href);
              }}
              style={[styles.link, active && styles.linkOn]}
            >
              <Text style={[styles.linkText, active && styles.linkTextOn]}>{link.label}</Text>
            </Pressable>
          );
        })}
        <Pressable
          onPress={() => {
            onClose();
            logout();
          }}
          style={styles.logout}
        >
          <Text style={styles.logoutText}>خروج</Text>
        </Pressable>
      </View>
      <Pressable style={styles.backdrop} onPress={onClose} />
    </View>
  );
}

export function OwnerShell({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  if (!user) {
    return <Redirect href="/login" />;
  }
  if (!isOwner(user.role.code)) {
    return <Redirect href="/pos" />;
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => setOpen(true)} style={styles.menuBtn}>
          <Text style={styles.menuBtnText}>☰</Text>
        </Pressable>
        <Text style={styles.title}>{title}</Text>
        {action ?? <View style={{ width: 44 }} />}
      </View>
      <View style={styles.body}>{children}</View>
      <OwnerDrawer open={open} onClose={() => setOpen(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderColor: colors.line,
  },
  menuBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuBtnText: { fontSize: 20, color: colors.burgundy },
  title: { flex: 1, textAlign: 'center', fontWeight: '800', fontSize: 18, color: colors.burgundy },
  body: { flex: 1, minHeight: 0 },
  overlay: { ...StyleSheet.absoluteFillObject, flexDirection: 'row', zIndex: 80, elevation: 80 },
  panel: {
    width: 280,
    backgroundColor: colors.white,
    paddingTop: 18,
    paddingHorizontal: 12,
    borderLeftWidth: 1,
    borderColor: colors.line,
  },
  backdrop: { flex: 1, backgroundColor: '#0006' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16, paddingHorizontal: 8 },
  logo: { width: 48, height: 48 },
  brandTitle: { fontWeight: '800', color: colors.burgundy, fontSize: 18, textAlign: 'right' },
  brandUser: { color: colors.muted, textAlign: 'right' },
  link: { paddingVertical: 12, paddingHorizontal: 12, borderRadius: 10, marginBottom: 4 },
  linkOn: { backgroundColor: colors.orange },
  linkText: { color: colors.ink, fontWeight: '700', textAlign: 'right', fontSize: 16 },
  linkTextOn: { color: colors.white },
  logout: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  logoutText: { color: colors.burgundy, fontWeight: '800' },
});
