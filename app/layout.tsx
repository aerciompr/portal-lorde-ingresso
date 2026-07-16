import type { Metadata } from "next";
import { Geist, Geist_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";
import Header from "@/components/Header";
import SiteFooter from "@/components/SiteFooter";
import SiteChrome from "@/components/SiteChrome";
import { getAppSettings } from "@/lib/settings";
import { absoluteMediaUrl, mimeFromUrl } from "@/lib/media-url";
import { waHrefFromE164 } from "@/lib/contact";
import { parseFooterLayout } from "@/lib/footer-layout";
import SiteTracking from "@/components/SiteTracking";

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

  // Contato: só o que está em Admin → Contato (sem número hardcodado)
  const waDisplay = (s.contact?.whatsappDisplay || "").trim();
  const waHref = waHrefFromE164(s.contact?.whatsappE164 || "");
  const showWhatsApp = Boolean(s.contact?.showWhatsApp && (waHref || waDisplay));
  const contactEmail =
    s.contact?.contactEmail || "contato@lordenelson.com.br";
  const instagramUrl = (s.contact?.instagramUrl || "").trim();

  const footerLayout = parseFooterLayout(b.footerLayout, {
    left: b.footerLeft,
    right: b.footerRight,
    year,
    siteName,
  });

  const initialBranding = {
    siteName: b.siteName,
    logoUrl: (b.logoUrl || "").trim() || "/logo-lordenelson.jpg",
    faviconUrl: (b.faviconUrl || "").trim(),
  };

  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} ${spaceGrotesk.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-zinc-950 text-zinc-200">
        <SiteChrome
          header={
            <Header
              initialBranding={initialBranding}
              whatsappDisplay={waDisplay}
              whatsappHref={waHref}
              showWhatsApp={showWhatsApp}
            />
          }
          footer={
            <SiteFooter
              layout={footerLayout}
              contact={{
                siteName,
                logoUrl: (b.logoUrl || "").trim() || "/logo-lordenelson.jpg",
                year,
                whatsappDisplay: waDisplay,
                whatsappHref: waHref,
                instagramUrl,
                contactEmail,
              }}
            />
          }
        >
          {children}
        </SiteChrome>

        <Toaster position="top-center" richColors closeButton />

        {/* Pixels + scripts (Admin → Configurações → Marketing) */}
        <SiteTracking tracking={s.tracking} />
      </body>
    </html>
  );
}
