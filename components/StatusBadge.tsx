'use client';

import { orderStatusLabel } from '@/lib/utils';

const COLORS: Record<string, string> = {
  paid: 'bg-emerald-500/20 text-emerald-400',
  refunded: 'bg-red-500/20 text-red-400',
  pending: 'bg-yellow-500/20 text-yellow-400',
  cancelled: 'bg-zinc-600/40 text-zinc-400',
  canceled: 'bg-zinc-600/40 text-zinc-400',
};

export default function StatusBadge({ status }: { status: string }) {
  const s = (status || '').toLowerCase();
  return (
    <span className={`px-2 py-0.5 rounded text-xs ${COLORS[s] || 'bg-zinc-700'}`}>
      {orderStatusLabel(status)}
    </span>
  );
}
