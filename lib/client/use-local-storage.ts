"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * A localStorage value as React state. Server render and the first client render see
 * null, then React swaps in the stored value — no hydration mismatch and no
 * setState-in-effect. Writes notify every hook reading the same key in this tab; the
 * "storage" event covers other tabs.
 */
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function useLocalStorage(key: string): [string | null, (value: string | null) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => null,
  );
  const set = useCallback(
    (next: string | null) => {
      try {
        if (next === null || next === "") window.localStorage.removeItem(key);
        else window.localStorage.setItem(key, next);
      } catch {
        /* private mode: the value just won't persist */
      }
      for (const l of listeners) l();
    },
    [key],
  );
  return [value, set];
}
