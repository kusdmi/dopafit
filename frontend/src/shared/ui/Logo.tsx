import { BrandIcon } from './BrandIcon';
import { BrandWordmark } from './BrandWordmark';

interface Props {
  className?: string;
}

export function Logo({ className }: Props) {
  return (
    <span
      className={`inline-flex items-center gap-[4%] ${className ?? ''}`}
      role="img"
      aria-label="DopaFit"
    >
      <BrandIcon className="h-full w-auto shrink-0" aria-hidden />
      <BrandWordmark className="h-full w-auto shrink-0" aria-hidden />
    </span>
  );
}
