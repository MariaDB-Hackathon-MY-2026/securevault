import type { Metadata } from "next";
import { Geist, Geist_Mono, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import {Provider} from "@/app/providers";
import { Toaster } from "@/components/ui/sonner";

const jetbrainsMono = JetBrains_Mono({subsets:['latin'],variable:'--font-mono'});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "SecureVault",
    template: "%s | SecureVault",
  },
  description: "SecureVault is a secure file-storage workspace for encrypted uploads, governed sharing, lifecycle controls, and optional semantic search.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cn("font-mono", jetbrainsMono.variable)}>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
      <Provider>
            {children}
            <Toaster />
      </Provider>
      </body>
    </html>
  );
}
