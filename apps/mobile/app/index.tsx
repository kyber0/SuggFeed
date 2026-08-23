import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { loadPublishedSubmissions, type PublishedSubmission } from "../lib/feedback-api";

/* ── Design tokens — mirror web CSS variables exactly ── */
const C = {
  navy:       "#0b3857",
  accent:     "#e86e4a",
  sky:        "#e9f2f7",
  skyDark:    "#c8dde8",
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
} as const;

/* ── Helpers ── */
function relativeDate(value: string) {
  const days = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000));
  return days === 0 ? "Today" : days === 1 ? "Yesterday" : `${days}d ago`;
}
function readableStatus(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const STATUS: Record<string, { bg: string; text: string }> = {
  approved:    { bg: C.successBg, text: C.success },
  in_progress: { bg: C.warnBg,    text: C.warn },
  resolved:    { bg: C.resolvedBg, text: C.resolved },
};

const CAT_COLORS: Record<string, { bg: string; text: string }> = {
  Facilities:    { bg: "#e9f2f7", text: "#2d6384" },
  Learning:      { bg: "#f0edf9", text: "#5b3e9c" },
  Safety:        { bg: "#fff0ed", text: "#9b341f" },
  "Student life":{ bg: "#edf9f0", text: C.success },
  Other:         { bg: "#f5f5f5", text: C.muted },
};

const ALL_CATS = ["All", "Facilities", "Learning", "Safety", "Student life", "Other"];

/* ── Idea card — matches web .idea-card style ── */
function IdeaCard({ item }: { item: PublishedSubmission }) {
  const st = STATUS[item.status] ?? STATUS.approved;
  const catName = item.categories?.name ?? "Other";
  const cat = CAT_COLORS[catName] ?? CAT_COLORS.Other;

  return (
    <View style={s.card}>
      <View style={s.cardMeta}>
        <View style={[s.badge, { backgroundColor: cat.bg }]}>
          <Text style={[s.badgeText, { color: cat.text }]}>{catName}</Text>
        </View>
        <View style={[s.badge, { backgroundColor: st.bg, flexDirection: "row", alignItems: "center", gap: 4 }]}>
          <View style={[s.dot, { backgroundColor: st.text }]} />
          <Text style={[s.badgeText, { color: st.text }]}>{readableStatus(item.status)}</Text>
        </View>
      </View>
      <Text style={s.cardTitle} numberOfLines={2}>{item.title}</Text>
      <Text style={s.cardBody} numberOfLines={3}>{item.description}</Text>
      <View style={s.cardFooter}>
        {/* Vote count — matches web ThumbsUp icon style */}
        <View style={s.votes}>
          <View style={s.voteArrow} />
          <Text style={s.voteNum}>{item.vote_count}</Text>
        </View>
        <Text style={s.dateText}>{relativeDate(item.created_at)}</Text>
      </View>
    </View>
  );
}

/* ── Empty state ── */
function EmptyFeed() {
  return (
    <View style={s.emptyWrap}>
      <View style={s.emptyIconWrap}>
        <View style={s.emptyIconBox} />
        <View style={s.emptyIconTail} />
      </View>
      <Text style={s.emptyTitle}>No ideas yet</Text>
      <Text style={s.emptyBody}>Be the first to share feedback with your community.</Text>
    </View>
  );
}

/* ── Screen ── */
export default function FeedScreen() {
  const insets = useSafeAreaInsets();
  // Tab bar height (from _layout) + a little breathing room
  const tabBarHeight = (Platform.OS === "ios" ? 84 : 64) + insets.bottom;

  const [feed, setFeed]         = useState<PublishedSubmission[]>([]);
  const [count, setCount]       = useState(0);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]       = useState("");
  const [search, setSearch]     = useState("");
  const [filterCat, setFilterCat] = useState("All");

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError("");
    try {
      const result = await loadPublishedSubmissions();
      setFeed(result.submissions);
      setCount(result.count);
    } catch {
      setError("Could not load ideas. Check your connection.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  function onRefresh() { setRefreshing(true); void load(true); }

  const filtered = feed.filter((item) => {
    const matchCat = filterCat === "All" || item.categories?.name === filterCat;
    const matchSearch = !search ||
      item.title.toLowerCase().includes(search.toLowerCase()) ||
      item.description.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const ListHeader = (
    <View>
      {/* ── Hero — mirrors web .hero section ── */}
      <View style={s.hero}>
        <Text style={s.eyebrow}>YOUR SCHOOL. YOUR VOICE.</Text>
        <Text style={s.headline}>Small ideas can make a real difference.</Text>
        <Text style={s.lede}>
          Share feedback safely, follow its progress, and see the improvements your community is shaping.
        </Text>

        {/* Pills — mirror web .pills */}
        <View style={s.pills}>
          <View style={s.pill}><Text style={s.pillText}>🔒 Anonymous option</Text></View>
          <View style={s.pill}><Text style={s.pillText}>🔔 Updates you can follow</Text></View>
          <View style={s.pill}><Text style={s.pillText}>✓ Reviewed by your school</Text></View>
        </View>

        {/* Impact card — mirrors web .impact aside */}
        <View style={s.impact}>
          <Text style={s.impactLabel}>Community impact</Text>
          <Text style={s.impactNum}>{count}</Text>
          <Text style={s.impactSub}>ideas published so far</Text>
          <View style={s.impactDivider} />
          <Text style={s.impactNum2}>0</Text>
          <Text style={s.impactSub}>drafts queued on this device</Text>
        </View>
      </View>

      {/* ── Open Ideas — mirrors web .feed section ── */}
      <View style={s.feedHeader}>
        <View>
          <Text style={s.feedEyebrow}>OPEN IDEAS</Text>
          <Text style={s.feedTitle}>What the community is talking about</Text>
        </View>
        <Pressable onPress={() => router.push("/submit")}>
          <Text style={s.feedCta}>Share your own idea →</Text>
        </Pressable>
      </View>

      {/* Search bar */}
      <View style={s.searchBox}>
        <TextInput
          style={s.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search ideas…"
          placeholderTextColor={C.muted2}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
      </View>

      {/* Category filter chips — flex-wrap avoids nested ScrollView scroll conflict */}
      <View style={s.chipsWrap}>
        {ALL_CATS.map((cat) => (
          <Pressable
            key={cat}
            style={[s.chip, filterCat === cat && s.chipActive]}
            onPress={() => setFilterCat(cat)}
          >
            <Text style={[s.chipText, filterCat === cat && s.chipTextActive]}>{cat}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={s.loadingCenter}>
        <ActivityIndicator size="large" color={C.navy} />
      </View>
    );
  }

  return (
    <View style={s.root}>
      {error ? (
        <>
          {ListHeader}
          <View style={s.errorWrap}>
            <Text style={s.errorText}>{error}</Text>
          </View>
        </>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.navy} />}
          contentContainerStyle={
            filtered.length === 0
              ? { flex: 1, paddingBottom: tabBarHeight }
              : [s.list, { paddingBottom: tabBarHeight }]
          }
          ListHeaderComponent={ListHeader}
          ListEmptyComponent={<EmptyFeed />}
          ItemSeparatorComponent={() => <View style={{ height: 14 }} />}
          renderItem={({ item }) => <IdeaCard item={item} />}
        />
      )}
    </View>
  );
}

/* ── Styles ── */
const shadow = Platform.select({
  ios:     { shadowColor: C.ink, shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 3 } },
  android: { elevation: 3 },
}) ?? {};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  loadingCenter: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: C.bg },

  /* Hero — matches web .hero */
  hero: {
    backgroundColor: C.sky,
    paddingHorizontal: 20, paddingTop: 32, paddingBottom: 24,
    borderBottomWidth: 1, borderBottomColor: C.skyDark,
  },
  eyebrow: { fontSize: 11, fontWeight: "700", color: C.accent, letterSpacing: 1, marginBottom: 10 },
  headline: { fontSize: 26, fontWeight: "800", color: C.navy, lineHeight: 32, marginBottom: 12 },
  lede: { fontSize: 14, color: C.muted, lineHeight: 20, marginBottom: 16 },

  /* Pills */
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20 },
  pill: {
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.skyDark,
    borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5,
    ...Platform.select({ ios: { shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } }, android: { elevation: 1 } }),
  },
  pillText: { fontSize: 12, fontWeight: "500", color: C.ink2 },

  /* Impact card — matches web .impact */
  impact: {
    backgroundColor: C.navy, borderRadius: 14, padding: 20,
    ...Platform.select({ ios: { shadowColor: C.navy, shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } }, android: { elevation: 5 } }),
  },
  impactLabel: { fontSize: 12, color: "rgba(255,255,255,.6)", marginBottom: 4 },
  impactNum: { fontSize: 44, fontWeight: "800", color: C.surface, lineHeight: 48 },
  impactNum2: { fontSize: 24, fontWeight: "800", color: C.surface },
  impactSub: { fontSize: 13, color: "rgba(255,255,255,.65)" },
  impactDivider: { height: 1, backgroundColor: "rgba(255,255,255,.15)", marginVertical: 14 },

  /* Feed header — matches web .feed section header */
  feedHeader: {
    paddingHorizontal: 20, paddingTop: 28, paddingBottom: 12, gap: 10,
  },
  feedEyebrow: { fontSize: 11, fontWeight: "700", color: C.accent, letterSpacing: 1, marginBottom: 4 },
  feedTitle: { fontSize: 20, fontWeight: "700", color: C.ink, lineHeight: 26 },
  feedCta: { fontSize: 13, color: C.accent, fontWeight: "600" },

  /* Search — matches web search input */
  searchBox: {
    marginHorizontal: 20, marginBottom: 12,
    borderWidth: 1.5, borderColor: C.line2, borderRadius: 10,
    backgroundColor: C.surface, ...shadow,
  },
  searchInput: { padding: 10, fontSize: 15, color: C.ink },

  /* Filter chips — flex-wrap row instead of horizontal ScrollView */
  chipsWrap: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 20, gap: 8, paddingBottom: 12 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 999, borderWidth: 1.5, borderColor: C.line2,
    backgroundColor: C.surface,
  },
  chipActive: { backgroundColor: C.navy, borderColor: C.navy },
  chipText: { fontSize: 13, fontWeight: "600", color: C.muted },
  chipTextActive: { color: C.surface },

  /* List */
  list: { paddingHorizontal: 20, paddingBottom: 32 },

  /* Idea card — matches web .idea-card */
  card: {
    backgroundColor: C.surface, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: C.line, ...shadow,
  },
  cardMeta: { flexDirection: "row", gap: 8, marginBottom: 10, flexWrap: "wrap" },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontWeight: "700" },
  dot: { width: 6, height: 6, borderRadius: 3 },
  cardTitle: { fontSize: 16, fontWeight: "700", color: C.ink, lineHeight: 22, marginBottom: 6 },
  cardBody: { fontSize: 14, color: C.muted, lineHeight: 20 },
  cardFooter: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    marginTop: 14, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: C.line,
  },
  votes: { flexDirection: "row", alignItems: "center", gap: 5 },
  voteArrow: {
    width: 0, height: 0,
    borderLeftWidth: 5, borderRightWidth: 5, borderBottomWidth: 8,
    borderLeftColor: "transparent", borderRightColor: "transparent",
    borderBottomColor: C.navy,
  },
  voteNum: { fontSize: 13, fontWeight: "700", color: C.navy },
  dateText: { fontSize: 12, color: C.muted2 },

  /* Empty */
  emptyWrap: { flex: 1, justifyContent: "center", alignItems: "center", padding: 40, gap: 12 },
  emptyIconWrap: { marginBottom: 4 },
  emptyIconBox: { width: 48, height: 36, borderRadius: 10, borderWidth: 2, borderColor: C.muted2 },
  emptyIconTail: { width: 10, height: 10, borderRightWidth: 2, borderBottomWidth: 2, borderColor: C.muted2, transform: [{ rotate: "45deg" }], marginTop: -5, marginLeft: -14 },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: C.ink },
  emptyBody: { color: C.muted, textAlign: "center", lineHeight: 20, fontSize: 14 },

  /* Error */
  errorWrap: { padding: 24 },
  errorText: { color: "#9b341f", textAlign: "center", fontSize: 14 },
});
