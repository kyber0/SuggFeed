import * as Sentry from "@sentry/react-native";
import Constants from "expo-constants";

export function initSentry() {
  const dsn =
    (Constants.expoConfig?.extra as Record<string, string> | undefined)?.sentryDsn ??
    process.env.EXPO_PUBLIC_SENTRY_DSN;

  if (!dsn) {
    console.log("[Sentry] No DSN configured — skipping init");
    return;
  }

  Sentry.init({
    dsn,
    environment: __DEV__ ? "development" : "production",
    tracesSampleRate: __DEV__ ? 1.0 : 0.1,
    enableAutoSessionTracking: true,
    // Don't capture handled promise rejections in dev — too noisy
    enableNativeNagger: false,
  });
}
