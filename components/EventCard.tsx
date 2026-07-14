import Link from 'next/link';
import { Calendar, Clock, MapPin } from 'lucide-react';
import { formatPrice } from '@/lib/utils';
import EventImage from '@/components/EventImage';
import { eventHasAvailability, eventMinPriceCents } from '@/lib/event-price';

export type EventCardData = {
  id: string;
  slug: string;
  title: string;
  date: Date | string;
  openTime?: string | null;
  address?: string | null;
  location?: string | null;
  imageUrl?: string | null;
  ticketTypes?: { priceCents: number; totalQty?: number; sold?: number }[];
  lotes?: {
    precoCents: number;
    totalQty: number;
    sold: number;
    ativo?: boolean;
  }[];
  activeLote?: { precoCents: number; totalQty?: number; sold?: number } | null;
};

export default function EventCard({
  event,
  compact = false,
}: {
  event: EventCardData;
  compact?: boolean;
}) {
  const minPrice = eventMinPriceCents(event);
  const available = eventHasAvailability(event);
  const when = new Date(event.date);

  return (
    <Link
      href={`/evento/${event.slug}`}
      className="group flex flex-col rounded-2xl border border-white/10 bg-zinc-900 overflow-hidden hover:border-emerald-500/40 hover:bg-zinc-800/60 transition-all shadow-sm hover:shadow-emerald-950/20"
    >
      <div className="relative w-full aspect-[3/4] bg-zinc-950 overflow-hidden">
        <EventImage
          src={event.imageUrl}
          className="absolute inset-0 w-full h-full object-contain group-hover:scale-[1.02] transition-transform duration-300"
        />
        {!available && (
          <div className="absolute top-2 right-2 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-red-950/90 text-red-300 border border-red-500/30">
            Esgotado
          </div>
        )}
      </div>

      <div className={`flex flex-col flex-1 min-h-0 ${compact ? 'p-3' : 'p-3 sm:p-4'}`}>
        <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] sm:text-xs font-semibold">
            <Calendar className="w-3 h-3" />
            {when.toLocaleDateString('pt-BR', {
              weekday: 'short',
              day: '2-digit',
              month: 'short',
            })}
          </span>
          <span className="inline-flex items-center gap-1 text-[10px] sm:text-xs text-zinc-500">
            <Clock className="w-3 h-3" />
            {event.openTime || '20:00'}
          </span>
        </div>

        <h3 className="font-semibold text-sm sm:text-base tracking-tight line-clamp-2 group-hover:text-white transition mb-1">
          {event.title}
        </h3>

        {!compact && (
          <div className="flex items-center gap-1 text-[10px] sm:text-xs text-zinc-500 mb-2">
            <MapPin className="w-3 h-3 shrink-0" />
            <span className="truncate">
              {event.location || event.address?.split(',')[0] || 'Lorde Nelson'}
            </span>
          </div>
        )}

        <div className="mt-auto flex items-end justify-between gap-2 pt-2 border-t border-white/5">
          <div>
            <div className="text-[9px] text-zinc-500 tracking-wider">A PARTIR DE</div>
            <div className="font-semibold text-base sm:text-lg tabular-nums text-white">
              {formatPrice(minPrice)}
            </div>
          </div>
          <span
            className={`text-xs sm:text-sm font-medium ${
              available ? 'text-emerald-400 group-hover:underline' : 'text-zinc-500'
            }`}
          >
            {available ? 'Comprar →' : 'Ver →'}
          </span>
        </div>
      </div>
    </Link>
  );
}
