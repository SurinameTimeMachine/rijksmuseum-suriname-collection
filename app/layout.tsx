import './globals.css';
import type { Metadata } from 'next';
import { Lora, Nunito } from 'next/font/google';

const nunito = Nunito({
  variable: '--font-nunito',
  subsets: ['latin'],
  display: 'swap',
});

const lora = Lora({
  variable: '--font-lora',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Rijksmuseum Suriname Collection',
    template: '%s — Rijksmuseum Suriname Collection',
  },
  description:
    'Explore the Suriname collection of the Rijksmuseum — paintings, prints, photographs, maps and objects connected to the colonial history of Suriname.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html suppressHydrationWarning data-scroll-behavior="smooth">
      <body
        className={`${nunito.variable} ${lora.variable} font-sans antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
