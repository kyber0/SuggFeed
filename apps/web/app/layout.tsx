import type { Metadata, Viewport } from "next";
import "./styles.css";
import { ServiceWorkerRegistrar } from "../components/service-worker";
import { AuthProvider } from "../components/auth-context";
import { ToastProvider } from "../components/toast";
import { ThemeProvider } from "../components/theme-provider";
import { MobileTabBar } from "../components/mobile-tab-bar";
import { SubmitIdeaProvider } from "../components/submit-idea-context";
import { SubmitIdeaPanel } from "../components/submit-idea-panel";

export const metadata: Metadata = {
  title: "SuggFeed",
  description: "A safer way to make your school better. Share feedback anonymously and follow its progress.",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "SuggFeed" },
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/icon-192.png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#0b3857",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body suppressHydrationWarning>
        <ThemeProvider attribute="data-theme" defaultTheme="system" enableSystem>
          <SubmitIdeaProvider>
            <AuthProvider>
              <ToastProvider>
                {children}
                <SubmitIdeaPanel turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY} />
                <MobileTabBar />
                <ServiceWorkerRegistrar />
              </ToastProvider>
            </AuthProvider>
          </SubmitIdeaProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
