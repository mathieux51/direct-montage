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
