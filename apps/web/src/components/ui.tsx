import {
  forwardRef,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/utils';

export function Button({
  className,
  variant = 'primary',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
}) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50',
        variant === 'primary' && 'bg-orange text-white hover:bg-orange/90',
        variant === 'secondary' && 'bg-burgundy text-white hover:bg-burgundy/90',
        variant === 'ghost' && 'border border-stone-200 bg-white hover:bg-stone-50',
        variant === 'danger' && 'bg-red-700 text-white',
        className,
      )}
      {...props}
    />
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
    <div className="flex flex-wrap gap-2 border-b border-stone-200 pb-3">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onChange(item.id)}
          className={cn(
            'rounded-xl px-4 py-2 text-sm font-semibold transition',
            value === item.id ? 'bg-orange text-white shadow-sm' : 'bg-cream text-ink hover:bg-stone-100',
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function Card({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('rounded-2xl border border-stone-200 bg-white p-5 shadow-sm', className)}>
      {children}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        {...props}
        className={cn(
          'w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-orange',
          className,
        )}
      />
    );
  },
);

export function Label({ children }: { children: React.ReactNode }) {
  return <label className="mb-1 block text-sm font-medium">{children}</label>;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        'w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-orange',
        props.className,
      )}
    />
  );
}

export type SearchSelectOption = { value: string; label: string; searchText?: string };

export function SearchSelect({
  value,
  onChange,
  options,
  placeholder = '—',
  searchPlaceholder = 'بحث…',
  required,
  disabled,
  emptyLabel = 'لا نتائج',
  footer,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SearchSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  required?: boolean;
  disabled?: boolean;
  emptyLabel?: string;
  footer?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return options;
    }
    return options.filter((o) => {
      const hay = `${o.label} ${o.searchText ?? ''}`.toLowerCase();
      return hay.includes(q) || o.label.includes(query.trim());
    });
  }, [options, query]);

  useEffect(() => {
    if (!open) {
      return;
    }
    setQuery('');
    const t = window.setTimeout(() => searchRef.current?.focus(), 0);
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      {required ? (
        <input
          tabIndex={-1}
          className="pointer-events-none absolute h-0 w-0 opacity-0"
          value={value}
          onChange={() => undefined}
          required
        />
      ) : null}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex w-full items-center justify-between gap-2 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-orange disabled:opacity-50',
          !selected && 'text-stone-400',
        )}
      >
        <span className="truncate text-start">{selected?.label || placeholder}</span>
        <span className="text-xs text-stone-400">{open ? '▴' : '▾'}</span>
      </button>
      {open ? (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-stone-200 bg-white shadow-lg">
          <div className="border-b border-stone-100 p-2">
            <Input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              onKeyDown={(e) => e.stopPropagation()}
            />
          </div>
          <ul className="max-h-52 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-stone-400">{emptyLabel}</li>
            ) : (
              filtered.map((o) => (
                <li key={o.value}>
                  <button
                    type="button"
                    className={cn(
                      'flex w-full px-3 py-2 text-start text-sm hover:bg-cream',
                      o.value === value && 'bg-orange/10 font-semibold text-burgundy',
                    )}
                    onClick={() => {
                      onChange(o.value);
                      setOpen(false);
                    }}
                  >
                    {o.label}
                  </button>
                </li>
              ))
            )}
          </ul>
          {footer ? (
            <div className="border-t border-stone-100 p-2" onClick={() => setOpen(false)}>
              {footer}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function PageHeader({ title, actions }: { title: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex items-center justify-between gap-4">
      <h1 className="text-2xl font-extrabold text-burgundy">{title}</h1>
      {actions}
    </div>
  );
}
