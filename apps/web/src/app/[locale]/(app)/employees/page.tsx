'use client';

import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { Button, Card, Input, Label, PageHeader, Select } from '@/components/ui';
import { money } from '@/lib/utils';

type Role = { id: string; code: string; nameAr: string };
type Employee = {
  id: string;
  nameAr: string;
  wageType: string;
  monthlySalary: string;
  status: string;
  user?: { email: string; role: { nameAr: string } } | null;
};

export default function EmployeesPage() {
  const qc = useQueryClient();
  const employees = useQuery({
    queryKey: ['employees'],
    queryFn: () => api<Employee[]>('/employees'),
  });
  const roles = useQuery({
    queryKey: ['employee-roles'],
    queryFn: () => api<Role[]>('/employees/roles'),
  });
  const [nameAr, setNameAr] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [roleId, setRoleId] = useState('');
  const [salary, setSalary] = useState('0');
  const [error, setError] = useState('');

  const create = useMutation({
    mutationFn: () =>
      api('/employees', {
        method: 'POST',
        body: JSON.stringify({
          nameAr,
          nameEn: nameEn || nameAr,
          email,
          password,
          roleId,
          wageType: 'MONTHLY',
          monthlySalary: salary,
        }),
      }),
    onSuccess: () => {
      setNameAr('');
      setNameEn('');
      setEmail('');
      setPassword('');
      setRoleId('');
      setSalary('0');
      setError('');
      qc.invalidateQueries({ queryKey: ['employees'] });
    },
    onError: (err: Error) => setError(err instanceof ApiError ? err.messageAr : err.message),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    create.mutate();
  }

  return (
    <div className="space-y-6">
      <PageHeader title="الموظفون" />
      <Card>
        <p className="mb-3 text-sm text-stone-500">
          أدخل بريد الدخول وكلمة المرور والدور حتى يتمكن الموظف من تسجيل الدخول إلى النظام.
        </p>
        <form onSubmit={onSubmit} className="grid gap-3 md:grid-cols-3">
          <div>
            <Label>الاسم</Label>
            <Input value={nameAr} onChange={(e) => setNameAr(e.target.value)} required />
          </div>
          <div>
            <Label>الاسم بالإنجليزي</Label>
            <Input value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
          </div>
          <div>
            <Label>الدور</Label>
            <Select value={roleId} onChange={(e) => setRoleId(e.target.value)} required>
              <option value="">اختر الدور</option>
              {(roles.data ?? []).map((role) => (
                <option key={role.id} value={role.id}>
                  {role.nameAr}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>بريد الدخول</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <Label>كلمة المرور</Label>
            <Input
              type="password"
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <div>
            <Label>الراتب الشهري</Label>
            <Input value={salary} onChange={(e) => setSalary(e.target.value)} />
          </div>
          <div className="md:col-span-3 flex items-center gap-3">
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'جاري الإضافة…' : 'إضافة موظف'}
            </Button>
            {error ? <p className="text-sm text-red-700">{error}</p> : null}
          </div>
        </form>
      </Card>
      <Card>
        {(employees.data ?? []).map((e) => (
          <div key={e.id} className="flex items-center justify-between border-b py-2 text-sm">
            <span>
              {e.nameAr}
              {e.user ? ` · ${e.user.email} · ${e.user.role.nameAr}` : ' · بلا حساب دخول'}
              {` — ${money(e.monthlySalary)}`}
            </span>
            <Button
              variant="secondary"
              onClick={() => {
                const start = new Date();
                start.setDate(1);
                const end = new Date();
                api('/salary-payments', {
                  method: 'POST',
                  body: JSON.stringify({
                    employeeId: e.id,
                    amount: e.monthlySalary,
                    periodStart: start.toISOString(),
                    periodEnd: end.toISOString(),
                  }),
                });
              }}
            >
              صرف راتب
            </Button>
          </div>
        ))}
      </Card>
    </div>
  );
}
