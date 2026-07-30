import type { Metadata } from "next";
import { Fredoka, Inter } from "next/font/google";
import PlausibleProvider from "next-plausible";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const fredoka = Fredoka({
  subsets: ["latin"],
  variable: "--font-fredoka",
  display: "swap",
});

const title = "Dharmic Data Tutor | Learn something useful";
const description =
  "Learn with named web sources, complete a focused practice rep, get feedback, and return to your next step.";
const url = "https://tutor.dharmicdata.org/";

export const metadata: Metadata = {
  metadataBase: new URL(url),
  title,
  description,
  icons: {
    icon: "/favicon.ico",
  },
  openGraph: {
    images: ["/og-image.png"],
    title,
    description,
    url,
    siteName: "Dharmic Data Tutor",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    images: ["/og-image.png"],
    title,
    description,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${fredoka.variable}`}>
      <head>
        <PlausibleProvider domain="tutor.dharmicdata.org" />
      </head>
      <body>
        <a className="skip-link" href="#main">
          Skip to learning tool
        </a>
        <div className="site-shell">{children}</div>
      </body>
    </html>
  );
}
