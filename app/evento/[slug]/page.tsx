import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatDate, isPastDeadline, getEventFooterNotice } from "@/lib/utils";
import { getAppSettings } from "@/lib/settings";
import { absoluteMediaUrl } from "@/lib/media-url";
import TicketSelector from "./TicketSelector";
import { MapPin, Clock, Calendar } from "lucide-react";

export const dynamic = 'force-dynamic';

function stripHtml(html: string): string {
  return (html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const [event, s] = await Promise.all([
    prisma.event.findUnique({
      where: { slug },
      select: {
        title: true,
        description: true,
        imageUrl: true,
        slug: true,
        address: true,
        date: true,
      },
    }),
    getAppSettings(),
  ]);

  if (!event) {
    return { title: "Evento não encontrado" };
  }

  const siteName = s.branding.siteName || "Lorde Nelson";
  const base = (
    s.publicUrl ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://portal.lordenelson.com.br"
  ).replace(/\/$/, "");

  const plain = stripHtml(event.description || "");
  const when = formatDate(event.date);
  const description =
    plain.slice(0, 160) ||
    `${event.title} — ${when}${event.address ? ` · ${event.address}` : ""}. Ingressos no ${siteName}.`;

  const title = `${event.title} | ${siteName}`;
  const pageUrl = `${base}/evento/${event.slug}`;
  const imageRaw = (event.imageUrl || "").trim();
  const image = imageRaw
    ? absoluteMediaUrl(imageRaw, base)
    : absoluteMediaUrl(
        (s.branding.logoUrl || "/logo-lordenelson.jpg").trim(),
        base
      );

  return {
    title,
    description,
    alternates: { canonical: pageUrl },
    openGraph: {
      type: "website",
      locale: "pt_BR",
      url: pageUrl,
      siteName,
      title: event.title,
      description,
      images: image
        ? [
            {
              url: image,
              alt: event.title,
            },
          ]
        : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: event.title,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export default async function EventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const event = await prisma.event.findUnique({
    where: { slug },
    include: { 
      ticketTypes: true,
      lotes: { orderBy: { ordem: 'asc' } },
      activeLote: true,
    },
  });

  if (!event) notFound();

  // NÃO chamar syncTicketTypeCapacityForEvent aqui (pageview):
  // disputa o mesmo row lock de TicketType com o checkout → MySQL 1205.
  // Com lote ativo a UI usa o LOTE como fonte da verdade (TicketSelector).

  // Esgotado: prioriza LOTE ATIVO (não o 1º ticketType — isso bloqueava Lote 1 após migração)
  const loteAtivo = event.activeLote;
  const hasLotes = (event.lotes?.length || 0) > 0;
  let soldOut = false;
  if (loteAtivo) {
    soldOut =
      !loteAtivo.ativo ||
      loteAtivo.sold >= loteAtivo.totalQty ||
      loteAtivo.totalQty - loteAtivo.sold < 1;
  } else if (hasLotes) {
    // tem lotes mas nenhum ativo com vaga
    soldOut = !event.lotes.some(
      (l: { sold: number; totalQty: number; ativo: boolean }) =>
        l.ativo && l.sold < l.totalQty
    );
  } else {
    soldOut =
      event.ticketTypes.length > 0 &&
      event.ticketTypes.every(
        (tt: { sold: number; totalQty: number }) => tt.sold >= tt.totalQty
      );
  }
  const past = isPastDeadline(event);

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <a href="/eventos" className="text-xs uppercase tracking-widest text-zinc-500 hover:text-white">← Programação</a>

      <div className="mt-6 grid lg:grid-cols-5 gap-8">
        {/* Image / info */}
        <div className="lg:col-span-3">
          <div className="aspect-[3/4] sm:aspect-[4/5] max-h-[min(70vh,520px)] mx-auto sm:mx-0 rounded-3xl overflow-hidden bg-zinc-950 mb-6 border border-white/10">
            {event.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={event.imageUrl}
                alt={event.title}
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="h-full flex items-center justify-center text-7xl">🎟️</div>
            )}
          </div>

          <h1 className="text-4xl font-semibold tracking-[-1.5px] mb-3">{event.title}</h1>

          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-zinc-400 mb-6">
            <div className="flex items-center gap-2"><Calendar className="w-4 h-4" /> {formatDate(event.date)}</div>
            <div className="flex items-center gap-2"><Clock className="w-4 h-4" /> Abre às {event.openTime || '20:00'}</div>
            <div className="flex items-center gap-2"><MapPin className="w-4 h-4" /> {event.address}</div>
          </div>

          <div
            className="event-description"
            dangerouslySetInnerHTML={{ __html: event.description || '' }}
          />

          {/* Aviso legal + prazo de vendas — bloco único, discreto */}
          <div className="mt-8 pt-5 border-t border-white/10 space-y-1.5">
            <p className="text-xs text-zinc-500 leading-relaxed">
              {getEventFooterNotice(event.footerNotice)}
            </p>
            {event.salesDeadline && (
              <p className="text-xs text-zinc-600">
                Vendas até {new Date(event.salesDeadline).toLocaleString('pt-BR', {
                  timeZone: 'America/Maceio',
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            )}
          </div>
        </div>

        {/* Ticket selector + purchase */}
        <div className="lg:col-span-2">
          <div className="card p-6 sticky top-20">
            <div className="uppercase text-xs tracking-[2px] text-emerald-400 mb-1">INGRESSOS</div>
            <div className="text-base font-medium mb-5 tracking-tight text-zinc-300">
              Escolha a quantidade
            </div>

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
