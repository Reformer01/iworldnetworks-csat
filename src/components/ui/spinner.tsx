import { Loader2Icon } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Spinner({ className }: { className?: string }) {
  return <Loader2Icon role="status" aria-label="Loading" className={cn('h-4 w-4 animate-spin', className)} />;
}
