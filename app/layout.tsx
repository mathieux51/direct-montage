import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import ErrorBoundary from "@/components/ErrorBoundary";

const antipasto = localFont({
  src: [
    {
      path: "../public/fonts/antipasto_extralight-webfont.woff2",
      weight: "200",
      style: "normal",
    },
    {
      path: "../public/fonts/antipasto_regular-webfont.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../public/fonts/antipasto_extrabold-webfont.woff2",
      weight: "800",
      style: "normal",
    },
  ],
  variable: "--font-antipasto",
  fallback: ["system-ui", "sans-serif"],
});

export const metadata: Metadata = {
  title: "Direct Montage",
  description: "Application d'édition audio avec visualisation de forme d'onde, analyse de fréquence, découpage et contrôle de gain",
  keywords: ["édition audio", "montage audio", "forme d'onde", "découpage audio", "gain audio", "visualisation audio", "editeur audio web"],
  authors: [{ name: "Direct Montage" }],
  creator: "Direct Montage",
  publisher: "Direct Montage",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  openGraph: {
    title: "Direct Montage",
    description: "Application d'édition audio avec visualisation de forme d'onde, analyse de fréquence, découpage et contrôle de gain",
    url: "https://direct-montage.vercel.app",
    siteName: "Direct Montage",
    locale: "fr_FR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Direct Montage",
    description: "Application d'édition audio avec visualisation de forme d'onde, analyse de fréquence, découpage et contrôle de gain",
    creator: "@directmontage",
  },
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  manifest: '/site.webmanifest',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body
        className={`${antipasto.variable} antialiased`}
      >
        <ErrorBoundary>
          {children}
        </ErrorBoundary>
      </body>
    </html>
  );
}
