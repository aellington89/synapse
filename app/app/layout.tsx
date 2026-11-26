import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";

import { SiteHeader } from "@/components/site-header";
import { Toaster } from "@/components/ui/sonner";

import "./globals.css";

export const metadata: Metadata = {
  title: "Synapse",
  description: "A graph of the films, series, games, books, and albums you have lived with",
};

// next-themes sets the theme class on <html> before React hydrates, so <html> differs from the
// server's markup by design: hence suppressHydrationWarning, as in finance-stack.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <body className="flex min-h-full flex-col">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <SiteHeader />
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
