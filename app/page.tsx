import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { getAppSettings } from '@/lib/settings';
import { upcomingEventsWhere } from '@/lib/events-public';
import EventCard from '@/components/EventCard';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const [events, settings] = await Promise.all([
    prisma.event.findMany({
      where: upcomingEventsWhere(),
      include: {
        ticketTypes: true,
        lotes: true,
        activeLote: true,
      },
      orderBy: { date: 'asc' },
    }),
    getAppSettings(),
  ]);

  const b = settings.branding;
  const heroTitle = b.bannerTitle || 'LORDE NELSON';
  const heroSubtitle =
    b.bannerSubtitle ||
    'Rest Pub • Shows, forró e grandes jogos. Compre seu ingresso agora.';
  const heroBg = b.bannerImageUrl ? `url(${b.bannerImageUrl})` : undefined;

  return (
    <div>
      {/* Hero */}
      <div className="relative h-[40vh] min-h-[280px] md:h-[48vh] md:min-h-[340px] flex items-center justify-center bg-zinc-950 overflow-hidden">
        {heroBg ? (
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: heroBg }}
          />
        ) : (
          <>
            <div className="absolute inset-0 bg-gradient-to-br from-black via-zinc-950 to-zinc-900" />
            <div className="absolute inset-0 bg-[radial-gradient(#ffffff10_0.5px,transparent_1px)] bg-[length:4px_4px]" />
          </>
        )}
        <div className="absolute inset-0 bg-black/65" />
        <div className="relative z-10 max-w-5xl mx-auto px-6 text-center">
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-semibold tracking-[-2.5px] leading-none mb-4 text-white">
            {heroTitle}
          </h1>
          <div
            className="text-base sm:text-lg md:text-xl text-zinc-200 tracking-tight mb-8 max-w-md mx-auto"
            dangerouslySetInnerHTML={{ __html: heroSubtitle }}
          />

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a href="#eventos" className="btn btn-primary text-base px-8">
              Ver eventos e comprar
            </a>
            <Link href="/ingressos" className="btn btn-secondary text-base px-8">
              Meus Ingressos
            </Link>
          </div>
          {events.length > 0 && (
            <p className="mt-4 text-sm text-zinc-400">
              {events.length} evento{events.length === 1 ? '' : 's'} em cartaz
            </p>
          )}
        </div>
      </div>

      {/* Todos os eventos na home */}
      <div id="eventos" className="max-w-6xl mx-auto px-6 py-12 sm:py-16 scroll-mt-20">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-8">
          <div>
            <div className="text-emerald-400 text-sm tracking-[2px] mb-1">INGRESSOS</div>
            <h2 className="section-title">Eventos e programação</h2>
            <p className="text-sm text-zinc-400 mt-1">
              Escolha o evento e garanta seu lugar. Compra rápida por PIX ou cartão.
            </p>
          </div>
          <Link
            href="/eventos"
            className="text-sm text-emerald-400 hover:underline font-medium shrink-0"
          >
            Abrir página completa →
          </Link>
        </div>

        {events.length === 0 ? (
          <div className="text-center py-16 px-4 rounded-2xl border border-white/10 bg-zinc-900/50">
            <p className="text-zinc-300 font-medium mb-2">Nenhum evento em cartaz no momento</p>
            <p className="text-sm text-zinc-500 mb-6">
              Volte em breve ou confira a programação completa.
            </p>
            <Link href="/eventos" className="btn btn-primary">
              Ver programação
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-5">
            {events.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        )}

        <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-4 text-center text-sm text-zinc-400">
          <div className="flex items-center justify-center gap-2">
            <span>🎸</span> <span>Shows ao vivo</span>
          </div>
          <div className="flex items-center justify-center gap-2">
            <span>📱</span> <span>Ingresso no celular</span>
          </div>
          <div className="flex items-center justify-center gap-2">
            <span>📍</span> <span>Jaraguá · Maceió</span>
          </div>
        </div>
      </div>
    </div>
  );
}
