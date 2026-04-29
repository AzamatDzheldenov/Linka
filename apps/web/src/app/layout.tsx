import type { Metadata } from "next";
import { AppearanceProvider } from "@/providers/appearance-provider";
import { AuthProvider } from "@/providers/auth-provider";
import { ThemeProvider } from "@/providers/theme-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Linka Мессенджер",
  description: "Приватный мессенджер Linka",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <AppearanceProvider>
            <AuthProvider>{children}</AuthProvider>
          </AppearanceProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
