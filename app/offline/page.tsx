import { WifiOff } from "lucide-react";
import { APP_NAME } from "@/lib/constants";

export const dynamic = "force-static";

export const metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="flex size-16 items-center justify-center rounded-2xl bg-muted">
        <WifiOff className="size-8 text-muted-foreground" aria-hidden />
      </div>
      <h1 className="text-xl font-semibold">You are offline</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        {APP_NAME} needs a connection to load your data. Reconnect and try again.
      </p>
      {/* Full reload on purpose: the client router cannot recover without the network. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a
        href="/"
        className="mt-2 inline-flex h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground"
      >
        Retry
      </a>
    </main>
  );
}
