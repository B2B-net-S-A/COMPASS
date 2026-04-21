import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { AmbientGlow } from "@/components/ui/AmbientGlow";
import { Toaster } from "sonner";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "ComPass",
  description: "Consultant Management Platform & Success System",
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pl" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('compass-theme'),c={inframinds:'#3A8DFF',qualrix:'#10B981',b2bnetwork:'#f43a48'};if(t==='qualrix')document.documentElement.classList.add('theme-qualrix');else if(t==='b2bnetwork')document.documentElement.classList.add('theme-b2bnetwork');var col=c[t]||c.inframinds,s='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32"><polygon points="16,1 29.86,8.5 29.86,23.5 16,31 2.14,23.5 2.14,8.5" fill="none" stroke="'+col+'" stroke-width="2" stroke-linejoin="round"/><circle cx="16" cy="16" r="2.5" fill="'+col+'"/></svg>',l=document.querySelector('link[rel="icon"]');if(l)l.href='data:image/svg+xml,'+encodeURIComponent(s);}catch(e){}})()` }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        suppressHydrationWarning
      >
        <AmbientGlow />
        {children}
        <Toaster richColors position="bottom-right" />
      </body>
    </html>
  );
}
