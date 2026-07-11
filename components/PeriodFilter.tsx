'use client';

import type { PeriodId } from '@/lib/period';

const OPTIONS: [PeriodId, string][] = [
  ['today', 'Hoje'],
  ['7d', '7 dias'],
  ['15d', '15 dias'],
  ['30d', '30 dias'],
  ['all', 'Tudo'],
  ['custom', 'Personalizado'],
];

type Props = {
  period: PeriodId;
  onPeriodChange: (p: PeriodId) => void;
  customFrom?: string;
  customTo?: string;
  onCustomFromChange?: (v: string) => void;
  onCustomToChange?: (v: string) => void;
  hint?: string;
};

/** Filtro de período reutilizável (dashboard + relatórios) */
export default function PeriodFilter({
  period,
  onPeriodChange,
  customFrom = '',
  customTo = '',
  onCustomFromChange,
  onCustomToChange,
  hint = 'Bruto e líquido = só pedidos pagos. Estornos não somam no bruto.',
}: Props) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-zinc-500 mb-2">Período</div>
      <div className="flex flex-wrap gap-1.5">
        {OPTIONS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => onPeriodChange(id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
              period === id
                ? 'bg-emerald-600 border-emerald-500 text-white'
                : 'border-white/10 text-zinc-400 hover:bg-white/5'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {period === 'custom' && (
        <div className="flex flex-wrap gap-2 mt-2">
          <label className="text-xs text-zinc-500 flex items-center gap-1.5">
            De
            <input
              type="date"
              className="input py-1 text-xs"
              value={customFrom}
              onChange={(e) => onCustomFromChange?.(e.target.value)}
            />
          </label>
          <label className="text-xs text-zinc-500 flex items-center gap-1.5">
            Até
            <input
              type="date"
              className="input py-1 text-xs"
              value={customTo}
              onChange={(e) => onCustomToChange?.(e.target.value)}
            />
          </label>
        </div>
      )}
      {hint && <p className="text-[11px] text-zinc-600 mt-2">{hint}</p>}
    </div>
  );
}
