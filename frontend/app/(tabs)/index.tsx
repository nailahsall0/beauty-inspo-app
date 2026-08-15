import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl, Linking } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { colors, spacing, font, radius as rad } from "@/src/theme/tokens";
import { apiFetch } from "@/src/lib/api";
import { MasonryFeed, Post } from "@/src/components/Feed";
import { Loading, EmptyState, Btn } from "@/src/components/ui";
import { useAuth } from "@/src/context/AuthContext";

type Cat = { id: string; name: string; icon: string };
type LocState = "idle" | "checking" | "granted" | "prompt" | "blocked";
type Coords = { lat: number; lng: number };

const RADIUS_OPTIONS = [10, 25, 50, 100];

export default function Home() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [cats, setCats] = useState<Cat[]>([]);
  const [activeTab, setActiveTab] = useState<string>("foryou");
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unread, setUnread] = useState(0);

  // Nearby / location
  const [locState, setLocState] = useState<LocState>("idle");
  const [coords, setCoords] = useState<Coords | null>(null);
  const [radiusMi, setRadiusMi] = useState(25);

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
      if (activeTab === "nearby") {
        params.append("radius", String(radiusMi));
        if (coords) {
          params.append("lat", String(coords.lat));
          params.append("lng", String(coords.lng));
        }
      }
      const feed = await apiFetch<Post[]>(`/posts/feed?${params.toString()}`);
      setPosts(feed);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [activeTab, coords, radiusMi]);

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

  // Fetch the device position once we have permission.
  const fetchPosition = useCallback(async () => {
    try {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    } catch {
      // Position unavailable — backend falls back to saved city.
      setCoords(null);
    }
  }, []);

  // Check existing permission when the Nearby tab is opened.
  useEffect(() => {
    if (activeTab !== "nearby") return;
    (async () => {
      setLocState("checking");
      const perm = await Location.getForegroundPermissionsAsync();
      if (perm.granted) {
        setLocState("granted");
        await fetchPosition();
      } else if (perm.canAskAgain) {
        setLocState("prompt");
      } else {
        setLocState("blocked");
      }
    })();
  }, [activeTab, fetchPosition]);

  // User tapped "Use my location" — contextual request.
  const requestLocation = useCallback(async () => {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.granted) {
      setLocState("granted");
      await fetchPosition();
    } else if (perm.canAskAgain) {
      setLocState("prompt");
    } else {
      setLocState("blocked");
    }
  }, [fetchPosition]);

  const onRefresh = async () => {
    setRefreshing(true);
    if (activeTab === "nearby" && locState === "granted") await fetchPosition();
    await load();
    setRefreshing(false);
  };

  const showNearbyControls = activeTab === "nearby";
  const savedCity = user?.city || null;

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
        {showNearbyControls && (
          <NearbyControls
            locState={locState}
            coords={coords}
            savedCity={savedCity}
            radiusMi={radiusMi}
            onSetRadius={setRadiusMi}
            onRequest={requestLocation}
            onOpenSettings={() => Linking.openSettings()}
          />
        )}

        {loading ? (
          <Loading />
        ) : posts.length === 0 ? (
          <EmptyState
            icon={activeTab === "nearby" ? "map-marker-off-outline" : "mirror"}
            title={activeTab === "nearby" ? "No pros nearby yet" : "No looks yet"}
            subtitle={
              activeTab === "nearby"
                ? coords || savedCity
                  ? "Try widening your search radius above — there may be pros a little further out."
                  : "Turn on location or set your city in your profile to find pros near you."
                : activeTab === "following"
                ? "Follow creators and pros to see their looks here."
                : "Try a different category or check back soon."
            }
            action={
              activeTab === "nearby" ? (
                <Btn label="Explore For You" onPress={() => setActiveTab("foryou")} variant="outline" />
              ) : activeTab !== "foryou" ? (
                <Btn label="Explore For You" onPress={() => setActiveTab("foryou")} variant="outline" />
              ) : undefined
            }
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

function NearbyControls({
  locState,
  coords,
  savedCity,
  radiusMi,
  onSetRadius,
  onRequest,
  onOpenSettings,
}: {
  locState: LocState;
  coords: Coords | null;
  savedCity: string | null;
  radiusMi: number;
  onSetRadius: (n: number) => void;
  onRequest: () => void;
  onOpenSettings: () => void;
}) {
  return (
    <View style={styles.nearbyWrap}>
      {/* Permission prompt / status banner */}
      {locState === "prompt" && (
        <View style={styles.locCard}>
          <MaterialCommunityIcons name="map-marker-radius-outline" size={22} color={colors.brandDeep} />
          <View style={styles.locCardBody}>
            <Text style={styles.locTitle}>See pros near you</Text>
            <Text style={styles.locSub}>Share your location to find beauty pros who can recreate these looks nearby.</Text>
            <Pressable testID="nearby-enable" onPress={onRequest} style={styles.locBtn}>
              <Text style={styles.locBtnText}>Use my location</Text>
            </Pressable>
          </View>
        </View>
      )}

      {locState === "blocked" && (
        <View style={styles.locCard}>
          <MaterialCommunityIcons name="map-marker-off-outline" size={22} color={colors.brandDeep} />
          <View style={styles.locCardBody}>
            <Text style={styles.locTitle}>Location is off</Text>
            <Text style={styles.locSub}>
              {savedCity
                ? `Showing pros around ${savedCity} from your profile. Enable location for exact results.`
                : "Enable location in Settings, or set your city in your profile, to find pros near you."}
            </Text>
            <Pressable testID="nearby-open-settings" onPress={onOpenSettings} style={styles.locBtn}>
              <Text style={styles.locBtnText}>Open Settings</Text>
            </Pressable>
          </View>
        </View>
      )}

      {locState === "granted" && coords && (
        <View style={styles.locStatusRow}>
          <MaterialCommunityIcons name="crosshairs-gps" size={15} color={colors.brandDeep} />
          <Text style={styles.locStatusText}>Using your current location</Text>
        </View>
      )}

      {(locState === "prompt" || locState === "blocked") && savedCity && (
        <View style={styles.locStatusRow}>
          <MaterialCommunityIcons name="map-marker-outline" size={15} color={colors.faint} />
          <Text style={styles.locStatusText}>Based on {savedCity}</Text>
        </View>
      )}

      {/* Radius chips */}
      <View style={styles.radiusRow}>
        <Text style={styles.radiusLabel}>Within</Text>
        {RADIUS_OPTIONS.map((r) => (
          <Pressable
            key={r}
            testID={`nearby-radius-${r}`}
            onPress={() => onSetRadius(r)}
            style={[styles.radiusChip, radiusMi === r && styles.radiusChipActive]}
          >
            <Text style={[styles.radiusChipText, radiusMi === r && styles.radiusChipTextActive]}>{r} mi</Text>
          </Pressable>
        ))}
      </View>
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

  // Nearby controls
  nearbyWrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.sm },
  locCard: {
    flexDirection: "row",
    gap: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: rad.lg,
    padding: spacing.md,
  },
  locCardBody: { flex: 1 },
  locTitle: { fontFamily: font.semibold, fontSize: 15, color: colors.onSurface, marginBottom: 2 },
  locSub: { fontFamily: font.regular, fontSize: 13, color: colors.faint, lineHeight: 18 },
  locBtn: {
    alignSelf: "flex-start",
    marginTop: spacing.sm,
    backgroundColor: colors.brand,
    paddingHorizontal: spacing.lg,
    paddingVertical: 9,
    borderRadius: rad.pill,
  },
  locBtnText: { fontFamily: font.semibold, fontSize: 13, color: colors.onSurface },
  locStatusRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  locStatusText: { fontFamily: font.regular, fontSize: 12.5, color: colors.faint },
  radiusRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, flexWrap: "wrap", marginTop: 2 },
  radiusLabel: { fontFamily: font.semibold, fontSize: 13, color: colors.onSurface, marginRight: 2 },
  radiusChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: rad.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  radiusChipActive: { backgroundColor: colors.surfaceInverse, borderColor: colors.surfaceInverse },
  radiusChipText: { fontFamily: font.semibold, fontSize: 12.5, color: colors.faint },
  radiusChipTextActive: { color: colors.onSurfaceInverse },
});
