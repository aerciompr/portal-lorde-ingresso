'use client';

import { useEffect, useState } from 'react';
import { APP_TIMEZONE } from '@/lib/timezone';

/**
 * Relógio discreto no fuso do portal (Maceió) — para validar vendas / fuso.
 */
export default function AppClock({
  className = '',
  prefix = 'Maceió',
}: {
  className?: string;
  prefix?: string;
}) {
  const [label, setLabel] = useState('');

  useEffect(() => {
    const fmt = () =>
      new Date().toLocaleString('pt-BR', {
        timeZone: APP_TIMEZONE,
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });

    setLabel(fmt());
    const id = window.setInterval(() => setLabel(fmt()), 1000);
    return () => window.clearInterval(id);
  }, []);

  if (!label) {
    return (
      <span className={className} aria-hidden>
        {prefix} · …
      </span>
    );
  }

  return (
    <time
      dateTime={new Date().toISOString()}
      title="Horário de referência do portal (America/Maceió)"
      className={className}
    >
      {prefix} · {label}
    </time>
  );
}
