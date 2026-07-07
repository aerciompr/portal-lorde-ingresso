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

      <div className="space-y-4">
        {events.map((event: any) => {
          const minPrice = event.ticketTypes.length ? Math.min(...event.ticketTypes.map((t: any) => t.priceCents)) : 0;
          const available = event.ticketTypes.reduce((s: number, t: any) => s + (t.totalQty - t.sold), 0);
          return (
            <div key={event.id} className="card flex flex-col md:flex-row gap-6 p-6">
              <div className="w-full md:w-72 h-48 bg-zinc-800 rounded-xl overflow-hidden flex-shrink-0">
                {event.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={event.imageUrl} alt="" className="w-full h-full object-contain bg-zinc-800" />
                ) : <div className="flex h-full items-center justify-center text-6xl opacity-30">🎫</div>}
              </div>

              <div className="flex-1 flex flex-col">
                <div className="flex-1">
                  <div className="flex justify-between items-start gap-4">
                    <div>
                      <h2 className="text-2xl font-semibold tracking-tight mb-1">{event.title}</h2>
                      <div className="flex items-center gap-3 mb-3">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-sm font-semibold">
                          <Calendar size={15} /> {formatDate(event.date)}
                        </span>
                        <span className="flex items-center gap-1.5 text-sm text-zinc-400">
                          <Clock size={15} /> {event.openTime}
                        </span>
                      </div>
                    </div>
                    <div className="text-right text-sm font-mono text-emerald-400">{formatPrice(minPrice)}</div>
                  </div>

                  <div className="text-zinc-400 text-sm leading-relaxed mb-4 line-clamp-3" dangerouslySetInnerHTML={{ __html: event.description || '' }} />

                  <div className="flex items-center text-xs text-zinc-500 gap-2 mb-4">
                    <MapPin size={14} /> {event.address}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-white/10">
                  <div className="text-sm">
                    {available > 0 ? (
                      <span className="text-emerald-400">{available} ingressos disponíveis</span>
                    ) : <span className="text-red-400">Esgotado</span>}
                  </div>
                  <Link href={`/evento/${event.slug}`} className="btn btn-primary">Comprar Ingressos</Link>
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
