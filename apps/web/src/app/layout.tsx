import type { Metadata } from "next";
import { Inter, Manrope } from "next/font/google";
import { AppearanceProvider } from "@/providers/appearance-provider";
import { AuthProvider } from "@/providers/auth-provider";
import { I18nProvider } from "@/providers/i18n-provider";
import { ThemeProvider } from "@/providers/theme-provider";
import "./globals.css";

const inter = Inter({
  subsets: ["cyrillic", "latin"],
  variable: "--font-inter",
});

const manrope = Manrope({
  subsets: ["cyrillic", "latin"],
  variable: "--font-manrope",
});

export const metadata: Metadata = {
  title: "Linka",
  description: "Linka",
  icons: {
    icon: "/linka-icon.png",
    shortcut: "/linka-icon.png",
    apple: "/linka-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body className={`${inter.variable} ${manrope.variable}`}>
        <ThemeProvider>
          <AppearanceProvider>
            <I18nProvider>
              <AuthProvider>{children}</AuthProvider>
            </I18nProvider>
          </AppearanceProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
