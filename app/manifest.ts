import type { MetadataRoute } from "next";
import { APP_NAME } from "@/lib/constants";

export default function manifest(): MetadataRoute.Manifest {
  const themeColor = process.env.NEXT_PUBLIC_THEME_COLOR || "#0f766e";
  return {
    name: APP_NAME,
    short_name: "Expenses",
    description: "Personal expense, trading and lending tracker.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: themeColor,
    lang: "en",
    categories: ["finance", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      {
        name: "Add Expense",
        short_name: "Expense",
        url: "/transactions/new?type=EXPENSE",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Add Income",
        short_name: "Income",
        url: "/transactions/new?type=INCOME",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Transfer",
        short_name: "Transfer",
        url: "/transactions/new?type=TRANSFER",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
    ],
  };
}
