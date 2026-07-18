// Trigger rebuild to pick up new environment variables on Vercel
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
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: "SellerPlus - AI Commerce Operating System for Modern Sellers",
  description: "Manage Amazon, Flipkart, Meesho, and Shopify with real-time analytics, AI Listing Judges, keyword intelligence, and warehouse sync.",
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
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `window.__SUPABASE_CONFIG__ = {
              url: ${JSON.stringify(process.env.NEXT_PUBLIC_SUPABASE_URL)},
              anonKey: ${JSON.stringify(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)}
            };`
          }}
        />
      </head>
      <body className={`${inter.variable} font-sans antialiased bg-[#050506] text-[#f4f4f5]`}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
