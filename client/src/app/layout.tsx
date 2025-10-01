import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { SocketInitializer } from "@/components/SocketInitializer";
import { WalletContextProvider } from "@/components/WalletContextProvider";

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
        <WalletContextProvider>
          <SocketInitializer />
          {children}
        </WalletContextProvider>
      </body>
    </html>
  );
}
