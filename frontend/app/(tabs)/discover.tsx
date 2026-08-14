import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, TextInput, Pressable, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors, spacing, radius, font, type } from "@/src/theme/tokens";
import { apiFetch } from "@/src/lib/api";
import { MasonryFeed, Post } from "@/src/components/Feed";
import { ProRow, Pro } from "@/src/components/ProCard";
import { Loading, EmptyState } from "@/src/components/ui";

type SearchResult = {
  suggestions: string[];
  posts: Post[];
  professionals: Pro[];
  services: { id: string; name: string }[];
};

const TABS = ["Looks", "Professionals", "Services"];

export default function Discover() {
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState("");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [trending, setTrending] = useState<Post[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState(0);
  const timer = useRef<any>(null);

  useEffect(() => {
    apiFetch<Post[]>("/posts/feed?feed_type=foryou").then((p) => setTrending(p)).catch(() => {});
  }, []);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!q.trim()) {
      setResult(null);
      return;
    }
    setLoading(true);
    timer.current = setTimeout(async () => {
      try {
        const r = await apiFetch<SearchResult>(`/search?q=${encodeURIComponent(q.trim())}`);
        setResult(r);
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }, 350);
  }, [q]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Text style={styles.title}>Discover</Text>
        <View style={styles.searchBar}>
          <MaterialCommunityIcons name="magnify" size={20} color={colors.muted} />
          <TextInput
            testID="discover-search-input"
            value={q}
            onChangeText={setQ}
            placeholder="boho knotless, chrome nails, lash tech…"
            placeholderTextColor={colors.faint}
            style={styles.searchInput}
            autoCapitalize="none"
            returnKeyType="search"
          />
          {q.length > 0 && (
            <Pressable testID="discover-clear" onPress={() => setQ("")} hitSlop={8}>
              <MaterialCommunityIcons name="close-circle" size={18} color={colors.faint} />
            </Pressable>
          )}
        </View>
      </View>

      {!result ? (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: spacing.xxxl }}>
          <Text style={styles.sectionTitle}>Trending Now</Text>
          {trending.length ? <MasonryFeed posts={trending} /> : <Loading />}
        </ScrollView>
      ) : loading ? (
        <Loading label="Searching…" />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: spacing.xxxl }} keyboardShouldPersistTaps="handled">
          {result.suggestions.length > 0 && (
            <View style={styles.suggestions}>
              {result.suggestions.map((s) => (
                <Pressable key={s} testID={`suggestion-${s}`} onPress={() => setQ(s)} style={styles.suggChip}>
                  <MaterialCommunityIcons name="magnify" size={14} color={colors.brandDeep} />
                  <Text style={styles.suggText}>{s}</Text>
                </Pressable>
              ))}
            </View>
          )}

          <View style={styles.tabs}>
            {TABS.map((t, i) => (
              <Pressable key={t} testID={`discover-tab-${t}`} onPress={() => setTab(i)} style={styles.tab}>
                <Text style={[styles.tabText, tab === i && styles.tabTextActive]}>{t}</Text>
                {tab === i && <View style={styles.tabUnderline} />}
              </Pressable>
            ))}
          </View>

          {tab === 0 &&
            (result.posts.length ? (
              <View style={{ marginTop: spacing.md }}>
                <MasonryFeed posts={result.posts} />
              </View>
            ) : (
              <EmptyState icon="image-search-outline" title="No looks found" subtitle={`Nothing matched "${q}" yet.`} />
            ))}

          {tab === 1 && (
            <View style={styles.list}>
              {result.professionals.length ? (
                result.professionals.map((p) => <ProRow key={p.id} pro={p} />)
              ) : (
                <EmptyState icon="account-search-outline" title="No professionals found" />
              )}
            </View>
          )}

          {tab === 2 && (
            <View style={styles.list}>
              {result.services.length ? (
                result.services.map((s) => (
                  <View key={s.id} style={styles.serviceRow}>
                    <MaterialCommunityIcons name="tag-outline" size={18} color={colors.brandDeep} />
                    <Text style={styles.serviceName}>{s.name}</Text>
                  </View>
                ))
              ) : (
                <EmptyState icon="tag-search-outline" title="No services found" />
              )}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { fontFamily: font.display, fontSize: 32, color: colors.onSurface, marginBottom: spacing.md },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    height: 48,
    gap: spacing.sm,
  },
  searchInput: { flex: 1, fontFamily: font.medium, fontSize: 15, color: colors.onSurface },
  sectionTitle: { fontFamily: font.displaySemi, fontSize: 24, color: colors.onSurface, paddingHorizontal: spacing.lg, marginVertical: spacing.lg },
  suggestions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, padding: spacing.lg },
  suggChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.brandTertiary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  suggText: { fontFamily: font.semibold, fontSize: 13, color: colors.brandDeep },
  tabs: { flexDirection: "row", gap: spacing.xl, paddingHorizontal: spacing.lg, marginTop: spacing.xs },
  tab: { alignItems: "center" },
  tabText: { fontFamily: font.semibold, fontSize: 15, color: colors.faint },
  tabTextActive: { color: colors.onSurface },
  tabUnderline: { height: 2.5, width: 22, backgroundColor: colors.brandDeep, borderRadius: 2, marginTop: 5 },
  list: { padding: spacing.lg, gap: spacing.md },
  serviceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  serviceName: { fontFamily: font.semibold, fontSize: 15, color: colors.onSurface },
});
