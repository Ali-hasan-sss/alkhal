import { cn } from '@/lib/utils';

export function BrandLogo({
  className,
  size = 56,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <img
      src="/logo.png"
      alt="الخال — Al-Khal snacks"
      width={size}
      height={size}
      className={cn('object-contain', className)}
    />
  );
}
