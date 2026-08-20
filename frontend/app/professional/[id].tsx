import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, useWindowDimensions, Linking } from "react-native";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors, spacing, radius, font, type } from "@/src/theme/tokens";
import { apiFetch, mediaUrl } from "@/src/lib/api";
import { Avatar, VerifiedBadge, Btn, IconBtn, Loading, EmptyState } from "@/src/components/ui";
import { Post } from "@/src/components/Feed";
import { useAuth } from "@/src/context/AuthContext";
import { useToast } from "@/src/components/Toast";

export default function ProfessionalProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { user } = useAuth();
  const toast = useToast();
  const [pro, setPro] = useState<any>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [tab, setTab] = useState<"portfolio" | "services">("portfolio");
  const [following, setFollowing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, ps] = await Promise.all([apiFetch(`/professional/${id}`), apiFetch<Post[]>(`/professional/${id}/posts`)]);
      setPro(p);
      setPosts(ps);
      setFollowing(p.is_following);
    } catch {
      toast.show("Could not load profile", "error");
    }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!pro) return <View style={{ flex: 1, backgroundColor: colors.surface }}><Loading /></View>;

  const isOwn = user?.professional_id === pro.id;
  const gridSize = (width - spacing.lg * 2 - spacing.sm * 2) / 3;

  const toggleFollow = async () => {
    setFollowing((f) => !f);
    try {
      await apiFetch(`/users/${pro.user_id}/follow`, { method: following ? "DELETE" : "POST" });
    } catch { load(); }
  };

  const openBooking = async () => {
    if (!pro.booking_url) return;
    await apiFetch(`/analytics/booking-click?professional_id=${pro.id}`, { method: "POST" }).catch(() => {});
    Linking.openURL(pro.booking_url).catch(() => toast.show("Could not open link", "error"));
  };

  const openUrl = (url: string) => Linking.openURL(url).catch(() => toast.show("Couldn't open link", "error"));

  const startMessage = async () => {
    try {
      const result = await apiFetch<{ conversation_id: string }>("/conversations", {
        method: "POST",
        body: { professional_id: pro.id, text: "Hi! I'd love to learn more about your services." }
      });
      router.push(`/messages/${result.conversation_id}`);
    } catch (e: any) {
      toast.show(e.message || "Could not start conversation", "error");
    }
  };

  const handle = (v: string) => v.trim().replace(/^@/, "").replace(/\/+$/, "");
  const instagramUrl = pro.instagram
    ? (/^https?:\/\//i.test(pro.instagram) ? pro.instagram : `https://instagram.com/${handle(pro.instagram)}`)
    : null;
  const tiktokUrl = pro.tiktok
    ? (/^https?:\/\//i.test(pro.tiktok) ? pro.tiktok : `https://tiktok.com/@${handle(pro.tiktok)}`)
    : null;
  const websiteUrl = pro.website
    ? (/^https?:\/\//i.test(pro.website) ? pro.website : `https://${pro.website.trim()}`)
    : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: pro.booking_url ? 120 : spacing.xxl }}>
        {/* Cover */}
        <View style={{ width, height: 190, backgroundColor: colors.surfaceTertiary }}>
          {pro.cover_url ? <Image source={{ uri: mediaUrl(pro.cover_url) }} style={{ width: "100%", height: "100%" }} contentFit="cover" /> : null}
          <LinearGradient colors={["rgba(28,20,16,0.3)", "transparent"]} style={styles.coverScrim} />
          <View style={[styles.coverBar, { top: insets.top + spacing.sm }]}>
            <IconBtn icon="chevron-left" onPress={() => router.back()} bg="rgba(253,251,247,0.9)" />
            {isOwn && <IconBtn icon="cog-outline" onPress={() => router.push("/professional/edit")} bg="rgba(253,251,247,0.9)" />}
          </View>
        </View>

        <View style={styles.body}>
          <View style={styles.avatarWrap}>
            <Avatar uri={pro.avatar_url} name={pro.business_name} size={88} />
          </View>

          <View style={styles.nameRow}>
            <Text style={styles.name}>{pro.business_name}</Text>
            <VerifiedBadge status={pro.verification_status} size={18} />
          </View>
          <Text style={styles.handle}>@{pro.username}</Text>
          {pro.city ? (
            <View style={styles.locRow}>
              <MaterialCommunityIcons name="map-marker-outline" size={14} color={colors.muted} />
              <Text style={styles.loc}>{[pro.city, pro.state].filter(Boolean).join(", ")} · {pro.service_radius} mi radius</Text>
            </View>
          ) : null}
          {pro.bio ? <Text style={styles.bio}>{pro.bio}</Text> : null}

          <View style={styles.statsRow}>
            <Text style={styles.stat}><Text style={styles.statN}>{pro.post_count}</Text> looks</Text>
            <Pressable testID="pro-followers" onPress={() => router.push(`/connections/${pro.user_id}?type=followers`)}><Text style={styles.stat}><Text style={styles.statN}>{pro.followers}</Text> followers</Text></Pressable>
          </View>

          {/* Social + follow */}
          <View style={styles.actionsRow}>
            {!isOwn && (
              <Btn testID="pro-follow" label={following ? "Following" : "Follow"} variant={following ? "outline" : "primary"} onPress={toggleFollow} style={{ flex: 1, height: 46 }} />
            )}
            {!isOwn && (
              <IconBtn testID="pro-message" icon="message-outline" onPress={startMessage} bg={colors.surfaceSecondary} />
            )}
            {isOwn && (
              <Btn testID="pro-analytics" label="View Analytics" variant="outline" icon="chart-line" onPress={() => router.push("/professional/analytics")} style={{ flex: 1, height: 46 }} />
            )}
            {instagramUrl ? <IconBtn testID="pro-social-instagram" icon="instagram" onPress={() => openUrl(instagramUrl)} bg={colors.surfaceSecondary} /> : null}
            {tiktokUrl ? <IconBtn testID="pro-social-tiktok" icon="music-note" onPress={() => openUrl(tiktokUrl)} bg={colors.surfaceSecondary} /> : null}
            {websiteUrl ? <IconBtn testID="pro-social-website" icon="web" onPress={() => openUrl(websiteUrl)} bg={colors.surfaceSecondary} /> : null}
          </View>

          {/* Tabs */}
          <View style={styles.tabs}>
            <Pressable testID="pro-tab-portfolio" onPress={() => setTab("portfolio")} style={styles.tab}>
              <Text style={[styles.tabText, tab === "portfolio" && styles.tabActive]}>Portfolio</Text>
              {tab === "portfolio" && <View style={styles.underline} />}
            </Pressable>
            <Pressable testID="pro-tab-services" onPress={() => setTab("services")} style={styles.tab}>
              <Text style={[styles.tabText, tab === "services" && styles.tabActive]}>Services & Pricing</Text>
              {tab === "services" && <View style={styles.underline} />}
            </Pressable>
          </View>

          {tab === "portfolio" ? (
            posts.length ? (
              <View>
                {isOwn && (
                  <Btn testID="pro-add-look" label="Add Look to Portfolio" variant="secondary" icon="plus" onPress={() => router.push("/create")} style={{ height: 46, marginBottom: spacing.lg }} />
                )}
                <View style={styles.grid}>
                  {posts.map((p) => (
                    <Pressable key={p.id} testID={`portfolio-${p.id}`} onPress={() => router.push(`/post/${p.id}`)} style={{ width: gridSize, height: gridSize, borderRadius: radius.md, overflow: "hidden", backgroundColor: colors.surfaceTertiary }}>
                      <Image source={{ uri: mediaUrl(p.media?.[0]?.url) }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : (
              <EmptyState
                icon="image-outline"
                title="No portfolio yet"
                subtitle={isOwn ? "Share your work so clients can see what you do." : undefined}
                action={isOwn ? <Btn testID="pro-add-look-empty" label="Add Look" icon="plus" onPress={() => router.push("/create")} /> : undefined}
              />
            )
          ) : (
            <View style={{ gap: spacing.sm }}>
              {isOwn && (
                <Btn testID="pro-manage-services" label="Add / Manage Services" variant="secondary" icon="pencil-outline" onPress={() => router.push("/professional/edit")} style={{ height: 46, marginBottom: spacing.sm }} />
              )}
              {pro.services?.length ? (
                pro.services.map((s: any) => (
                  <View key={s.id} style={styles.serviceRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.serviceName}>{s.name}</Text>
                      {s.duration ? <Text style={styles.serviceDur}>{s.duration}{s.description ? ` · ${s.description}` : ""}</Text> : null}
                    </View>
                    {s.price != null && <Text style={styles.servicePrice}>Starting at ${s.price}</Text>}
                  </View>
                ))
              ) : (
                <EmptyState icon="tag-outline" title="No services listed yet" subtitle={isOwn ? "Add the services you offer with pricing." : undefined} />
              )}
            </View>
          )}
        </View>
      </ScrollView>

      {pro.booking_url && !isOwn && (
        <View style={[styles.bookBar, { paddingBottom: insets.bottom + spacing.sm }]}>
          <Btn testID="book-appointment" label="Book Appointment" icon="calendar-check-outline" onPress={openBooking} style={{ height: 52 }} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  coverScrim: { position: "absolute", top: 0, left: 0, right: 0, height: 90 },
  coverBar: { position: "absolute", left: spacing.lg, right: spacing.lg, flexDirection: "row", justifyContent: "space-between" },
  body: { paddingHorizontal: spacing.lg },
  avatarWrap: { marginTop: -44, borderWidth: 4, borderColor: colors.surface, borderRadius: 50, alignSelf: "flex-start" },
  nameRow: { flexDirection: "row", alignItems: "center", marginTop: spacing.md },
  name: { fontFamily: font.displaySemi, fontSize: 26, color: colors.onSurface },
  handle: { fontFamily: font.medium, fontSize: 14, color: colors.muted, marginTop: 1 },
  locRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: spacing.sm },
  loc: { fontFamily: font.medium, fontSize: 13, color: colors.muted },
  bio: { fontFamily: font.regular, fontSize: 14, lineHeight: 21, color: colors.onSurfaceSecondary, marginTop: spacing.md },
  statsRow: { flexDirection: "row", gap: spacing.xl, marginTop: spacing.md },
  stat: { fontFamily: font.regular, fontSize: 13, color: colors.muted },
  statN: { fontFamily: font.bold, fontSize: 14, color: colors.onSurface },
  actionsRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.lg },
  tabs: { flexDirection: "row", gap: spacing.xl, marginTop: spacing.xl, borderBottomWidth: 1, borderBottomColor: colors.border },
  tab: { alignItems: "center", paddingBottom: spacing.md },
  tabText: { fontFamily: font.semibold, fontSize: 15, color: colors.faint },
  tabActive: { color: colors.onSurface },
  underline: { height: 2.5, width: 22, backgroundColor: colors.brandDeep, borderRadius: 2, marginTop: 8, position: "absolute", bottom: -1 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.lg },
  serviceRow: { flexDirection: "row", alignItems: "center", backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, marginTop: 0 },
  serviceName: { fontFamily: font.bold, fontSize: 15, color: colors.onSurface },
  serviceDur: { fontFamily: font.regular, fontSize: 12.5, color: colors.muted, marginTop: 2 },
  servicePrice: { fontFamily: font.bold, fontSize: 14, color: colors.brandDeep },
  bookBar: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
});
