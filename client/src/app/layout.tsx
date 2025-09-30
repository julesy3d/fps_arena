import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { SocketInitializer } from "@/components/SocketInitializer"; // <-- IMPORT

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "The Coliseum",
  description: "A multiplayer FPS arena",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <SocketInitializer /> {/* <-- ADD COMPONENT HERE */}
        {children}
      </body>
    </html>
  );
}