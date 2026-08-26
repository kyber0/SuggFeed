import { Platform } from "react-native";
import { supabase } from "./supabase";

// Expo notifications requires native modules that may not be available in
// Expo Go without a configured EAS project. We lazy-require to avoid crashes.
let Notifications: typeof import("expo-notifications") | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Notifications = require("expo-notifications");
  Notifications!.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
} catch {
  console.warn("[Notifications] expo-notifications native module unavailable — push disabled.");
}

/**
 * Requests push permission and registers the Expo push token with the backend.
 * Called once from the root layout. Silently no-ops if push infra isn't ready.
 */
export async function registerForPushNotifications(): Promise<void> {
  if (!Notifications) return;

  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "SuggFeed",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
      });
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") {
      console.log("[Notifications] Permission not granted — skipping token registration");
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const projectId = (require("expo-constants").default?.expoConfig?.extra?.eas?.projectId ?? "") as string;
    const isRealProjectId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId);
    if (!isRealProjectId) {
      console.log("[Notifications] EAS projectId not configured — skipping push token");
      return;
    }

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
    const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";
    await fetch(`${supabaseUrl}/functions/v1/register-push-token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ expoPushToken: token }),
    });
    console.log("[Notifications] Push token registered:", token);
  } catch (error) {
    console.warn("[Notifications] Registration failed (non-fatal):", error);
  }
}
