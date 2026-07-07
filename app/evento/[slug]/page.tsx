import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatDate, isPastDeadline } from "@/lib/utils";
import TicketSelector from "./TicketSelector";
import { MapPin, Clock, Calendar } from "lucide-react";

export const dynamic = 'force-dynamic';

export default async function EventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const event = await prisma.event.findUnique({
    where: { slug },
    include: { 
      ticketTypes: true,
      lotes: true,
      activeLote: true,
    },
  });

  if (!event) notFound();

  const soldOut = event.ticketTypes.every((tt: any) => tt.sold >= tt.totalQty);
  const past = isPastDeadline(event);

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <a href="/eventos" className="text-xs uppercase tracking-widest text-zinc-500 hover:text-white">← Programação</a>

      <div className="mt-6 grid lg:grid-cols-5 gap-8">
        {/* Image / info */}
        <div className="lg:col-span-3">
          <div className="aspect-video rounded-3xl overflow-hidden bg-zinc-900 mb-6 border border-white/10">
            {event.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={event.imageUrl} alt={event.title} className="w-full h-full object-contain bg-zinc-800" />
            ) : <div className="h-full flex items-center justify-center text-7xl">🎟️</div>}
          </div>

          <h1 className="text-4xl font-semibold tracking-[-1.5px] mb-3">{event.title}</h1>

          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-zinc-400 mb-6">
            <div className="flex items-center gap-2"><Calendar className="w-4 h-4" /> {formatDate(event.date)}</div>
            <div className="flex items-center gap-2"><Clock className="w-4 h-4" /> Abre às {event.openTime || '20:00'}</div>
            <div className="flex items-center gap-2"><MapPin className="w-4 h-4" /> {event.address}</div>
          </div>

          <div className="prose prose-invert text-zinc-300 leading-relaxed" dangerouslySetInnerHTML={{ __html: event.description || '' }} />

          {event.salesDeadline && (
            <div className="mt-6 inline-block text-xs bg-amber-950 text-amber-400 px-4 py-1 rounded-full">
              Vendas até {new Date(event.salesDeadline).toLocaleString('pt-BR')}
            </div>
          )}
        </div>

        {/* Ticket selector + purchase */}
        <div className="lg:col-span-2">
          <div className="card p-6 sticky top-20">
            <div className="uppercase text-xs tracking-[2px] text-emerald-400 mb-1">INGRESSOS</div>
            <div className="text-xl font-semibold mb-5 tracking-tight">Selecione quantidades</div>

            {soldOut || past ? (
              <div className="p-6 text-center text-red-400 bg-red-950/30 rounded-xl">
                {soldOut ? "Esgotado" : "Vendas encerradas"}
              </div>
            ) : (
              <TicketSelector event={JSON.parse(JSON.stringify(event))} />
            )}

            <div className="mt-8 pt-6 border-t border-white/10 text-xs text-zinc-400 space-y-1">
              <div>• Cancelamento permitido conforme regras do evento (veja na área do cliente após compra)</div>
              <div>• Pagamento seguro com Pix ou Cartão</div>
              <div>• Ingresso com QR Code enviado por e-mail e disponível em Meus Ingressos</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
