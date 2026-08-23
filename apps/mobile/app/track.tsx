import { useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { lookupTrackingCode } from "../lib/feedback-api";

/* ── Design tokens — match web exactly ── */
const C = {
  navy:       "#0b3857",
  accent:     "#e86e4a",
  sky:        "#e9f2f7",
  bg:         "#f4f8fa",
  surface:    "#ffffff",
  line:       "#e8eff4",
  line2:      "#bcccdc",
  ink:        "#102a43",
  ink2:       "#243b53",
  muted:      "#627d98",
  muted2:     "#9aacbb",
  success:    "#19724e",
  successBg:  "#e8f8ef",
  warn:       "#9c6500",
  warnBg:     "#fff4dc",
  resolved:   "#46677e",
  resolvedBg: "#e9f2f7",
  error:      "#9b341f",
  errorBg:    "#fff3f1",
} as const;

type TimelineEntry = { new_status: string; note: string | null; created_at: string };

function readableStatus(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/* Status step order — matches web StatusStepper */
const STEPS = ["pending", "approved", "in_progress", "resolved"] as const;

const STATUS_MAP: Record<string, { bg: string; text: string }> = {
  pending:     { bg: "#fff9ec", text: C.warn },
  approved:    { bg: C.successBg, text: C.success },
  in_progress: { bg: C.warnBg, text: C.warn },
  resolved:    { bg: C.resolvedBg, text: C.resolved },
  rejected:    { bg: C.errorBg, text: C.error },
};

/* ── Status stepper — mirrors web .status-stepper ── */
function StatusStepper({ status }: { status: string }) {
  const currentIdx = STEPS.indexOf(status as typeof STEPS[number]);
  return (
    <View style={s.stepper}>
      {STEPS.map((step, i) => {
        const done   = i < currentIdx || (status !== "rejected" && i <= currentIdx);
        const active = i === currentIdx && status !== "rejected";
        const isLast = i === STEPS.length - 1;
        return (
          <View key={step} style={s.stepWrap}>
            {/* Connector line before dot */}
            {i > 0 && (
              <View style={[s.stepConnector, i <= currentIdx && status !== "rejected" && s.stepConnectorDone]} />
            )}
            <View style={[s.stepDot, done && s.stepDotDone, active && !done && s.stepDotActive]}>
              {done && <Text style={s.stepCheck}>✓</Text>}
            </View>
            <Text style={[s.stepLabel, (done || active) && s.stepLabelActive]}>
              {readableStatus(step)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

/* ── Screen ── */
export default function TrackScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = (Platform.OS === "ios" ? 84 : 64) + insets.bottom;

  const [code, setCode]         = useState("");
  const [loading, setLoading]   = useState(false);
  const [status, setStatus]     = useState("");
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [error, setError]       = useState("");

  async function lookup() {
    if (!code.trim()) return;
    setLoading(true); setStatus(""); setTimeline([]); setError("");
    try {
      const result = await lookupTrackingCode(code.trim().toUpperCase());
      setStatus(result.status ?? "");
      setTimeline(result.timeline ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not look up that code.");
    } finally { setLoading(false); }
  }

  const statusStyle = STATUS_MAP[status] ?? STATUS_MAP.pending;

  return (
    <ScrollView style={s.root} contentContainerStyle={[s.content, { paddingBottom: tabBarHeight }]} keyboardShouldPersistTaps="handled">

      {/* Card — mirrors web .card on Track tab */}
      <View style={s.card}>
        <Text style={s.cardTitle}>Check on your feedback</Text>
        <Text style={s.cardSubtitle}>
          Enter the private tracking code shown after an anonymous submission.
        </Text>

        {/* Tracking code input */}
        <View style={s.field}>
          <Text style={s.fieldLabel}>Tracking code</Text>
          <TextInput
            style={s.input}
            value={code}
            onChangeText={(v) => setCode(v.toUpperCase())}
            placeholder="e.g. CV-ABCDEF1234…"
            placeholderTextColor={C.muted2}
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={lookup}
          />
        </View>

        {/* btn-primary — mirrors web .btn-primary */}
        <Pressable
          style={[s.btnPrimary, loading && s.btnDisabled]}
          onPress={lookup}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color={C.surface} />
            : <Text style={s.btnPrimaryText}>Check status →</Text>}
        </Pressable>
      </View>

      {/* Error box */}
      {error !== "" && (
        <View style={s.errorBox}>
          <Text style={s.errorText}>{error}</Text>
        </View>
      )}

      {/* Status result */}
      {status !== "" && (
        <>
          {/* Status badge — mirrors web StatusStepper header */}
          <View style={[s.statusBox, { backgroundColor: statusStyle.bg }]}>
            <Text style={s.statusLabel}>Current status</Text>
            <Text style={[s.statusValue, { color: statusStyle.text }]}>
              {readableStatus(status)}
            </Text>
          </View>

          {/* Step progress — mirrors web .status-stepper */}
          {status !== "rejected" && <StatusStepper status={status} />}

          {/* Timeline — mirrors web .timeline */}
          {timeline.length > 0 && (
            <View style={s.timeline}>
              <Text style={s.timelineTitle}>Status history</Text>
              {timeline.map((entry, index) => (
                <View key={entry.created_at} style={s.timelineItem}>
                  {/* Left column: dot + line */}
                  <View style={s.timelineLeft}>
                    <View style={s.timelineDot} />
                    {index < timeline.length - 1 && <View style={s.timelineLine} />}
                  </View>
                  {/* Content */}
                  <View style={s.timelineContent}>
                    <Text style={s.timelineStatus}>{readableStatus(entry.new_status)}</Text>
                    <Text style={s.timelineDate}>
                      {new Date(entry.created_at).toLocaleString()}
                    </Text>
                    {entry.note && (
                      <Text style={s.timelineNote}>{entry.note}</Text>
                    )}
                  </View>
                </View>
              ))}
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

/* ── Styles ── */
const cardShadow = Platform.select({
  ios:     { shadowColor: "#000", shadowOpacity: 0.07, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
  android: { elevation: 3 },
}) ?? {};

const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: C.bg },
  content: { padding: 20, paddingBottom: 48 },

  /* Card */
  card: {
    backgroundColor: C.surface, borderRadius: 20,
    borderWidth: 1, borderColor: C.line,
    padding: 20, ...cardShadow,
  },
  cardTitle:    { fontSize: 18, fontWeight: "700", color: C.ink, marginBottom: 6 },
  cardSubtitle: { fontSize: 13, color: C.muted, lineHeight: 18 },

  /* Field */
  field: { marginTop: 20 },
  fieldLabel: { fontSize: 13, fontWeight: "700", color: C.ink2, marginBottom: 8 },
  input: {
    borderWidth: 1.5, borderColor: C.line2, borderRadius: 10,
    padding: 12, fontSize: 16, color: C.ink, letterSpacing: 1.2,
    backgroundColor: C.surface,
    ...Platform.select({ ios: { shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } }, android: { elevation: 1 } }),
  },

  /* btn-primary */
  btnPrimary: {
    marginTop: 24, backgroundColor: C.navy, borderRadius: 12, padding: 15,
    alignItems: "center",
    ...Platform.select({ ios: { shadowColor: C.navy, shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } }, android: { elevation: 5 } }),
  },
  btnDisabled: { opacity: 0.6 },
  btnPrimaryText: { color: C.surface, fontWeight: "700", fontSize: 16 },

  /* Error */
  errorBox: {
    marginTop: 16, padding: 14,
    backgroundColor: C.errorBg, borderRadius: 10,
    borderLeftWidth: 3, borderLeftColor: C.error,
  },
  errorText: { color: C.error, fontSize: 14, lineHeight: 20 },

  /* Status box */
  statusBox: { marginTop: 20, padding: 20, borderRadius: 14, ...cardShadow },
  statusLabel: { fontSize: 12, color: C.muted, marginBottom: 4, fontWeight: "600" },
  statusValue: { fontSize: 26, fontWeight: "800" },

  /* Stepper — mirrors web .status-stepper */
  stepper: {
    flexDirection: "row", alignItems: "flex-start",
    marginTop: 16, backgroundColor: C.bg,
    borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: C.line,
  },
  stepWrap: { flex: 1, alignItems: "center", gap: 6, position: "relative" },
  stepConnector: {
    position: "absolute", top: 11, right: "50%", left: "-50%",
    height: 2, backgroundColor: C.line2,
  },
  stepConnectorDone: { backgroundColor: C.success },
  stepDot: {
    width: 24, height: 24, borderRadius: 12,
    borderWidth: 2, borderColor: C.line2,
    backgroundColor: C.surface,
    alignItems: "center", justifyContent: "center", zIndex: 1,
  },
  stepDotDone:   { backgroundColor: C.success, borderColor: C.success },
  stepDotActive: { borderColor: C.navy, borderWidth: 2.5 },
  stepCheck:     { color: C.surface, fontWeight: "800", fontSize: 11 },
  stepLabel:     { fontSize: 9, color: C.muted, textAlign: "center", fontWeight: "500" },
  stepLabelActive: { color: C.ink, fontWeight: "700" },

  /* Timeline — mirrors web .timeline */
  timeline: { marginTop: 24 },
  timelineTitle: { fontSize: 14, fontWeight: "700", color: C.ink, marginBottom: 16 },
  timelineItem:  { flexDirection: "row", gap: 14, marginBottom: 20 },
  timelineLeft:  { alignItems: "center", width: 16 },
  timelineDot:   { width: 10, height: 10, borderRadius: 5, backgroundColor: C.navy, marginTop: 4 },
  timelineLine:  { width: 2, flex: 1, backgroundColor: C.line2, marginTop: 6 },
  timelineContent: { flex: 1, paddingBottom: 4 },
  timelineStatus: { fontWeight: "700", color: C.ink, fontSize: 15 },
  timelineDate:   { fontSize: 12, color: C.muted2, marginTop: 3 },
  timelineNote:   { fontSize: 13, color: C.muted, marginTop: 6, lineHeight: 18 },
});
