import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif, Newsreader } from "next/font/google";
import "katex/dist/katex.min.css";
import "./globals.css";
import { ImportsProvider } from "@/components/ImportsProvider";
import { LanguageProvider } from "@/components/LanguageProvider";
import { ThemeProvider } from "@/components/ThemeProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Solo per i nomi delle sezioni in testa alla pagina. Ha un contrasto alto
// fra pieni e sottili: regge sopra i 24px, sotto si assottiglia, quindi non
// scende nell'interfaccia.
const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

const newsreader = Newsreader({
  variable: "--font-editorial",
  subsets: ["latin"],
  style: ["normal", "italic"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Syneso — Capire, spiegare, ricordare",
  description:
    "Metodo Feynman, ripetizione dilazionata FSRS, simulazioni d'esame e appunti costruiti dalle tue dispense.",
  // I percorsi sono nuovi di proposito. I precedenti portavano «?v=3» dal
  // primo rilascio: il contenuto dei file è cambiato col marchio, l'indirizzo
  // no, e ogni browser che aveva già aperto Syneso continuava a mostrare la
  // vecchia icona presa dalla propria cache. Cambiando nome si cambia
  // indirizzo, e la cache non ha più niente da riusare.
  icons: {
    icon: [
      { url: "/brand/syneso-tab-icon.ico", sizes: "16x16 32x32 48x48" },
      { url: "/brand/syneso-tab-icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/brand/syneso-app-icon.svg", type: "image/svg+xml" },
    ],
    apple: "/brand/syneso-apple-icon.png",
    shortcut: "/brand/syneso-tab-icon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="it"
      // Lo script qui sotto cambia classe e color-scheme su questo elemento
      // prima che React idrati: è il suo mestiere, serve a non far lampeggiare
      // il bianco a chi studia di notte. React però trova l'elemento diverso
      // da come l'ha reso il server e lo segnala. La differenza è voluta e
      // riguarda solo <html>, quindi la si dichiara qui invece di rinunciare
      // allo script o di silenziare l'avviso altrove.
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable} ${newsreader.variable} h-full antialiased`}
    >
      <head>
        {/*
          Il tema va deciso prima che la pagina si disegni: React arriva dopo,
          e chi apre Syneso di notte si prenderebbe un lampo bianco in faccia a
          ogni avvio. Legge la stessa chiave di lib/shellStorage e non fa
          altro; se localStorage è negato, resta il tema del sistema.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var p=localStorage.getItem("syneso_theme");var d=p==="dark"||((!p||p==="system")&&matchMedia("(prefers-color-scheme: dark)").matches);if(d){document.documentElement.classList.add("theme-dark");document.documentElement.style.colorScheme="dark";}}catch(e){}})();`,
          }}
        />
      </head>
      <body className="flex min-h-full flex-col bg-[var(--color-canvas)] text-[var(--color-ink-900)]">
        <ThemeProvider>
          <LanguageProvider>
            <ImportsProvider>{children}</ImportsProvider>
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}