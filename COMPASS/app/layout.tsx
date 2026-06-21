import type { Metadata } from "next";
import { Inter, Poppins } from "next/font/google";
import "./globals.css";
import { AmbientGlow } from "@/components/ui/AmbientGlow";
import { Toaster } from "sonner";

const inter = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-inter",
  display: "swap",
});
const poppins = Poppins({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-poppins",
  display: "swap",
});

export const metadata: Metadata = {
  title: "COMPASS",
  description: "Consultant Management Platform & Success System",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/favicon.svg",
    apple: "/compass_icon_192.png",
  },
  appleWebApp: {
    capable: true,
    title: "COMPASS",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport = {
  themeColor: "#4f46e5",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pl" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var d=document.documentElement,t=localStorage.getItem('compass-theme'),m=localStorage.getItem('compass-color-mode'),dt=t==='qualrix'?'green':t==='b2bnetwork'?'rose':null,c={inframinds:'#4f46e5',qualrix:'#15803d',b2bnetwork:'#e11d48'};if(dt)d.setAttribute('data-theme',dt);if(m==='dark')d.classList.add('dark');var col=c[t]||c.inframinds,s='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32"><polygon points="16,1 29.86,8.5 29.86,23.5 16,31 2.14,23.5 2.14,8.5" fill="none" stroke="'+col+'" stroke-width="2" stroke-linejoin="round"/><circle cx="16" cy="16" r="2.5" fill="'+col+'"/></svg>',l=document.querySelector('link[rel="icon"]');if(l)l.href='data:image/svg+xml,'+encodeURIComponent(s);}catch(e){}})()` }} />
      </head>
      <body
        className={`${inter.variable} ${poppins.variable} font-sans antialiased`}
        suppressHydrationWarning
      >
        <AmbientGlow />
        {children}
        <Toaster richColors position="bottom-right" />
      </body>
    </html>
  );
}
