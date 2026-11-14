import { cn } from "@/lib/utils";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Initials in a quiet circle. Deliberately colourless: the money carries the colour. */
export function PersonAvatar({ name, size = "md", className }: { name: string; size?: "md" | "lg"; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-muted font-semibold text-foreground/80",
        size === "lg" ? "size-14 text-lg" : "size-10 text-sm",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
