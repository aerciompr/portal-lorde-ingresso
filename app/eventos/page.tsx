import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatPrice, formatDate } from "@/lib/utils";
import { Calendar, Clock, MapPin } from "lucide-react";

export const dynamic = 'force-dynamic';

export default async function Programacao() {
  const events = await prisma.event.findMany({
    where: {
      date: { gte: new Date() },
    },
    include: { ticketTypes: true },
    orderBy: { date: 'asc' },
  });

  return (
    <div className="max-w-6xl mx-auto px-6 py-12">
      <h1 className="section-title mb-2">Programação Completa</h1>
      <p className="text-zinc-400 mb-10">Todos os eventos. Escolha o seu e garanta seu lugar.</p>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {events.map((event: any) => {
          const minPrice = event.ticketTypes.length ? Math.min(...event.ticketTypes.map((t: any) => t.priceCents)) : 0;
          const available = event.ticketTypes.reduce((s: number, t: any) => s + (t.totalQty - t.sold), 0);
          return (
            <div
              key={event.id}
              className="card flex flex-col overflow-hidden p-0 border border-white/10"
            >
              <div className="relative w-full aspect-[3/4] bg-zinc-950 overflow-hidden">
                {event.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={event.imageUrl}
                    alt=""
                    className="absolute inset-0 w-full h-full object-contain"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-4xl opacity-30">🎫</div>
                )}
              </div>

              <div className="flex flex-col flex-1 p-3 sm:p-4">
                <h2 className="text-sm sm:text-lg font-semibold tracking-tight mb-1.5 line-clamp-2">
                  {event.title}
                </h2>
                <div className="flex flex-wrap items-center gap-1.5 mb-2 text-[10px] sm:text-xs">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-semibold">
                    <Calendar size={12} /> {formatDate(event.date)}
                  </span>
                  <span className="flex items-center gap-1 text-zinc-500">
                    <Clock size={12} /> {event.openTime}
                  </span>
                </div>
                <div className="hidden sm:flex items-center text-xs text-zinc-500 gap-1.5 mb-3 line-clamp-1">
                  <MapPin size={12} /> {event.address}
                </div>
                <div className="mt-auto flex items-center justify-between gap-2 pt-2 border-t border-white/10">
                  <div className="font-mono text-sm text-emerald-400">{formatPrice(minPrice)}</div>
                  {available < 1 ? (
                    <span className="text-xs text-red-400">Esgotado</span>
                  ) : (
                    <Link href={`/evento/${event.slug}`} className="btn btn-primary text-xs sm:text-sm px-3 py-2">
                      Comprar
                    </Link>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {events.length === 0 && <div className="text-center py-20 text-zinc-400">Nenhum evento cadastrado.</div>}
    </div>
  );
}
