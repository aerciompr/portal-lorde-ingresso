import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatPrice, formatDate } from "@/lib/utils";
import { MapPin } from "lucide-react";
import { getAppSettings } from "@/lib/settings";
import EventImage from "@/components/EventImage";
import { eventMinPriceCents } from "@/lib/event-price";

export const dynamic = 'force-dynamic';

export default async function Home() {
  const [allEvents, settings] = await Promise.all([
    prisma.event.findMany({
      include: {
        ticketTypes: true,
        lotes: true,
        activeLote: true,
      },
      orderBy: { date: 'asc' },
    }),
    getAppSettings(),
  ]);
  const events = allEvents.filter((e) => new Date(e.date) >= new Date()).slice(0, 6);

  const b = settings.branding;
  const heroTitle = b.bannerTitle || 'LORDE NELSON';
  const heroSubtitle = b.bannerSubtitle || 'Rest Pub • Shows, forró e grandes jogos. Compre seu ingresso agora.';
  const heroBg = b.bannerImageUrl ? `url(${b.bannerImageUrl})` : undefined;

  return (
    <div>
      {/* Hero with banner */}
      <div className="relative h-[45vh] min-h-[320px] md:h-[52vh] md:min-h-[380px] flex items-center justify-center bg-zinc-950 overflow-hidden">
        {heroBg ? (
          <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: heroBg }} />
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
          <div className="text-base sm:text-lg md:text-xl text-zinc-200 tracking-tight mb-8 max-w-md mx-auto" dangerouslySetInnerHTML={{ __html: heroSubtitle }} />

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/eventos" className="btn btn-primary text-base px-8">Ver Programação</Link>
            <Link href="/ingressos" className="btn btn-secondary text-base px-8">Meus Ingressos</Link>
          </div>
        </div>
      </div>

      {/* Programação destaque */}
      <div className="max-w-6xl mx-auto px-6 py-16">
        <div className="flex items-end justify-between mb-8">
          <div>
            <div className="text-emerald-400 text-sm tracking-[2px] mb-1">PRÓXIMOS EVENTOS</div>
            <h2 className="section-title">Nossa Programação</h2>
          </div>
          <Link href="/eventos" className="text-sm hover:underline flex items-center gap-1">Ver todos <span>→</span></Link>
        </div>

        {events.length === 0 ? (
          <div className="text-center py-12 text-zinc-400">Nenhum evento futuro no momento. Volte em breve!</div>
        ) : (
          <>
            {/* Grid 2 col: cartaz 3:4 com object-contain (arte inteira, sem crop agressivo) */}
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              {events.map((event) => {
                const minPrice = eventMinPriceCents(event);
                return (
                  <Link
                    key={event.id}
                    href={`/evento/${event.slug}`}
                    className="group flex flex-col rounded-2xl border border-white/10 bg-zinc-900 overflow-hidden hover:border-emerald-500/30 hover:bg-zinc-800/50 transition-all"
                  >
                    <div className="relative w-full aspect-[3/4] bg-zinc-950 overflow-hidden">
                      <EventImage
                        src={event.imageUrl}
                        className="absolute inset-0 w-full h-full object-contain group-hover:scale-[1.02] transition-transform duration-300"
                      />
                    </div>
                    <div className="flex flex-col flex-1 p-3 sm:p-4 min-h-0">
                      <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] sm:text-xs font-semibold tracking-wide uppercase">
                          {new Date(event.date).toLocaleDateString('pt-BR', {
                            weekday: 'short',
                            day: '2-digit',
                            month: 'short',
                          })}
                        </span>
                        <span className="text-[10px] sm:text-xs text-zinc-500">
                          {event.openTime || '20:00'}
                        </span>
                      </div>
                      <h3 className="font-semibold text-sm sm:text-base tracking-tight line-clamp-2 group-hover:text-white transition mb-1">
                        {event.title}
                      </h3>
                      <div className="flex items-center gap-1 text-[10px] sm:text-xs text-zinc-500 mb-2">
                        <MapPin className="w-3 h-3 shrink-0" />
                        <span className="truncate">
                          {event.location || event.address?.split(',')[0] || ''}
                        </span>
                      </div>
                      <div className="mt-auto flex items-end justify-between gap-2 pt-1">
                        <div>
                          <div className="text-[9px] text-zinc-500 tracking-wider">A PARTIR DE</div>
                          <div className="font-semibold text-base sm:text-lg tabular-nums text-white">
                            {formatPrice(minPrice)}
                          </div>
                        </div>
                        <span className="text-xs sm:text-sm font-medium text-emerald-400 group-hover:underline">
                          Comprar →
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>

            {/* Pequena seção de benefícios para dar mais alma e visual agradável */}
            <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-4 text-center text-sm text-zinc-400">
              <div className="flex items-center justify-center gap-2">
                <span>🎸</span> <span>Shows ao vivo toda semana</span>
              </div>
              <div className="flex items-center justify-center gap-2">
                <span>🍻</span> <span>Ambiente temático único</span>
              </div>
              <div className="flex items-center justify-center gap-2">
                <span>📍</span> <span>Melhor localização de Maceió</span>
              </div>
            </div>
          </>
        )}

      </div>
    </div>
  );
}
