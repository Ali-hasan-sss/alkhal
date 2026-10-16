'use client';

import { FormEvent, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { api, setTokens } from '@/lib/api';
import { BrandLogo } from '@/components/brand-logo';
import { Button, Input, Label } from '@/components/ui';

export default function LoginPage() {
  const t = useTranslations('login');
  const brand = useTranslations();
  const router = useRouter();
  const [email, setEmail] = useState('owner@alkhal.local');
  const [password, setPassword] = useState('ChangeMe!123');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const data = await api<{ accessToken: string; refreshToken: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      setTokens(data.accessToken, data.refreshToken);
      router.replace('/');
    } catch {
      setError(t('error'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-dvh items-center justify-center overflow-auto bg-cream p-6">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-8 shadow-sm"
      >
        <div className="mb-8 flex flex-col items-center text-center">
          <BrandLogo size={128} className="mb-3 h-28 w-28" />
          <div className="text-2xl font-bold text-burgundy">{brand('brand')}</div>
          <div className="mt-1 text-orange">Al-Khal snacks</div>
        </div>
        <div className="mb-4">
          <Label>{t('email')}</Label>
          <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
        </div>
        <div className="mb-6">
          <Label>{t('password')}</Label>
          <Input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            required
          />
        </div>
        {error ? <p className="mb-4 text-sm text-red-700">{error}</p> : null}
        <Button className="w-full" disabled={loading}>
          {t('submit')}
        </Button>
      </form>
    </div>
  );
}
