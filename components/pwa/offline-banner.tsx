"use client";

import { useOffline } from "next/offline";
import { WifiOff } from "lucide-react";

export function OfflineBanner() {
  const isOffline = useOffline();
  if (!isOffline) return null;
  return (
    <div
      role="status"
      className="pt-safe sticky top-0 z-50 flex items-center justify-center gap-2 bg-loan px-4 py-1.5 text-xs font-medium text-black"
    >
      <WifiOff className="size-3.5" aria-hidden />
      You are offline. Changes will be sent when you reconnect.
    </div>
  );
}
