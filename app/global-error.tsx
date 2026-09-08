"use client";

export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: 24, textAlign: "center" }}>
        <title>Something went wrong</title>
        <h1 style={{ fontSize: 20, fontWeight: 600 }}>Something went wrong</h1>
        <p style={{ color: "#64748b", maxWidth: 420, margin: "12px auto" }}>
          The app hit an unexpected error. Your data is safe.
        </p>
        {error.digest ? <p style={{ fontSize: 12, color: "#94a3b8" }}>Ref: {error.digest}</p> : null}
        <button
          onClick={() => retry()}
          style={{
            marginTop: 12,
            padding: "10px 20px",
            borderRadius: 12,
            border: "none",
            background: "#0f766e",
            color: "white",
            fontSize: 14,
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
