import { cn } from '@/lib/utils'

const TONE: Record<string, string> = {
  on_sale: 'bg-sky-500', scheduled: 'bg-zinc-400', confirmed: 'bg-emerald-500', full: 'bg-violet-500', min_not_met: 'bg-amber-500', closed: 'bg-zinc-500', in_progress: 'bg-blue-500',
  completed: 'bg-zinc-600', cancelled: 'bg-rose-500', weather_cancelled: 'bg-rose-500', pending_payment: 'bg-amber-500', checked_in: 'bg-emerald-600', no_show: 'bg-orange-500',
  refunded: 'bg-rose-400', partially_refunded: 'bg-rose-300', offered: 'bg-amber-500', accepted: 'bg-emerald-500', declined: 'bg-rose-500', worked: 'bg-zinc-600',
  draft: 'bg-zinc-400', approved: 'bg-sky-500', paid: 'bg-emerald-500', open: 'bg-sky-500', signed: 'bg-emerald-500', required: 'bg-amber-500', pending: 'bg-zinc-400', active: 'bg-emerald-500', waiting: 'bg-amber-500', converted: 'bg-emerald-500', expired: 'bg-zinc-400', withdrawn: 'bg-zinc-400', void: 'bg-rose-500',
}
// Status is a mono uppercase label with a dot; no badges or pills.
export function StatusLabel({ status, className }: { status: string; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 font-mono text-xs uppercase tracking-wide text-muted-foreground', className)}>
      <span className={cn('size-2 shrink-0 rounded-full', TONE[status] || 'bg-zinc-400')} />
      {status.replaceAll('_', ' ')}
    </span>
  )
}
