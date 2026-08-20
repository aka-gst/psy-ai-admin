import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const socialImage = new URL("/og.png", `${protocol}://${host}`).toString();
  return {
    title: "Демо AI-администратора",
    description: "Безопасный AI-администратор для открытой информации психологического центра.",
    openGraph: {
      title: "AI-администратор для вопросов о центре",
      description: "Демо по открытым страницам: навигация, безопасные границы и ссылки на официальный сайт.",
      images: [{ url: socialImage, width: 1200, height: 630, alt: "AI-администратор для вопросов о центре" }],
    },
    twitter: { card: "summary_large_image", images: [socialImage] },
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
