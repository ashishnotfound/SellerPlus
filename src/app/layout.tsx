import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const viewport: Viewport = {
  themeColor: "#0d0e10",
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: {
    default: "SellerPlus — AI Seller Operating System",
    template: "%s · SellerPlus",
  },
  description: "Manage Amazon, Flipkart, Meesho, and Shopify with real-time analytics, AI Listing Judges, keyword intelligence, and warehouse sync.",
  applicationName: "SellerPlus",
  authors: [{ name: "ReyoStudio" }],
  creator: "ReyoStudio",
  publisher: "ReyoStudio",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "SellerPlus",
  },
  icons: {
    icon: "/favicon.png",
    shortcut: "/favicon.png",
    apple: "/android-chrome-192x192.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} font-sans antialiased bg-[#050506] text-[#f4f4f5]`}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
