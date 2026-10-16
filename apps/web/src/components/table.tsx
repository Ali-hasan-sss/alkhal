'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Modal({
  open,
  title,
  children,
  onClose,
  wide,
  elevated,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  /** Use for nested modals so they stack above an open parent modal. */
  elevated?: boolean;
}) {
  if (!open) {
    return null;
  }
  return (
    <div
      className={cn(
        'fixed inset-0 flex items-start justify-center overflow-y-auto bg-ink/40 p-4 pt-16',
        elevated ? 'z-[60]' : 'z-50',
      )}
    >
      <button type="button" className="absolute inset-0 cursor-default" aria-label="close" onClick={onClose} />
      <div
        className={cn(
          'relative z-10 w-full rounded-2xl border border-stone-200 bg-white p-6 shadow-xl',
          wide ? 'max-w-3xl' : 'max-w-lg',
        )}
      >
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold">{title}</h2>
          <button type="button" className="rounded-lg px-2 py-1 text-stone-500 hover:bg-stone-100" onClick={onClose}>
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'ok' | 'warn' | 'danger' | 'brand';
}) {
  return (
    <span
      className={cn(
        'inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium',
        tone === 'neutral' && 'bg-stone-100 text-stone-700',
        tone === 'ok' && 'bg-emerald-50 text-emerald-800',
        tone === 'warn' && 'bg-amber-50 text-amber-800',
        tone === 'danger' && 'bg-red-50 text-red-800',
        tone === 'brand' && 'bg-orange/10 text-orange',
      )}
    >
      {children}
    </span>
  );
}

export function DataTable({
  headers,
  children,
  empty,
  embedded,
}: {
  headers: string[];
  children: ReactNode;
  empty?: boolean;
  embedded?: boolean;
}) {
  return (
    <div className={cn(!embedded && 'overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm')}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] table-auto text-sm">
          <thead>
            <tr className="bg-burgundy text-white">
              {headers.map((h) => (
                <th key={h} className="px-4 py-3 text-start align-middle text-xs font-bold whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100 bg-white">{children}</tbody>
        </table>
      </div>
      {empty ? <div className="bg-cream px-4 py-8 text-center text-sm text-stone-500">لا توجد بيانات</div> : null}
    </div>
  );
}

export function Td({
  children,
  className,
  numeric,
}: {
  children: ReactNode;
  className?: string;
  numeric?: boolean;
}) {
  return (
    <td
      className={cn(
        'px-4 py-3 text-start align-middle',
        numeric && 'font-semibold tabular-nums',
        className,
      )}
    >
      {children}
    </td>
  );
}

export function Tr({ children }: { children: ReactNode }) {
  return <tr className="odd:bg-white even:bg-cream/60 hover:bg-orange/5">{children}</tr>;
}
