import type { Metadata } from "next";
import { Geist, Geist_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";
import Header from "@/components/Header";
import { getAppSettings } from "@/lib/settings";
import { absoluteMediaUrl, mimeFromUrl } from "@/lib/media-url";

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

  // Preferência: favicon do admin; fallback logo; depois ico do app
  const faviconRaw =
    s.branding.faviconUrl ||
    s.branding.logoUrl ||
    "/favicon.ico";
  const favicon = absoluteMediaUrl(faviconRaw, base);
  const mime = mimeFromUrl(faviconRaw);

  return {
    title: `${siteName} | Ingressos`,
    description:
      "Compre ingressos para eventos no Lorde Nelson Rest Pub - Maceió. Programação, shows, forró e jogos.",
    // PNG/JPG/ICO — type explícito para o navegador não exigir só .ico
    icons: {
      icon: [{ url: favicon, type: mime, sizes: "any" }],
      shortcut: [{ url: favicon, type: mime }],
      apple: [{ url: favicon, type: mime }],
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
    logoUrl: b.logoUrl || "",
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
          <div className="max-w-6xl mx-auto px-6 grid md:grid-cols-2 gap-y-4">
            <div
              dangerouslySetInnerHTML={{
                __html:
                  footerLeft ||
                  `Lorde Nelson Rest Pub • Rua Silvério Jorge, 241, Jaraguá — Maceió/AL<br/>Qui a Sáb • 20h às 02h`,
              }}
            />
            <div
              className="md:text-right"
              dangerouslySetInnerHTML={{
                __html:
                  footerRight ||
                  `© ${new Date().getFullYear()} ${siteName}. Portal moderno de ingressos.`,
              }}
            />
          </div>
        </footer>

        <Toaster position="top-center" richColors closeButton />
      </body>
    </html>
  );
}
