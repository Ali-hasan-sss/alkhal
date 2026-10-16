import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  type AlertButton,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { Redirect, useFocusEffect } from 'expo-router';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, ApiError } from '@/src/api';
import { useAuth } from '@/src/auth';
import { money } from '@/src/money';
import { isOwner } from '@/src/owner';
import { OwnerDrawer } from '@/src/shell';
import { colors } from '@/src/theme';
import { useToast } from '@/src/toast';

const SHEET_GRAB = 72;
const SHEET_HALF = 0.5;
const SHEET_MAX = 0.88;

type Product = {
  id: string;
  nameAr: string;
  sellingPrice: string;
  categoryId: string;
  type: string;
  variants: Array<{ id: string; nameAr: string; sellingPrice: string }>;
};
type Category = { id: string; nameAr: string };
type Availability = {
  mode: string;
  quantity: string | null;
  prepareable?: string;
  limitingIngredient?: string | null;
};
type CartItem = {
  key: string;
  productId: string;
  variantId?: string;
  name: string;
  unitPrice: number;
  quantity: number;
};
type HeldSale = { id: string; receiptNumber: string; customerName?: string };
type CashDrawer = { cashDue: string; saleCount: number; currencySymbol: string };

function CatalogCard({
  product,
  cartQty,
  symbol,
  availability,
  onAdd,
}: {
  product: Product;
  cartQty: number;
  symbol: string;
  availability?: Availability;
  onAdd: () => void;
}) {
  const scale = useSharedValue(1);
  const badgeScale = useSharedValue(cartQty > 0 ? 1 : 0);
  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  const badgeStyle = useAnimatedStyle(() => ({
    transform: [{ scale: Math.max(badgeScale.value, 0) }],
    opacity: badgeScale.value,
  }));

  useEffect(() => {
    badgeScale.value = withSpring(cartQty > 0 ? 1 : 0, { damping: 12, stiffness: 280 });
  }, [badgeScale, cartQty]);

  const stockQty = availability?.quantity != null ? Number(availability.quantity) : null;
  const unavailable = availability?.mode === 'RECIPE' && (stockQty ?? 0) <= 0;

  function press() {
    scale.value = withSequence(
      withTiming(0.92, { duration: 70 }),
      withSpring(1, { damping: 9, stiffness: 320 }),
    );
    badgeScale.value = withSequence(
      withTiming(1.22, { duration: 90 }),
      withSpring(1, { damping: 10, stiffness: 280 }),
    );
    onAdd();
  }

  return (
    <Animated.View style={[styles.cardWrap, cardStyle]}>
      <Pressable
        onPress={press}
        style={[styles.card, cartQty > 0 && styles.cardInCart, unavailable && styles.cardUnavailable]}
      >
        <Animated.View style={[styles.badge, badgeStyle]} pointerEvents="none">
          <Text style={styles.badgeText}>{cartQty > 0 ? cartQty : ''}</Text>
        </Animated.View>
        <Text style={[styles.productName, cartQty > 0 && styles.productNameWithBadge]}>{product.nameAr}</Text>
        <Text style={styles.price}>{money(product.sellingPrice, symbol)}</Text>
        {availability?.mode === 'DIRECT' && stockQty != null ? (
          <Text style={styles.meta}>مخزون: {stockQty}</Text>
        ) : null}
        {availability?.mode === 'RECIPE' && stockQty != null ? (
          <Text style={[styles.meta, stockQty > 0 ? styles.ok : styles.danger]}>
            {stockQty > 0
              ? `متاح: ${stockQty}`
              : availability.limitingIngredient
                ? `غير متاح — ينقص: ${availability.limitingIngredient}`
                : 'غير متاح'}
          </Text>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

export default function PosScreen() {
  const { user, logout } = useAuth();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const wide = width >= 900;
  const bodyH = useSharedValue(Math.round(height * 0.7));
  const sheetMin = useSharedValue(SHEET_GRAB + insets.bottom);
  const sheetH = useSharedValue(Math.round(height * SHEET_HALF));
  const sheetStartH = useSharedValue(Math.round(height * SHEET_HALF));
  const sheetReady = useSharedValue(0);
  const sheetStyle = useAnimatedStyle(() => ({
    height: sheetH.value,
  }));

  useEffect(() => {
    const min = SHEET_GRAB + insets.bottom;
    sheetMin.value = min;
    if (sheetH.value < min) {
      sheetH.value = min;
    }
  }, [insets.bottom, sheetH, sheetMin]);

  const dragSheet = useMemo(() => {
    const pan = Gesture.Pan()
      .activeOffsetY([-8, 8])
      .onBegin(() => {
        sheetStartH.value = sheetH.value;
      })
      .onUpdate((event) => {
        const max = bodyH.value * SHEET_MAX;
        const next = sheetStartH.value - event.translationY;
        sheetH.value = Math.min(max, Math.max(sheetMin.value, next));
      })
      .onEnd((event) => {
        const max = bodyH.value * SHEET_MAX;
        const half = bodyH.value * SHEET_HALF;
        const min = sheetMin.value;
        const current = sheetH.value;
        const snapTo = (value: number) => {
          sheetH.value = withSpring(value, { damping: 18, stiffness: 220 });
        };
        if (event.velocityY > 900) {
          snapTo(min);
          return;
        }
        if (event.velocityY < -900) {
          snapTo(current < half + 24 ? half : max);
          return;
        }
        if (current < (min + half) / 2) {
          snapTo(min);
        } else if (current < (half + max) / 2) {
          snapTo(half);
        } else {
          snapTo(max);
        }
      });
    const tap = Gesture.Tap().onEnd(() => {
      const half = bodyH.value * SHEET_HALF;
      sheetH.value = withSpring(sheetH.value < half - 16 ? half : sheetMin.value, {
        damping: 18,
        stiffness: 220,
      });
    });
    return Gesture.Exclusive(pan, tap);
  }, [bodyH, sheetH, sheetMin, sheetStartH]);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [availability, setAvailability] = useState<Record<string, Availability>>({});
  const [held, setHeld] = useState<HeldSale[]>([]);
  const [categoryId, setCategoryId] = useState('all');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customer, setCustomer] = useState('');
  const [notes, setNotes] = useState('');
  const [discount, setDiscount] = useState('0');
  const [method, setMethod] = useState<'CASH' | 'DEBT'>('CASH');
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [drawer, setDrawer] = useState<CashDrawer | null>(null);

  const load = useCallback(async () => {
    const [catalog, heldRows] = await Promise.all([
      api<{ categories: Category[]; products: Product[]; availability?: Record<string, Availability> }>(
        '/pos/catalog',
      ),
      api<HeldSale[]>('/pos/held'),
    ]);
    setCategories(catalog.categories);
    setProducts(catalog.products);
    setAvailability(catalog.availability ?? {});
    setHeld(heldRows);
    try {
      setDrawer(await api<CashDrawer>('/pos/drawer'));
    } catch {
      setDrawer(null);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      load()
        .catch((err) => {
          if (active) {
            toast(err instanceof ApiError ? err.messageAr : 'تعذر تحميل نقطة البيع');
          }
        })
        .finally(() => {
          if (active) {
            setLoading(false);
          }
        });
      return () => {
        active = false;
      };
    }, [load, toast]),
  );

  const visible = useMemo(() => {
    const q = search.trim();
    return products.filter((p) => {
      const catOk = categoryId === 'all' || p.categoryId === categoryId;
      const searchOk = !q || p.nameAr.includes(q);
      return catOk && searchOk && p.type !== 'MODIFIER';
    });
  }, [products, categoryId, search]);

  const qtyByProduct = useMemo(() => {
    const map: Record<string, number> = {};
    for (const item of cart) {
      map[item.productId] = (map[item.productId] ?? 0) + item.quantity;
    }
    return map;
  }, [cart]);

  if (!user) {
    return <Redirect href="/login" />;
  }

  const subtotal = cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const discountValue = Math.max(Number(discount) || 0, 0);
  const total = Math.max(subtotal - discountValue, 0);
  const symbol = user.restaurant.currencySymbol || 'ل.س';

  function sellableLimit(productId: string) {
    const avail = availability[productId];
    if (!avail || avail.quantity == null) {
      return null;
    }
    return Number(avail.quantity);
  }

  function blockedSaleMessage(productId: string) {
    const avail = availability[productId];
    const ready = Number(avail?.quantity ?? 0);
    const limiting = avail?.limitingIngredient;
    if (ready <= 0) {
      return limiting
        ? `غير متاح — ينقص من المخزون: ${limiting}. حضّر المواد المحضّرة إن لزم.`
        : 'غير متاح — لا تكفي مكوّنات الوصفة في المخزون';
    }
    return `المتاح حسب الوصفة ${ready} فقط`;
  }

  function addProduct(product: Product) {
    const limit = sellableLimit(product.id);
    const inCart = qtyByProduct[product.id] ?? 0;
    if (limit != null && inCart >= limit) {
      toast(blockedSaleMessage(product.id));
      return;
    }
    const variant = product.variants[0];
    const key = `${product.id}:${variant?.id ?? ''}`;
    setCart((prev) => {
      const existing = prev.find((item) => item.key === key);
      if (existing) {
        return prev.map((item) => (item.key === key ? { ...item, quantity: item.quantity + 1 } : item));
      }
      return [
        ...prev,
        {
          key,
          productId: product.id,
          variantId: variant?.id,
          name: variant ? `${product.nameAr} - ${variant.nameAr}` : product.nameAr,
          unitPrice: Number(variant?.sellingPrice ?? product.sellingPrice),
          quantity: 1,
        },
      ];
    });
  }

  async function checkout() {
    if (!cart.length) {
      return;
    }
    if (method === 'DEBT' && !customer.trim()) {
      toast('اسم الزبون مطلوب عند البيع بالدين');
      return;
    }
    const over = cart.find((item) => {
      const limit = sellableLimit(item.productId);
      return limit != null && item.quantity > limit;
    });
    if (over) {
      toast(blockedSaleMessage(over.productId));
      return;
    }
    setBusy(true);
    try {
      await api('/pos/checkout', {
        method: 'POST',
        body: JSON.stringify({
          customerName: customer.trim() || undefined,
          notes: notes || undefined,
          discountTotal: String(discountValue),
          items: cart.map((item) => ({
            productId: item.productId,
            variantId: item.variantId,
            quantity: String(item.quantity),
          })),
          payments: [{ method, amount: String(total) }],
        }),
      });
      setCart([]);
      setCustomer('');
      setNotes('');
      setDiscount('0');
      setMethod('CASH');
      toast(method === 'DEBT' ? 'تم تسجيل الدين' : 'تم إتمام البيع', 'success');
      await load();
    } catch (err) {
      toast(err instanceof ApiError ? err.messageAr : 'تعذر إتمام البيع');
    } finally {
      setBusy(false);
    }
  }

  async function holdOrder() {
    if (!cart.length) {
      return;
    }
    setBusy(true);
    try {
      await api('/pos/hold', {
        method: 'POST',
        body: JSON.stringify({
          customerName: customer || undefined,
          notes: notes || undefined,
          items: cart.map((item) => ({
            productId: item.productId,
            variantId: item.variantId,
            quantity: String(item.quantity),
          })),
        }),
      });
      setCart([]);
      toast('تم تعليق الطلب', 'success');
      await load();
    } catch (err) {
      toast(err instanceof ApiError ? err.messageAr : 'تعذر تعليق الطلب');
    } finally {
      setBusy(false);
    }
  }

  async function recall(id: string) {
    const sale = await api<{
      items: Array<{ productId: string; variantId?: string; nameAr: string; quantity: string; unitPrice: string }>;
    }>(`/pos/held/${id}`);
    setCart(
      sale.items.map((item) => ({
        key: `${item.productId}:${item.variantId ?? ''}`,
        productId: item.productId,
        variantId: item.variantId,
        name: item.nameAr,
        unitPrice: Number(item.unitPrice),
        quantity: Number(item.quantity),
      })),
    );
    if (!wide) {
      sheetH.value = withSpring(bodyH.value * SHEET_HALF, { damping: 18, stiffness: 220 });
    }
  }

  function onBodyLayout(event: LayoutChangeEvent) {
    const next = event.nativeEvent.layout.height;
    if (next <= 0) {
      return;
    }
    bodyH.value = next;
    const half = next * SHEET_HALF;
    if (sheetReady.value === 0) {
      sheetH.value = half;
      sheetReady.value = 1;
      return;
    }
    if (sheetH.value > next * SHEET_MAX) {
      sheetH.value = next * SHEET_MAX;
    }
  }

  const catalog = (
    <View style={styles.catalog}>
      <TextInput
        placeholder="بحث عن صنف"
        placeholderTextColor={colors.muted}
        value={search}
        onChangeText={setSearch}
        style={styles.search}
      />
      <View style={styles.tabsWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabs}
        >
          <Pressable
            onPress={() => setCategoryId('all')}
            style={[styles.tab, categoryId === 'all' && styles.tabOn]}
          >
            <Text style={[styles.tabText, categoryId === 'all' && styles.tabTextOn]}>الكل</Text>
          </Pressable>
          {categories.map((cat) => {
            const on = categoryId === cat.id;
            return (
              <Pressable key={cat.id} onPress={() => setCategoryId(cat.id)} style={[styles.tab, on && styles.tabOn]}>
                <Text style={[styles.tabText, on && styles.tabTextOn]}>{cat.nameAr}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
      {loading ? (
        <ActivityIndicator color={colors.orange} style={{ marginTop: 24 }} />
      ) : (
        <ScrollView
          contentContainerStyle={[styles.grid, !wide && { paddingBottom: SHEET_GRAB + insets.bottom + 32 }]}
        >
          {visible.map((product) => (
            <CatalogCard
              key={product.id}
              product={product}
              cartQty={qtyByProduct[product.id] ?? 0}
              symbol={symbol}
              availability={availability[product.id]}
              onAdd={() => addProduct(product)}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );

  const cartInner = (
    <>
      {wide ? <Text style={styles.cartTitle}>السلة</Text> : null}
      <ScrollView
        style={styles.cartScroll}
        contentContainerStyle={styles.cartScrollContent}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
      >
        {cart.length === 0 ? <Text style={styles.empty}>السلة فارغة</Text> : null}
        {cart.map((item) => (
          <View key={item.key} style={styles.line}>
            <View style={{ flex: 1 }}>
              <Text style={styles.lineName}>{item.name}</Text>
              <Text style={styles.meta}>{money(item.unitPrice, symbol)}</Text>
            </View>
            <View style={styles.qty}>
              <Pressable
                style={styles.qtyBtn}
                onPress={() =>
                  setCart((prev) =>
                    prev
                      .map((row) => (row.key === item.key ? { ...row, quantity: row.quantity - 1 } : row))
                      .filter((row) => row.quantity > 0),
                  )
                }
              >
                <Text style={styles.qtyBtnText}>−</Text>
              </Pressable>
              <Text style={styles.qtyValue}>{item.quantity}</Text>
              <Pressable
                style={[styles.qtyBtn, styles.qtyPlus]}
                onPress={() => {
                  const limit = sellableLimit(item.productId);
                  if (limit != null && item.quantity >= limit) {
                    toast(blockedSaleMessage(item.productId));
                    return;
                  }
                  setCart((prev) =>
                    prev.map((row) => (row.key === item.key ? { ...row, quantity: row.quantity + 1 } : row)),
                  );
                }}
              >
                <Text style={[styles.qtyBtnText, { color: colors.white }]}>+</Text>
              </Pressable>
              <Pressable
                style={[styles.qtyBtn, styles.qtyRemove]}
                onPress={() => setCart((prev) => prev.filter((row) => row.key !== item.key))}
              >
                <Text style={[styles.qtyBtnText, { color: colors.white, fontSize: 14 }]}>✕</Text>
              </Pressable>
            </View>
          </View>
        ))}
        <TextInput
          placeholder={method === 'DEBT' ? 'اسم الزبون (إجباري)' : 'اسم الزبون (اختياري)'}
          placeholderTextColor={colors.muted}
          style={styles.input}
          value={customer}
          onChangeText={setCustomer}
        />
        <TextInput
          placeholder="ملاحظات"
          placeholderTextColor={colors.muted}
          style={styles.input}
          value={notes}
          onChangeText={setNotes}
        />
        <TextInput
          placeholder="خصم"
          placeholderTextColor={colors.muted}
          keyboardType="decimal-pad"
          style={styles.input}
          value={discount}
          onChangeText={setDiscount}
        />
      </ScrollView>
      <View style={[styles.cartFooter, { paddingBottom: Math.max(10, insets.bottom + 8) }]}>
        <View style={styles.methods}>
          {(['CASH', 'DEBT'] as const).map((row) => (
            <Pressable
              key={row}
              onPress={() => setMethod(row)}
              style={[styles.method, method === row && styles.methodOn]}
            >
              <Text style={[styles.methodText, method === row && styles.methodTextOn]}>
                {row === 'CASH' ? 'نقد' : 'دين'}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>الإجمالي</Text>
          <Text style={styles.totalValue}>{money(total, symbol)}</Text>
        </View>
        <Pressable
          disabled={!cart.length || busy}
          onPress={checkout}
          style={[styles.pay, (!cart.length || busy) && styles.disabled]}
        >
          <Text style={styles.payText}>
            {busy ? 'جاري التنفيذ…' : method === 'DEBT' ? 'تسجيل دين' : 'دفع نقداً'}
          </Text>
        </Pressable>
        <View style={styles.actions}>
          <Pressable disabled={!cart.length || busy} onPress={holdOrder} style={styles.ghost}>
            <Text style={styles.ghostText}>تعليق</Text>
          </Pressable>
          <Pressable onPress={() => setCart([])} style={styles.ghost}>
            <Text style={styles.ghostText}>تفريغ</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              if (!held.length) {
                toast('لا توجد طلبات معلّقة');
                return;
              }
              const buttons: AlertButton[] = [
                ...held.map((row) => ({
                  text: row.receiptNumber,
                  onPress: () =>
                    recall(row.id).catch((err) =>
                      toast(err instanceof ApiError ? err.messageAr : 'تعذر الاسترجاع'),
                    ),
                })),
                { text: 'إلغاء', style: 'cancel' },
              ];
              Alert.alert('استرجاع طلب معلّق', undefined, buttons);
            }}
            style={styles.ghost}
          >
            <Text style={styles.ghostText}>معلّق</Text>
          </Pressable>
        </View>
      </View>
    </>
  );

  const cartPanel = wide ? (
    <View style={[styles.cart, styles.cartWide]}>{cartInner}</View>
  ) : (
    <Animated.View style={[styles.cart, styles.cartSheet, sheetStyle]}>
      <GestureDetector gesture={dragSheet}>
        <Animated.View style={styles.sheetGrab}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetTitleRow}>
            <Text style={[styles.cartTitle, styles.sheetCartTitle]}>
              السلة{cart.length ? ` (${cart.length})` : ''}
            </Text>
            <Text style={styles.sheetTotal}>{money(total, symbol)}</Text>
          </View>
        </Animated.View>
      </GestureDetector>
      {cartInner}
    </Animated.View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <View style={styles.header}>
          {isOwner(user.role.code) ? (
            <Pressable onPress={() => setMenuOpen(true)} style={styles.menuBtn}>
              <Text style={styles.menuBtnText}>☰</Text>
            </Pressable>
          ) : null}
          <View style={styles.headerBrandRow}>
            <Image source={require('../assets/logo.png')} style={styles.headerLogo} resizeMode="contain" />
            <View>
              <Text style={styles.headerBrand}>الخال — نقطة البيع</Text>
              <Text style={styles.headerUser}>
                {user.nameAr} · {user.role.nameAr}
              </Text>
            </View>
          </View>
          {isOwner(user.role.code) ? (
            <View style={{ width: 44 }} />
          ) : (
            <Pressable onPress={() => logout()} style={styles.logout}>
              <Text style={styles.logoutText}>خروج</Text>
            </Pressable>
          )}
        </View>
        {!isOwner(user.role.code) && drawer ? (
          <View style={styles.drawerBanner}>
            <Text style={styles.drawerLabel}>مبلغ الصندوق الواجب تسليمه</Text>
            <Text style={styles.drawerValue}>{money(drawer.cashDue, drawer.currencySymbol || symbol)}</Text>
            <Text style={styles.drawerHint}>نقد فقط من مبيعاتك اليوم</Text>
          </View>
        ) : null}
        <View style={[styles.body, wide && styles.bodyWide]} onLayout={wide ? undefined : onBodyLayout}>
          {catalog}
          {cartPanel}
        </View>
      </KeyboardAvoidingView>
      {isOwner(user.role.code) ? <OwnerDrawer open={menuOpen} onClose={() => setMenuOpen(false)} /> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  flex: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    gap: 8,
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
  drawerBanner: {
    marginHorizontal: 12,
    marginTop: 10,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.orange,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  drawerLabel: { color: colors.muted, textAlign: 'right', fontWeight: '700' },
  drawerValue: { color: colors.burgundy, fontWeight: '800', fontSize: 22, textAlign: 'right', marginTop: 2 },
  drawerHint: { color: colors.muted, textAlign: 'right', marginTop: 2, fontSize: 12 },
  headerBrandRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  headerLogo: { width: 48, height: 48 },
  headerBrand: { color: colors.burgundy, fontWeight: '800', fontSize: 16, textAlign: 'right' },
  headerUser: { color: colors.muted, marginTop: 2, textAlign: 'right' },
  logout: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  logoutText: { color: colors.burgundy, fontWeight: '700' },
  body: { flex: 1, minHeight: 0, overflow: 'hidden' },
  bodyWide: { flexDirection: 'row' },
  catalog: { flex: 1, minHeight: 0, paddingHorizontal: 12, paddingTop: 12 },
  search: {
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 12,
    paddingVertical: 12,
    textAlign: 'right',
    marginBottom: 10,
    color: colors.ink,
    fontSize: 16,
  },
  tabsWrap: {
    backgroundColor: colors.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: 12,
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  tabs: {
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 6,
    minHeight: 48,
  },
  tab: {
    backgroundColor: colors.cream,
    borderWidth: 2,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabOn: {
    backgroundColor: colors.burgundy,
    borderColor: colors.burgundy,
  },
  tabText: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  tabTextOn: {
    color: colors.white,
    fontWeight: '800',
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 24 },
  cardWrap: { width: '48%' },
  card: {
    width: '100%',
    backgroundColor: colors.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
    minHeight: 92,
    overflow: 'visible',
  },
  cardInCart: {
    borderColor: colors.orange,
    borderWidth: 2,
    backgroundColor: '#fff7ed',
  },
  cardUnavailable: {
    opacity: 0.72,
  },
  badge: {
    position: 'absolute',
    top: 8,
    left: 8,
    minWidth: 26,
    height: 26,
    paddingHorizontal: 6,
    borderRadius: 13,
    backgroundColor: colors.orange,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  badgeText: {
    color: colors.white,
    fontWeight: '800',
    fontSize: 13,
  },
  productName: { fontWeight: '700', color: colors.ink, textAlign: 'right' },
  productNameWithBadge: { paddingLeft: 28 },
  price: { color: colors.orange, marginTop: 8, fontWeight: '700', textAlign: 'right' },
  meta: { color: colors.muted, marginTop: 4, fontSize: 12, textAlign: 'right' },
  ok: { color: colors.ok },
  danger: { color: colors.danger },
  cart: {
    flex: 1,
    minHeight: 0,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  cartSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 20,
    flexGrow: 0,
    flexShrink: 0,
    paddingTop: 0,
    borderTopWidth: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
    elevation: 16,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: -4 },
  },
  sheetGrab: {
    paddingTop: 10,
    paddingBottom: 10,
    backgroundColor: colors.cream,
    borderBottomWidth: 1,
    borderColor: colors.line,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 56,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.burgundy,
    opacity: 0.55,
    marginBottom: 10,
  },
  sheetTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  sheetTotal: { fontWeight: '800', color: colors.burgundy },
  cartWide: { width: 380, flex: 1, maxHeight: '100%', borderTopWidth: 0, borderLeftWidth: 1 },
  cartTitle: { fontSize: 18, fontWeight: '800', color: colors.burgundy, textAlign: 'right', marginBottom: 8 },
  sheetCartTitle: { marginBottom: 0 },
  cartScroll: { flex: 1, minHeight: 0 },
  cartScrollContent: { paddingBottom: 20 },
  cartFooter: {
    paddingTop: 16,
    paddingBottom: 8,
    borderTopWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    gap: 10,
  },
  empty: { color: colors.muted, textAlign: 'right' },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cream,
    borderRadius: 10,
    padding: 8,
    marginBottom: 8,
    gap: 8,
  },
  lineName: { fontWeight: '600', textAlign: 'right', color: colors.ink },
  qty: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  qtyBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyPlus: { backgroundColor: colors.orange },
  qtyRemove: { backgroundColor: colors.burgundy },
  qtyBtnText: { fontSize: 18, fontWeight: '700', color: colors.ink },
  qtyValue: { width: 22, textAlign: 'center', fontWeight: '700' },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 8,
    textAlign: 'right',
    color: colors.ink,
  },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between' },
  totalLabel: { fontWeight: '800', color: colors.ink },
  totalValue: { fontWeight: '800', color: colors.burgundy },
  methods: { flexDirection: 'row', gap: 8 },
  method: { flex: 1, borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  methodOn: { backgroundColor: colors.burgundy, borderColor: colors.burgundy },
  methodText: { color: colors.ink, fontWeight: '700' },
  methodTextOn: { color: colors.white, fontWeight: '700' },
  pay: { backgroundColor: colors.orange, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  payText: { color: colors.white, fontWeight: '800', fontSize: 16 },
  disabled: { opacity: 0.5 },
  actions: { flexDirection: 'row', gap: 8 },
  ghost: { flex: 1, borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  ghostText: { color: colors.ink },
});
