"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-destructive/10">
        <AlertTriangle className="size-7 text-destructive" aria-hidden />
      </div>
      <h1 className="text-lg font-semibold">Something went wrong</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        The page could not be loaded. Your data is safe. Try again, and if it keeps happening check the server logs.
      </p>
      {error.digest ? <p className="text-xs text-muted-foreground">Ref: {error.digest}</p> : null}
      <Button size="lg" onClick={() => retry()}>
        Try again
      </Button>
    </main>
  );
}
