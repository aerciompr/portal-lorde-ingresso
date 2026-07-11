import type { Metadata } from "next";
import { Geist, Geist_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";
import Header from "@/components/Header";
import { getAppSettings } from "@/lib/settings";
import { absoluteMediaUrl, mimeFromUrl } from "@/lib/media-url";
import { WHATSAPP_DISPLAY, WHATSAPP_HREF } from "@/lib/contact";

/** Texto do admin (com \\n e •) → HTML com quebras legíveis */
function footerTextToHtml(text: string): string {
  const lines = (text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    // bullets viram linha nova (textos antigos “tudo junto com •”)
    .replace(/\s*[•·]\s*/g, "\n")
    .split("\n")
    .map((line) => line.trim());

  const parts: string[] = [];
  let blankRun = 0;
  for (const line of lines) {
    if (!line) {
      blankRun += 1;
      continue;
    }
    if (parts.length > 0) {
      // linha em branco no texto → espaço extra entre blocos
      parts.push(blankRun >= 1 ? '<br /><span class="block h-2"></span>' : "<br />");
    }
    blankRun = 0;
    parts.push(line);
  }
  return parts.join("");
}

/** Branding (logo) vem do banco — não cachear layout vazio sem logo */
export const dynamic = "force-dynamic";
export const revalidate = 0;

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export async function generateMetadata(): Promise<Metadata> {
  const s = await getAppSettings();
  const siteName = s.branding.siteName || "Lorde Nelson";
  const base =
    s.publicUrl ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://portal.lordenelson.com.br";

  // Preferência: favicon admin → logo admin → logo estática do app
  const faviconRaw = (
    s.branding.faviconUrl ||
    s.branding.logoUrl ||
    "/logo-lordenelson.jpg"
  ).trim();
  const favicon = absoluteMediaUrl(faviconRaw, base);
  const mime = mimeFromUrl(faviconRaw);

  return {
    title: `${siteName} | Ingressos`,
    description:
      "Compre ingressos para eventos no Lorde Nelson Rest Pub - Maceió. Programação, shows, forró e jogos.",
    icons: {
      icon: [
        { url: favicon, type: mime, sizes: "32x32" },
        { url: favicon, type: mime, sizes: "16x16" },
      ],
      shortcut: favicon,
      apple: favicon,
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const s = await getAppSettings();
  const b = s.branding;
  const siteName = b.siteName || "Lorde Nelson";

  const year = new Date().getFullYear().toString();
  const footerLeftRaw = (b.footerLeft || "").replace(/\{year\}/g, year).trim();
  const footerRightRaw = (b.footerRight || "").replace(/\{year\}/g, year).trim();

  const initialBranding = {
    siteName: b.siteName,
    // Sempre envia algo: admin → fallback estático (nunca some o topo)
    logoUrl: (b.logoUrl || "").trim() || "/logo-lordenelson.jpg",
    faviconUrl: (b.faviconUrl || "").trim(),
  };

  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} ${spaceGrotesk.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-zinc-950 text-zinc-200">
        <Header initialBranding={initialBranding} />

        <main className="flex-1">{children}</main>

        <footer className="border-t border-white/10 py-12 text-sm text-zinc-500">
          <div className="max-w-6xl mx-auto px-6 grid md:grid-cols-2 gap-10 md:gap-12 items-start">
            {/* Local / horário */}
            <div className="space-y-3 leading-relaxed">
              {footerLeftRaw ? (
                <div
                  className="space-y-1 [&>br]:block [&>br]:content-[''] [&>br]:mb-1.5"
                  dangerouslySetInnerHTML={{ __html: footerTextToHtml(footerLeftRaw) }}
                />
              ) : (
                <>
                  <p className="text-zinc-300 font-medium tracking-tight">{siteName} Rest Pub</p>
                  <p>
                    Rua Silvério Jorge, 241
                    <br />
                    Jaraguá — Maceió/AL
                  </p>
                  <p className="pt-1 text-zinc-500">
                    Qui a Sáb
                    <br />
                    20h às 02h
                  </p>
                </>
              )}
            </div>

            {/* Direitos + WhatsApp */}
            <div className="md:text-right space-y-4 leading-relaxed">
              {footerRightRaw ? (
                <div
                  className="space-y-1 [&>br]:block [&>br]:content-[''] [&>br]:mb-1.5"
                  dangerouslySetInnerHTML={{ __html: footerTextToHtml(footerRightRaw) }}
                />
              ) : (
                <>
                  <p>
                    © {year} {siteName}
                    <br />
                    Portal moderno de ingressos.
                  </p>
                  <p className="text-zinc-600">
                    Pagamentos via Stripe e Mercado Pago
                    <br />
                    Check-in no local
                  </p>
                </>
              )}

              <div className="pt-1 md:flex md:justify-end">
                <a
                  href={WHATSAPP_HREF}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2.5 text-sm text-[#25D366] hover:text-[#3be07a] transition"
                  aria-label={`WhatsApp ${WHATSAPP_DISPLAY}`}
                >
                  <i className="fa-brands fa-whatsapp text-xl leading-none" aria-hidden />
                  <span className="text-zinc-400 hover:text-zinc-200">{WHATSAPP_DISPLAY}</span>
                </a>
              </div>
            </div>
          </div>
        </footer>

        <Toaster position="top-center" richColors closeButton />
      </body>
    </html>
  );
}
