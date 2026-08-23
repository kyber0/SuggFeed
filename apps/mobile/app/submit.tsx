import { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { submitFeedback } from "../lib/feedback-api";

/* ── Design tokens — match web exactly ── */
const C = {
  navy:    "#0b3857",
  accent:  "#e86e4a",
  sky:     "#e9f2f7",
  bg:      "#f4f8fa",
  surface: "#ffffff",
  line:    "#e8eff4",
  line2:   "#bcccdc",
  ink:     "#102a43",
  ink2:    "#243b53",
  muted:   "#627d98",
  muted2:  "#9aacbb",
  success: "#11845b",
  warn:    "#9c6500",
  error:   "#9b341f",
} as const;

/* Category definitions — same icons/labels as web CategoryPicker */
const CATEGORIES: Array<{ label: string; icon: string }> = [
  { label: "Facilities",   icon: "🏢" },
  { label: "Learning",     icon: "📖" },
  { label: "Safety",       icon: "🛡" },
  { label: "Student life", icon: "🎉" },
  { label: "Other",        icon: "💡" },
];

const MIN_TITLE = 8;
const MIN_DESC  = 20;

/* ── Char counter — matches web .char-counter ── */
function CharCounter({ value, max }: { value: string; max: number }) {
  const ratio = value.length / max;
  const color = ratio >= 1 ? C.error : ratio >= 0.8 ? C.warn : C.muted2;
  return <Text style={[s.charCount, { color }]}>{value.length} / {max}</Text>;
}

export default function SubmitScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = (Platform.OS === "ios" ? 84 : 64) + insets.bottom;

  const [title, setTitle]           = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory]     = useState(CATEGORIES[0].label);
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [consent, setConsent]       = useState(false);
  const [busy, setBusy]             = useState(false);

  async function handleSubmit() {
    if (title.trim().length < MIN_TITLE) {
      Alert.alert("Title too short", `Please write at least ${MIN_TITLE} characters.`); return;
    }
    if (description.trim().length < MIN_DESC) {
      Alert.alert("More detail needed", `Please write at least ${MIN_DESC} characters.`); return;
    }
    if (!consent) {
      Alert.alert("Consent required", "Please accept the privacy notice before submitting."); return;
    }
    setBusy(true);
    try {
      const result = await submitFeedback({
        title: title.trim(), description: description.trim(),
        category, isAnonymous, consent: true,
        attachments: [], turnstileToken: "MOBILE_APP_SUBMISSION",
      });
      const trackingMsg = result.trackingCode
        ? `\n\nYour tracking code:\n${result.trackingCode}\n\nSave it to check progress later.`
        : "";
      Alert.alert(
        "Submitted!",
        `Thank you for speaking up. Your feedback has been sent for review.${trackingMsg}`,
        [{ text: "Done", onPress: () => router.back() }]
      );
    } catch (error) {
      Alert.alert("Submission failed", error instanceof Error ? error.message : "Please try again.");
    } finally { setBusy(false); }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView style={s.root} contentContainerStyle={[s.content, { paddingBottom: tabBarHeight }]} keyboardShouldPersistTaps="handled">

        {/* Card — mirrors web .card */}
        <View style={s.card}>
          {/* form-head */}
          <View style={s.formHead}>
            <View style={{ flex: 1 }}>
              <Text style={s.cardTitle}>What would you like to improve?</Text>
              <Text style={s.cardSubtitle}>Be constructive and avoid including personal or sensitive information.</Text>
            </View>
            <View style={s.onlineBadge}>
              <Text style={s.onlineBadgeText}>● Online</Text>
            </View>
          </View>

          {/* Category — mirrors web .category-picker 5-column grid */}
          <Text style={s.fieldLabel}>Category</Text>
          <View style={s.categoryGrid}>
            {CATEGORIES.map((c) => {
              const active = category === c.label;
              return (
                <Pressable
                  key={c.label}
                  style={[s.catBtn, active && s.catBtnActive]}
                  onPress={() => setCategory(c.label)}
                >
                  <Text style={s.catIcon}>{c.icon}</Text>
                  <Text style={[s.catLabel, active && s.catLabelActive]}>{c.label}</Text>
                </Pressable>
              );
            })}
          </View>

          {/* Short title */}
          <View style={s.field}>
            <Text style={s.fieldLabel}>Short title</Text>
            <TextInput
              style={s.input}
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. Add benches near the science building"
              placeholderTextColor={C.muted2}
              maxLength={120}
              returnKeyType="next"
            />
            <CharCounter value={title} max={120} />
          </View>

          {/* Tell us more */}
          <View style={s.field}>
            <Text style={s.fieldLabel}>Tell us more</Text>
            <TextInput
              style={[s.input, s.textarea]}
              value={description}
              onChangeText={setDescription}
              placeholder="What is happening, who is affected, and what change would help?"
              placeholderTextColor={C.muted2}
              maxLength={2000}
              multiline
              textAlignVertical="top"
            />
            <CharCounter value={description} max={2000} />
          </View>

          {/* Anonymous toggle — mirrors web .switch-row */}
          <View style={s.switchRow}>
            <Switch
              value={isAnonymous}
              onValueChange={setIsAnonymous}
              trackColor={{ true: C.success, false: C.line2 }}
              thumbColor={C.surface}
              style={{ flexShrink: 0 }}
            />
            <View style={{ flex: 1 }}>
              <Text style={s.switchLabel}>Submit anonymously</Text>
              <Text style={s.switchHint}>
                {isAnonymous
                  ? "Your name won't be attached. Save the tracking code shown after submitting."
                  : "Sign in is required for account-linked updates."}
              </Text>
            </View>
          </View>

          {/* Consent — mirrors web .consent-row */}
          <Pressable style={s.consentRow} onPress={() => setConsent((v) => !v)}>
            <View style={[s.checkbox, consent && s.checkboxChecked]}>
              {consent && <Text style={s.checkmark}>✓</Text>}
            </View>
            <Text style={s.consentText}>
              I understand what is stored: my feedback, optional files, status history, and either a private tracking hash or my signed-in account.
            </Text>
          </Pressable>

          {/* Submit button — mirrors web .btn-primary */}
          <Pressable
            style={[s.btnPrimary, busy && s.btnDisabled]}
            onPress={handleSubmit}
            disabled={busy}
          >
            <Text style={s.btnPrimaryText}>{busy ? "Sending…" : "Send for review →"}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/* ── Styles ── */
const cardShadow = Platform.select({
  ios:     { shadowColor: "#000", shadowOpacity: 0.07, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
  android: { elevation: 3 },
}) ?? {};

const inputShadow = Platform.select({
  ios:     { shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
  android: { elevation: 1 },
}) ?? {};

const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: C.bg },
  content: { padding: 20, paddingBottom: 48 },

  /* Card — mirrors web .card */
  card: {
    backgroundColor: C.surface, borderRadius: 20,
    borderWidth: 1, borderColor: C.line,
    padding: 20, ...cardShadow,
  },

  /* form-head */
  formHead: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 20 },
  cardTitle: { fontSize: 18, fontWeight: "700", color: C.ink, marginBottom: 4 },
  cardSubtitle: { fontSize: 13, color: C.muted, lineHeight: 18 },
  onlineBadge: { backgroundColor: "#e8f8ef", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  onlineBadgeText: { fontSize: 11, fontWeight: "600", color: C.success },

  /* Category picker — mirrors web .category-picker */
  categoryGrid: { flexDirection: "row", gap: 8, marginTop: 8, marginBottom: 4 },
  catBtn: {
    flex: 1, alignItems: "center", gap: 5, paddingVertical: 10,
    borderWidth: 1.5, borderColor: C.line2, borderRadius: 12,
    backgroundColor: C.surface, ...inputShadow,
  },
  catBtnActive: {
    borderColor: C.navy, backgroundColor: C.sky,
    ...Platform.select({ ios: { shadowColor: C.navy, shadowOpacity: 0.12, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } }, android: { elevation: 3 } }),
  },
  catIcon: { fontSize: 18 },
  catLabel: { fontSize: 9, fontWeight: "600", color: C.muted, textAlign: "center" },
  catLabelActive: { color: C.navy },

  /* Fields */
  field: { marginTop: 20 },
  fieldLabel: { fontSize: 13, fontWeight: "700", color: C.ink2, marginBottom: 8 },

  /* Input — mirrors web input styles */
  input: {
    borderWidth: 1.5, borderColor: C.line2, borderRadius: 10,
    padding: 12, fontSize: 16, color: C.ink,
    backgroundColor: C.surface, ...inputShadow,
  },
  textarea: { height: 130, textAlignVertical: "top" },
  charCount: { fontSize: 11, textAlign: "right", marginTop: 4 },

  /* Switch row — mirrors web .switch-row */
  switchRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    marginTop: 20, padding: 14,
    backgroundColor: C.bg, borderRadius: 10, borderWidth: 1, borderColor: C.line,
  },
  switchLabel: { fontSize: 14, fontWeight: "600", color: C.ink },
  switchHint: { fontSize: 12, color: C.muted, marginTop: 2, lineHeight: 16 },

  /* Consent row — mirrors web .consent-row */
  consentRow: { flexDirection: "row", gap: 10, marginTop: 14, alignItems: "flex-start" },
  checkbox: {
    width: 20, height: 20, borderWidth: 1.5, borderColor: C.line2,
    borderRadius: 4, alignItems: "center", justifyContent: "center",
    backgroundColor: C.surface, flexShrink: 0, marginTop: 1,
  },
  checkboxChecked: { backgroundColor: C.navy, borderColor: C.navy },
  checkmark: { color: C.surface, fontSize: 11, fontWeight: "800" },
  consentText: { flex: 1, fontSize: 13, color: C.muted, lineHeight: 18 },

  /* btn-primary — mirrors web .btn-primary */
  btnPrimary: {
    marginTop: 24, backgroundColor: C.accent, borderRadius: 12, padding: 16,
    alignItems: "center",
    ...Platform.select({ ios: { shadowColor: C.accent, shadowOpacity: 0.4, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } }, android: { elevation: 6 } }),
  },
  btnDisabled: { opacity: 0.6 },
  btnPrimaryText: { color: C.surface, fontWeight: "700", fontSize: 16 },
});
