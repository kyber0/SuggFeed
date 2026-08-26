import { initSentry } from "../sentry";
initSentry();

import { Tabs } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { registerForPushNotifications } from "../lib/notifications";
import { Platform, View } from "react-native";

// Simple SVG-free icon placeholders using text — swapped to proper icons below
function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  const ICONS: Record<string, string> = {
    Feed:   focused ? "●" : "○",
    Submit: focused ? "✦" : "✧",
    Track:  focused ? "◆" : "◇",
  };
  return (
    <View style={{ width: 24, height: 24, alignItems: "center", justifyContent: "center" }}>
    </View>
  );
}

const NAV = "#0b3857";
const ACCENT = "#e86e4a";
const INACTIVE = "#6b8fa7";

export default function RootLayout() {
  useEffect(() => {
    // Silently skip if native push infra isn't ready (Expo Go / missing EAS project ID)
    void registerForPushNotifications().catch((err) =>
      console.warn("[Layout] Push registration skipped:", err)
    );
  }, []);

  return (
    <>
      <StatusBar style="light" backgroundColor="#0b3857" />
      <Tabs
        screenOptions={{
          headerStyle: {
            backgroundColor: "#0b3857",
            ...Platform.select({
              ios: { shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
              android: { elevation: 4 },
            }),
          },
          headerTintColor: "#ffffff",
          headerTitleStyle: { fontWeight: "800", fontSize: 17, letterSpacing: -0.5 },
          headerTitleAlign: "left",
          // Header title is "suggfeed" but RN doesn't support inline styled text in options easily —
          // overridden per-screen below where needed
          tabBarStyle: {
            backgroundColor: "#ffffff",
            borderTopColor: "#e8eff4",
            borderTopWidth: 1,
            height: Platform.OS === "ios" ? 84 : 64,
            paddingBottom: Platform.OS === "ios" ? 24 : 8,
            paddingTop: 8,
            ...Platform.select({
              ios: { shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: -2 } },
              android: { elevation: 8 },
            }),
          },
          tabBarActiveTintColor: "#0b3857",
          tabBarInactiveTintColor: "#627d98",
          tabBarLabelStyle: { fontSize: 11, fontWeight: "700" },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "SuggFeed",
            tabBarLabel: "Ideas",
            tabBarIcon: ({ focused, color }) => (
              <View style={{
                width: 28, height: 28, borderRadius: 8,
                backgroundColor: focused ? "#e9f2f7" : "transparent",
                alignItems: "center", justifyContent: "center",
              }}>
                {/* Newspaper / feed icon drawn with views */}
                <View style={{ gap: 3 }}>
                  <View style={{ width: 16, height: 2, backgroundColor: color, borderRadius: 1 }} />
                  <View style={{ width: 12, height: 2, backgroundColor: color, borderRadius: 1 }} />
                  <View style={{ width: 14, height: 2, backgroundColor: color, borderRadius: 1 }} />
                </View>
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="submit"
          options={{
            title: "Share Feedback",
            tabBarLabel: "Submit",
            tabBarIcon: ({ focused, color }) => (
              <View style={{
                width: 44, height: 32, borderRadius: 20,
                backgroundColor: focused ? ACCENT : "#f0f4f8",
                alignItems: "center", justifyContent: "center",
                marginBottom: 2,
                ...Platform.select({
                  ios: { shadowColor: ACCENT, shadowOpacity: focused ? 0.4 : 0, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
                  android: { elevation: focused ? 4 : 0 },
                }),
              }}>
                {/* Plus icon */}
                <View style={{ alignItems: "center", justifyContent: "center" }}>
                  <View style={{ width: 14, height: 2, backgroundColor: focused ? "white" : color, borderRadius: 1, position: "absolute" }} />
                  <View style={{ width: 2, height: 14, backgroundColor: focused ? "white" : color, borderRadius: 1 }} />
                </View>
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="track"
          options={{
            title: "Track Submission",
            tabBarLabel: "Track",
            tabBarIcon: ({ focused, color }) => (
              <View style={{
                width: 28, height: 28, borderRadius: 8,
                backgroundColor: focused ? "#e9f2f7" : "transparent",
                alignItems: "center", justifyContent: "center",
              }}>
                {/* Search / magnifier icon */}
                <View>
                  <View style={{
                    width: 14, height: 14, borderRadius: 7,
                    borderWidth: 2, borderColor: color,
                  }} />
                  <View style={{
                    position: "absolute", width: 2, height: 6,
                    backgroundColor: color, borderRadius: 1,
                    top: 11, left: 10, transform: [{ rotate: "45deg" }],
                  }} />
                </View>
              </View>
            ),
          }}
        />
      </Tabs>
    </>
  );
}
