import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function money(value: string | number | undefined, symbol = 'ل.س') {
  const n = Number(value ?? 0);
  return `${symbol} ${n.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
