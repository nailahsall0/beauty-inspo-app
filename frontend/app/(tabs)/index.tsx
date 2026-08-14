import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors, spacing, font } from "@/src/theme/tokens";
import { apiFetch } from "@/src/lib/api";
import { MasonryFeed, Post } from "@/src/components/Feed";
import { Loading, EmptyState, Btn } from "@/src/components/ui";

type Cat = { id: string; name: string; icon: string };

export default function Home() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [cats, setCats] = useState<Cat[]>([]);
  const [activeTab, setActiveTab] = useState<string>("foryou");
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unread, setUnread] = useState(0);

  const feedTabs = [
    { key: "foryou", label: "For You" },
    { key: "following", label: "Following" },
    { key: "nearby", label: "Nearby" },
  ];
  const isFeedKey = (k: string) => k === "foryou" || k === "following" || k === "nearby";

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (isFeedKey(activeTab)) {
        params.append("feed_type", activeTab);
      } else {
        params.append("feed_type", "foryou");
        params.append("category_id", activeTab);
      }
      const feed = await apiFetch<Post[]>(`/posts/feed?${params.toString()}`);
      setPosts(feed);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

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
          <View style={styles.headerActions}>
            <Pressable testID="home-search" onPress={() => router.push("/(tabs)/discover")} style={styles.iconBtn}>
              <MaterialCommunityIcons name="magnify" size={22} color={colors.onSurface} />
            </Pressable>
            <Pressable testID="home-notifications" onPress={() => router.push("/notifications")} style={styles.iconBtn}>
              <MaterialCommunityIcons name="bell-outline" size={21} color={colors.onSurface} />
              {unread > 0 && <View style={styles.badge} />}
            </Pressable>
          </View>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabRow}>
          {feedTabs.map((t) => (
            <TopTab key={t.key} label={t.label} active={activeTab === t.key} onPress={() => setActiveTab(t.key)} />
          ))}
          {cats.map((c) => (
            <TopTab key={c.id} label={c.name} active={activeTab === c.id} onPress={() => setActiveTab(c.id)} />
          ))}
        </ScrollView>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: spacing.xxxl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brandDeep} />}
      >
        {loading ? (
          <Loading />
        ) : posts.length === 0 ? (
          <EmptyState
            icon="mirror"
            title="No looks yet"
            subtitle={
              activeTab === "following"
                ? "Follow creators and pros to see their looks here."
                : "Try a different category or check back soon."
            }
            action={activeTab !== "foryou" ? <Btn label="Explore For You" onPress={() => setActiveTab("foryou")} variant="outline" /> : undefined}
          />
        ) : (
          <View style={{ marginTop: spacing.sm }}>
            <MasonryFeed posts={posts} tight />
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function TopTab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable testID={`home-tab-${label}`} onPress={onPress} style={styles.topTab}>
      <Text style={[styles.topTabText, active && styles.topTabTextActive]}>{label}</Text>
      {active && <View style={styles.topTabUnderline} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 0,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md },
  brand: { fontFamily: font.display, fontSize: 30, color: colors.onSurface },
  headerActions: { flexDirection: "row", gap: spacing.sm },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: { position: "absolute", top: 10, right: 11, width: 9, height: 9, borderRadius: 5, backgroundColor: colors.pinkDeep, borderWidth: 1.5, borderColor: colors.surface },
  tabRow: { gap: spacing.xl, paddingRight: spacing.xl, alignItems: "flex-end" },
  topTab: { alignItems: "center", paddingBottom: spacing.sm },
  topTabText: { fontFamily: font.semibold, fontSize: 16, color: colors.faint },
  topTabTextActive: { color: colors.onSurface },
  topTabUnderline: { height: 2.5, width: 20, backgroundColor: colors.brandDeep, borderRadius: 2, marginTop: 6, position: "absolute", bottom: 2 },
});
