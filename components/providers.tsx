"use client";

import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { ServiceWorkerRegister } from "@/components/pwa/sw-register";
import { OfflineBanner } from "@/components/pwa/offline-banner";

export function Providers({ children, nonce }: { children: React.ReactNode; nonce?: string }) {
  return (
    // next-themes injects a small inline script to set the theme before paint;
    // under a nonce CSP it has to carry the same nonce or it is blocked.
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange nonce={nonce}>
      <TooltipProvider>
        <OfflineBanner />
        {children}
        <Toaster position="top-center" richColors closeButton />
        <ServiceWorkerRegister />
      </TooltipProvider>
    </ThemeProvider>
  );
}
