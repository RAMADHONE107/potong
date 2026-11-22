import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Potong — studio klip pendek otomatis",
  description:
    "Ubah video panjang jadi banyak klip siap unggah. Pilih momen terbaik, gaya subtitle, dan caption campaign dalam satu workspace. Gratis, tanpa watermark.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Anton&family=Space+Grotesk:wght@400;500;700&family=Syne:wght@600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
