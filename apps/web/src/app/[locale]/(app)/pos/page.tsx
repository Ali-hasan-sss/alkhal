'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { Button, Input } from '@/components/ui';
import { cn, money } from '@/lib/utils';

type Product = {
  id: string;
  nameAr: string;
  nameEn: string;
  sellingPrice: string;
  categoryId: string;
  type: string;
  inventoryMode?: string;
  variants: Array<{ id: string; nameAr: string; sellingPrice: string }>;
};
type Category = { id: string; nameAr: string; code: string };
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
  discount: number;
};

export default function PosPage() {
  const t = useTranslations('pos');
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['pos-catalog'],
    queryFn: () =>
      api<{
        categories: Category[];
        products: Product[];
        availability?: Record<string, Availability>;
      }>('/pos/catalog'),
  });
  const held = useQuery({
    queryKey: ['held'],
    queryFn: () => api<Array<{ id: string; receiptNumber: string; customerName?: string }>>('/pos/held'),
  });

  const [categoryId, setCategoryId] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customer, setCustomer] = useState('');
  const [notes, setNotes] = useState('');
  const [discount, setDiscount] = useState(0);
  const [method, setMethod] = useState<'CASH' | 'DEBT'>('CASH');
  const [message, setMessage] = useState('');
  const [pulse, setPulse] = useState<Record<string, number>>({});

  const products = useMemo(() => {
    return (data?.products ?? []).filter((p) => {
      const catOk = categoryId === 'all' || p.categoryId === categoryId;
      const q = search.trim();
      const searchOk = !q || p.nameAr.includes(q) || p.nameEn.toLowerCase().includes(q.toLowerCase());
      return catOk && searchOk && p.type !== 'MODIFIER';
    });
  }, [data, categoryId, search]);

  const subtotal = cart.reduce((a, i) => a + i.unitPrice * i.quantity - i.discount, 0);
  const total = Math.max(subtotal - discount, 0);

  const qtyByProduct = useMemo(() => {
    const map: Record<string, number> = {};
    for (const item of cart) {
      map[item.productId] = (map[item.productId] ?? 0) + item.quantity;
    }
    return map;
  }, [cart]);

  function sellableLimit(productId: string) {
    const avail = data?.availability?.[productId];
    if (!avail || avail.quantity == null) {
      return null;
    }
    return Number(avail.quantity);
  }

  function blockedSaleMessage(productId: string) {
    const avail = data?.availability?.[productId];
    const ready = Number(avail?.quantity ?? 0);
    const limiting = avail?.limitingIngredient;
    if (ready <= 0) {
      return limiting
        ? `غير متاح — ينقص من المخزون: ${limiting}. حضّر المواد المحضّرة (صلصة/عجينة…) إن لزم.`
        : 'غير متاح — لا تكفي مكوّنات الوصفة في المخزون';
    }
    return `المتاح حسب الوصفة ${ready} فقط`;
  }

  function addProduct(p: Product) {
    const limit = sellableLimit(p.id);
    const inCart = qtyByProduct[p.id] ?? 0;
    if (limit != null && inCart >= limit) {
      setMessage(blockedSaleMessage(p.id));
      return;
    }
    const variant = p.variants[0];
    const key = `${p.id}:${variant?.id ?? ''}`;
    setCart((prev) => {
      const existing = prev.find((i) => i.key === key);
      if (existing) {
        return prev.map((i) => (i.key === key ? { ...i, quantity: i.quantity + 1 } : i));
      }
      return [
        ...prev,
        {
          key,
          productId: p.id,
          variantId: variant?.id,
          name: variant ? `${p.nameAr} - ${variant.nameAr}` : p.nameAr,
          unitPrice: Number(variant?.sellingPrice ?? p.sellingPrice),
          quantity: 1,
          discount: 0,
        },
      ];
    });
    setPulse((prev) => ({ ...prev, [p.id]: (prev[p.id] ?? 0) + 1 }));
    setMessage('');
  }

  const checkout = useMutation({
    mutationFn: () => {
      if (method === 'DEBT' && !customer.trim()) {
        throw new Error('اسم الزبون مطلوب عند البيع بالدين');
      }
      const over = cart.find((item) => {
        const limit = sellableLimit(item.productId);
        return limit != null && item.quantity > limit;
      });
      if (over) {
        throw new Error(blockedSaleMessage(over.productId));
      }
      return api('/pos/checkout', {
        method: 'POST',
        body: JSON.stringify({
          customerName: customer.trim() || undefined,
          notes: notes || undefined,
          discountTotal: String(discount),
          items: cart.map((i) => ({
            productId: i.productId,
            variantId: i.variantId,
            quantity: String(i.quantity),
            discountAmount: String(i.discount),
          })),
          payments: [{ method, amount: String(total) }],
        }),
      });
    },
    onSuccess: () => {
      setCart([]);
      setCustomer('');
      setNotes('');
      setDiscount(0);
      setMethod('CASH');
      setMessage(method === 'DEBT' ? t('successDebt') : t('success'));
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['pos-catalog'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['production-ready'] });
      qc.invalidateQueries({ queryKey: ['debts'] });
    },
    onError: (err: Error) => setMessage(err.message),
  });

  const hold = useMutation({
    mutationFn: () =>
      api('/pos/hold', {
        method: 'POST',
        body: JSON.stringify({
          customerName: customer || undefined,
          notes: notes || undefined,
          items: cart.map((i) => ({
            productId: i.productId,
            variantId: i.variantId,
            quantity: String(i.quantity),
          })),
        }),
      }),
    onSuccess: () => {
      setCart([]);
      qc.invalidateQueries({ queryKey: ['held'] });
    },
  });

  return (
    <div className="-m-6 flex h-[calc(100vh-0px)] min-h-[640px]">
      <section className="flex min-w-0 flex-1 flex-col p-4">
        <div className="mb-3 flex gap-2">
          <Input
            placeholder={t('search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-12 text-base"
          />
        </div>
        <div className="mb-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setCategoryId('all')}
            className={`rounded-lg px-3 py-2 text-sm ${categoryId === 'all' ? 'bg-orange text-white' : 'bg-white border'}`}
          >
            الكل
          </button>
          {(data?.categories ?? []).map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategoryId(c.id)}
              className={`rounded-lg px-3 py-2 text-sm ${categoryId === c.id ? 'bg-orange text-white' : 'bg-white border'}`}
            >
              {c.nameAr}
            </button>
          ))}
        </div>
        <div className="grid flex-1 auto-rows-min grid-cols-2 gap-2 overflow-auto md:grid-cols-3 xl:grid-cols-4">
          {products.map((p) => {
            const avail = data?.availability?.[p.id];
            const qty = avail?.quantity != null ? Number(avail.quantity) : null;
            const cartQty = qtyByProduct[p.id] ?? 0;
            const pop = pulse[p.id] ?? 0;
            return (
            <button
              key={`${p.id}-${pop}`}
              type="button"
              onClick={() => addProduct(p)}
              className={cn(
                'relative rounded-xl border bg-white p-4 text-start hover:border-orange',
                cartQty > 0 ? 'border-orange bg-orange/5' : 'border-stone-200',
                pop > 0 && 'pos-card-pop',
              )}
            >
              {cartQty > 0 ? (
                <span className="pos-badge-pop absolute end-2 top-2 z-10 flex h-7 min-w-7 items-center justify-center rounded-full bg-orange px-1.5 text-sm font-extrabold text-white shadow">
                  {cartQty}
                </span>
              ) : null}
              <div className={cn('font-semibold', cartQty > 0 && 'pe-8')}>{p.nameAr}</div>
              <div className="mt-2 text-orange">{money(p.sellingPrice)}</div>
              {avail?.mode === 'DIRECT' && qty != null ? (
                <div className="mt-1 text-xs text-stone-500">مخزون: {qty}</div>
              ) : null}
              {avail?.mode === 'RECIPE' && qty != null ? (
                <div className={`mt-1 text-xs ${qty > 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                  {qty > 0
                    ? `متاح: ${qty}`
                    : avail.limitingIngredient
                      ? `غير متاح — ينقص: ${avail.limitingIngredient}`
                      : 'غير متاح'}
                </div>
              ) : null}
            </button>
            );
          })}
        </div>
      </section>
      <aside className="flex w-full max-w-md flex-col border-s bg-white p-4">
        <h2 className="mb-3 text-lg font-bold">{t('cart')}</h2>
        <div className="flex-1 space-y-2 overflow-auto">
          {cart.length === 0 ? <p className="text-stone-500">{t('empty')}</p> : null}
          {cart.map((item) => (
            <div key={item.key} className="flex items-center justify-between gap-2 rounded-lg bg-cream p-2">
              <div>
                <div className="font-medium">{item.name}</div>
                <div className="text-sm text-stone-500">{money(item.unitPrice)}</div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="h-8 w-8 rounded bg-stone-200"
                  onClick={() =>
                    setCart((prev) =>
                      prev
                        .map((i) => (i.key === item.key ? { ...i, quantity: i.quantity - 1 } : i))
                        .filter((i) => i.quantity > 0),
                    )
                  }
                >
                  −
                </button>
                <span className="w-6 text-center">{item.quantity}</span>
                <button
                  type="button"
                  className="h-8 w-8 rounded bg-orange text-white"
                  onClick={() => {
                    const limit = sellableLimit(item.productId);
                    if (limit != null && item.quantity >= limit) {
                      setMessage(blockedSaleMessage(item.productId));
                      return;
                    }
                    setCart((prev) =>
                      prev.map((i) => (i.key === item.key ? { ...i, quantity: i.quantity + 1 } : i)),
                    );
                  }}
                >
                  +
                </button>
                <button
                  type="button"
                  className="h-8 w-8 rounded bg-burgundy text-white"
                  title="إزالة من السلة"
                  onClick={() => setCart((prev) => prev.filter((i) => i.key !== item.key))}
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 space-y-2 border-t pt-3">
          <Input
            placeholder={method === 'DEBT' ? t('customerRequired') : t('customerOptional')}
            value={customer}
            onChange={(e) => setCustomer(e.target.value)}
          />
          <Input placeholder={t('notes')} value={notes} onChange={(e) => setNotes(e.target.value)} />
          <Input
            placeholder={t('discount')}
            type="number"
            value={discount}
            onChange={(e) => setDiscount(Number(e.target.value))}
          />
        </div>
        <div className="mt-6 space-y-3 border-t pt-5">
          <div className="grid grid-cols-2 gap-2">
            {(['CASH', 'DEBT'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMethod(m)}
                className={`rounded-lg py-2.5 text-sm font-medium ${method === m ? 'bg-burgundy text-white' : 'border'}`}
              >
                {m === 'CASH' ? t('cash') : t('debt')}
              </button>
            ))}
          </div>
          <div className="flex justify-between font-bold">
            <span>{t('total')}</span>
            <span>{money(total)}</span>
          </div>
          {message ? <p className="text-sm text-burgundy">{message}</p> : null}
          <Button className="h-12 w-full text-base" disabled={!cart.length || checkout.isPending} onClick={() => checkout.mutate()}>
            {method === 'DEBT' ? t('recordDebt') : t('payCash')}
          </Button>
          <div className="grid grid-cols-3 gap-2">
            <Button variant="ghost" onClick={() => hold.mutate()} disabled={!cart.length}>
              {t('hold')}
            </Button>
            <Button variant="ghost" onClick={() => setCart([])}>
              {t('clear')}
            </Button>
            <select
              className="rounded-lg border px-2 text-sm"
              onChange={(e) => {
                const id = e.target.value;
                if (id) {
                  api<{ items: Array<{ productId: string; variantId?: string; nameAr: string; quantity: string; unitPrice: string }> }>(
                    `/pos/held/${id}`,
                  ).then((sale) => {
                    setCart(
                      sale.items.map((i) => ({
                        key: `${i.productId}:${i.variantId ?? ''}`,
                        productId: i.productId,
                        variantId: i.variantId,
                        name: i.nameAr,
                        unitPrice: Number(i.unitPrice),
                        quantity: Number(i.quantity),
                        discount: 0,
                      })),
                    );
                  });
                }
              }}
              defaultValue=""
            >
              <option value="">{t('recall')}</option>
              {(held.data ?? []).map((h) => (
                <option key={h.id} value={h.id}>
                  {h.receiptNumber}
                </option>
              ))}
            </select>
          </div>
        </div>
      </aside>
    </div>
  );
}
