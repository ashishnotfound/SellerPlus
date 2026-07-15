import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "SellerPlus - AI Commerce Operating System for Modern Sellers",
  description: "Manage Amazon, Flipkart, Meesho, and Shopify with real-time analytics, AI Listing Judges, keyword intelligence, and warehouse sync.",
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
