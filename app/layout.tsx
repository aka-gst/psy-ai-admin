import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Демо AI-администратора",
  description: "Безопасный AI-администратор для открытой информации психологического центра.",
  openGraph: {
    title: "AI-администратор для вопросов о центре",
    description: "Демо по открытым страницам: навигация, безопасные границы и ссылки на официальный сайт.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "AI-администратор для вопросов о центре" }],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/og.png"],
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

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
