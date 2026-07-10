import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatPrice, formatDate } from "@/lib/utils";
import { Calendar, MapPin, Clock } from "lucide-react";
import { getAppSettings } from "@/lib/settings";
import EventImage from "@/components/EventImage";

export const dynamic = 'force-dynamic';

export default async function Home() {
  const [allEvents, settings] = await Promise.all([
    prisma.event.findMany({
      include: { ticketTypes: true },
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
            <div className="space-y-3">
              {events.map((event) => {
                const minPrice = Math.min(...event.ticketTypes.map(t => t.priceCents));
                return (
                  <Link 
                    key={event.id} 
                    href={`/evento/${event.slug}`} 
                    className="group flex flex-col sm:flex-row sm:items-start items-stretch gap-3 sm:gap-8 p-4 sm:p-6 rounded-2xl border border-white/10 bg-zinc-900 hover:border-emerald-500/30 hover:bg-zinc-800/60 transition-all relative overflow-hidden before:absolute before:left-0 before:top-0 before:h-full before:w-1 before:bg-emerald-500 before:opacity-0 group-hover:before:opacity-100 before:transition-all"
                  >
                    {/* Mobile: image + info row for card feel; desktop row */}
                    <div className="flex flex-col sm:flex-row gap-3 sm:gap-6 w-full sm:flex-1 sm:items-start">
                      {/* Photo thumbnail - larger and prominent */}
                      <div className="w-full h-32 sm:w-32 sm:h-32 md:w-40 md:h-40 flex-shrink-0 rounded-xl overflow-hidden bg-zinc-800 border border-white/10 ring-1 ring-white/5">
                        <EventImage 
                          src={event.imageUrl} 
                          className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300" 
                        />
                      </div>

                      {/* Date + Main info */}
                      <div className="flex-1 min-w-0 pt-1">
                        <div className="flex items-center gap-3 mb-2">
                          <span className="inline-flex items-center px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-sm sm:text-base font-semibold tracking-[1.5px] uppercase">
                            {new Date(event.date).toLocaleDateString('pt-BR', { 
                              weekday: 'short', 
                              day: '2-digit', 
                              month: 'short' 
                            })}
                          </span>
                          <span className="text-sm text-zinc-400 font-medium">• {event.openTime || '20:00'}</span>
                        </div>

                        <h3 className="font-semibold text-xl sm:text-2xl tracking-tight group-hover:text-white transition mb-2">
                          {event.title}
                        </h3>

                        {event.description && (() => {
                          const plain = event.description.replace(/<[^>]+>/g, '').trim();
                          const isLong = plain.length > 120;
                          const displayHtml = isLong 
                            ? plain.slice(0, 120) + '...' 
                            : event.description;
                          return (
                            <p 
                              className="mt-1.5 text-sm text-zinc-500 line-clamp-2"
                              dangerouslySetInnerHTML={{ __html: displayHtml }}
                            />
                          );
                        })()}

                        <div className="flex items-center gap-2 mt-1.5 text-xs text-zinc-500">
                          <MapPin className="w-3.5 h-3.5 flex-shrink-0" /> 
                          <span>{event.location || event.address?.split(',')[0] || ''}</span>
                        </div>
                      </div>
                    </div>

                    {/* Price + CTA - cleaner, on mobile full width row at bottom */}
                    <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-2 sm:gap-3 sm:ml-10 w-full sm:w-auto mt-2 sm:mt-0">
                      <div className="text-right">
                        <div className="text-[10px] text-zinc-500 tracking-wider">A PARTIR DE</div>
                        <div className="font-semibold text-2xl sm:text-3xl tracking-tight text-white tabular-nums">
                          {formatPrice(minPrice)}
                        </div>
                      </div>

                      <div className="mt-1 text-sm sm:text-base font-medium text-emerald-400 group-hover:underline flex items-center gap-1.5 transition">
                        Comprar 
                        <span className="inline-block transition group-hover:translate-x-0.5">→</span>
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
