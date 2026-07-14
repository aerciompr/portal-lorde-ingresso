import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import {
  upcomingEventsWhere,
  startOfLocalDay,
  publicListEventsWhere,
} from '@/lib/events-public';
import EventCard from '@/components/EventCard';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Programação e eventos | Lorde Nelson',
  description:
    'Todos os eventos do Lorde Nelson Rest Pub em Maceió. Compre ingressos online.',
};

export default async function Programacao() {
  const cutoff = startOfLocalDay();

  const [upcoming, past] = await Promise.all([
    prisma.event.findMany({
      where: upcomingEventsWhere(),
      include: {
        ticketTypes: true,
        lotes: true,
        activeLote: true,
      },
      orderBy: { date: 'asc' },
    }),
    // últimos 6 encerrados (públicos) — ajuda a “achar” o site
    prisma.event.findMany({
      where: publicListEventsWhere({ date: { lt: cutoff } }),
      include: {
        ticketTypes: true,
        lotes: true,
        activeLote: true,
      },
      orderBy: { date: 'desc' },
      take: 6,
    }),
  ]);

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 sm:py-12">
      <div className="mb-8 sm:mb-10">
        <p className="text-emerald-400 text-xs tracking-[2px] uppercase mb-2">
          Lorde Nelson · Maceió
        </p>
        <h1 className="section-title mb-2">Programação e eventos</h1>
        <p className="text-zinc-400 max-w-2xl">
          Todos os shows e noites com venda de ingresso. Toque no cartaz para ver lotes e
          comprar.
        </p>
        {upcoming.length > 0 && (
          <p className="text-sm text-zinc-500 mt-2">
            <strong className="text-zinc-300">{upcoming.length}</strong> evento
            {upcoming.length === 1 ? '' : 's'} em cartaz
          </p>
        )}
      </div>

      {upcoming.length === 0 ? (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-950/20 px-6 py-10 text-center mb-12">
          <p className="text-amber-200/90 font-medium mb-2">
            Nenhum evento futuro listado agora
          </p>
          <p className="text-sm text-zinc-400 mb-4">
            Se você esperava ver um show, fale no WhatsApp ou volte em breve.
          </p>
          <Link href="/" className="btn btn-secondary text-sm">
            Voltar à página inicial
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-5 mb-14">
          {upcoming.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      )}

      {past.length > 0 && (
        <section className="border-t border-white/10 pt-10">
          <h2 className="text-lg font-semibold tracking-tight mb-1 text-zinc-300">
            Eventos recentes
          </h2>
          <p className="text-xs text-zinc-500 mb-6">Já realizados (somente consulta)</p>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 opacity-80">
            {past.map((event) => (
              <EventCard key={event.id} event={event} compact />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
