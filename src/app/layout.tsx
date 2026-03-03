import type { Metadata } from "next";

import { Providers } from "@/components/providers";

import "./globals.css";

export const metadata: Metadata = {
  title: "MuseFlow",
  description: "Spotify / YouTube Music inspired player clone",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#04030c] text-white antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
