import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors, spacing, radius, font, type } from "@/src/theme/tokens";
import { apiFetch } from "@/src/lib/api";
import { MasonryFeed, Post } from "@/src/components/Feed";
import { ProCardCompact, Pro } from "@/src/components/ProCard";
import { Loading, EmptyState, Btn } from "@/src/components/ui";
import { useAuth } from "@/src/context/AuthContext";

type Cat = { id: string; name: string; icon: string };
const FEEDS = [
  { key: "foryou", label: "For You" },
  { key: "following", label: "Following" },
  { key: "nearby", label: "Nearby" },
];

export default function Home() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [cats, setCats] = useState<Cat[]>([]);
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [feedType, setFeedType] = useState("foryou");
  const [posts, setPosts] = useState<Post[]>([]);
  const [pros, setPros] = useState<Pro[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ feed_type: feedType });
      if (activeCat) params.append("category_id", activeCat);
      const [feed, recPros] = await Promise.all([
        apiFetch<Post[]>(`/posts/feed?${params.toString()}`),
        apiFetch<Pro[]>("/professionals/search"),
      ]);
      setPosts(feed);
      setPros(recPros.slice(0, 8));
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [feedType, activeCat]);

  useEffect(() => {
    apiFetch<Cat[]>("/categories", { auth: false }).then(setCats).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      apiFetch<{ count: number }>("/notifications/unread-count").then((d) => setUnread(d.count)).catch(() => {});
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      {/* Sticky header */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.headerTop}>
          <Text style={styles.brand}>brook.ie</Text>
          <Pressable testID="home-notifications" onPress={() => router.push("/notifications")} style={styles.bell}>
            <MaterialCommunityIcons name="bell-outline" size={22} color={colors.onSurface} />
            {unread > 0 && <View style={styles.badge} />}
          </Pressable>
        </View>
        <Pressable testID="home-search" onPress={() => router.push("/(tabs)/discover")} style={styles.search}>
          <MaterialCommunityIcons name="magnify" size={20} color={colors.muted} />
          <Text style={styles.searchText}>Search styles, services, creators</Text>
        </Pressable>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          <CatChip label="All" icon="star-four-points-outline" active={!activeCat} onPress={() => setActiveCat(null)} />
          {cats.map((c) => (
            <CatChip
              key={c.id}
              label={c.name}
              icon={c.icon}
              active={activeCat === c.id}
              onPress={() => setActiveCat(activeCat === c.id ? null : c.id)}
            />
          ))}
        </ScrollView>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: spacing.xxxl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brandDeep} />}
      >
        {/* Recommended professionals */}
        {pros.length > 0 && !activeCat && (
          <View style={styles.section}>
            <SectionHeader title="Recommended Pros" onPress={() => router.push("/(tabs)/discover")} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.proRow}>
              {pros.map((p) => (
                <ProCardCompact key={p.id} pro={p} />
              ))}
            </ScrollView>
          </View>
        )}

        {/* Feed type tabs */}
        <View style={styles.feedTabs}>
          {FEEDS.map((f) => (
            <Pressable key={f.key} testID={`feed-tab-${f.key}`} onPress={() => setFeedType(f.key)} style={styles.feedTab}>
              <Text style={[styles.feedTabText, feedType === f.key && styles.feedTabTextActive]}>{f.label}</Text>
              {feedType === f.key && <View style={styles.feedTabUnderline} />}
            </Pressable>
          ))}
        </View>

        {loading ? (
          <Loading />
        ) : posts.length === 0 ? (
          <EmptyState
            icon="mirror"
            title="No looks yet"
            subtitle={
              feedType === "following"
                ? "Follow creators and pros to see their looks here."
                : "Try a different category or check back soon."
            }
            action={feedType !== "foryou" ? <Btn label="Explore For You" onPress={() => setFeedType("foryou")} variant="outline" /> : undefined}
          />
        ) : (
          <View style={{ marginTop: spacing.md }}>
            <MasonryFeed posts={posts} />
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function CatChip({ label, icon, active, onPress }: { label: string; icon: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      testID={`home-cat-${label}`}
      onPress={onPress}
      style={[styles.catChip, active && styles.catChipActive]}
    >
      <MaterialCommunityIcons name={icon as any} size={16} color={active ? colors.onSurfaceInverse : colors.brandDeep} />
      <Text style={[styles.catChipText, active && { color: colors.onSurfaceInverse }]}>{label}</Text>
    </Pressable>
  );
}

function SectionHeader({ title, onPress }: { title: string; onPress?: () => void }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {onPress && (
        <Pressable onPress={onPress} hitSlop={8}>
          <Text style={styles.explore}>Explore</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md },
  brand: { fontFamily: font.display, fontSize: 30, color: colors.onSurface },
  bell: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: { position: "absolute", top: 10, right: 11, width: 9, height: 9, borderRadius: 5, backgroundColor: colors.pinkDeep, borderWidth: 1.5, borderColor: colors.surface },
  search: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    height: 46,
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  searchText: { fontFamily: font.regular, fontSize: 14, color: colors.muted },
  chipRow: { gap: spacing.sm, paddingRight: spacing.lg },
  catChip: {
    flexShrink: 0,
    height: 36,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  catChipActive: { backgroundColor: colors.surfaceInverse, borderColor: colors.surfaceInverse },
  catChipText: { fontFamily: font.semibold, fontSize: 13, color: colors.onSurface },
  section: { marginTop: spacing.lg },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, marginBottom: spacing.md },
  sectionTitle: { fontFamily: font.displaySemi, fontSize: 24, color: colors.onSurface },
  explore: { fontFamily: font.semibold, fontSize: 13, color: colors.brandDeep },
  proRow: { gap: spacing.md, paddingHorizontal: spacing.lg },
  feedTabs: { flexDirection: "row", gap: spacing.xl, paddingHorizontal: spacing.lg, marginTop: spacing.xl },
  feedTab: { alignItems: "center" },
  feedTabText: { fontFamily: font.semibold, fontSize: 16, color: colors.faint },
  feedTabTextActive: { color: colors.onSurface },
  feedTabUnderline: { height: 2.5, width: 24, backgroundColor: colors.brandDeep, borderRadius: 2, marginTop: 5 },
});
