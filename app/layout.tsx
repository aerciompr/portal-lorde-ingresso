import type { Metadata } from "next";
import { Geist, Geist_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";
import Header from "@/components/Header";
import { getAppSettings } from "@/lib/settings";
import { absoluteMediaUrl, mimeFromUrl } from "@/lib/media-url";
import { WHATSAPP_DISPLAY, WHATSAPP_HREF } from "@/lib/contact";

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

  const footerLeft = (b.footerLeft || "").replace(
    "{year}",
    new Date().getFullYear().toString()
  );
  const footerRight = (b.footerRight || "").replace(
    "{year}",
    new Date().getFullYear().toString()
  );

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

        <footer className="border-t border-white/10 py-10 text-xs text-zinc-500">
          <div className="max-w-6xl mx-auto px-6 grid md:grid-cols-2 gap-y-4 gap-x-6 items-start">
            <div
              dangerouslySetInnerHTML={{
                __html:
                  footerLeft ||
                  `Lorde Nelson Rest Pub • Rua Silvério Jorge, 241, Jaraguá — Maceió/AL<br/>Qui a Sáb • 20h às 02h`,
              }}
            />
            <div className="md:text-right space-y-3">
              <div
                dangerouslySetInnerHTML={{
                  __html:
                    footerRight ||
                    `© ${new Date().getFullYear()} ${siteName}. Portal moderno de ingressos.`,
                }}
              />
              <a
                href={WHATSAPP_HREF}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm text-[#25D366] hover:text-[#3be07a] transition md:justify-end"
                aria-label={`WhatsApp ${WHATSAPP_DISPLAY}`}
              >
                <i className="fa-brands fa-whatsapp text-xl leading-none" aria-hidden />
                <span className="text-zinc-400 hover:text-zinc-200">{WHATSAPP_DISPLAY}</span>
              </a>
            </div>
          </div>
        </footer>

        <Toaster position="top-center" richColors closeButton />
      </body>
    </html>
  );
}
