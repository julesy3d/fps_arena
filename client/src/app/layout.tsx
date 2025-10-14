import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import { SocketInitializer } from "@/components/SocketInitializer";
import { WalletContextProvider } from "@/components/WalletContextProvider";

export const metadata: Metadata = {
  title: "PotShot.gg",
  description: "A multiplayer FPS arena",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head />
      <body suppressHydrationWarning>
        <WalletContextProvider>
          <SocketInitializer />
          {children}
        </WalletContextProvider>
      </body>
    </html>
  );
}