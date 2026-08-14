import React, { useCallback, useState, useRef } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors, spacing, radius, font, type } from "@/src/theme/tokens";
import { apiFetch } from "@/src/lib/api";
import { Avatar, Btn, VerifiedBadge, EmptyState } from "@/src/components/ui";
import { MasonryFeed, Post } from "@/src/components/Feed";
import { useAuth } from "@/src/context/AuthContext";

export default function Profile() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, logout, refresh } = useAuth();
  const [stats, setStats] = useState({ followers: 0, following: 0, post_count: 0 });
  const [posts, setPosts] = useState<Post[]>([]);
  const [verification, setVerification] = useState<string | undefined>();
  const scrollRef = useRef<ScrollView>(null);
  const looksY = useRef(0);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [profile, myPosts] = await Promise.all([
        apiFetch(`/users/${user.id}`),
        apiFetch<Post[]>(`/users/${user.id}/posts`),
      ]);
      setStats({ followers: profile.followers, following: profile.following, post_count: profile.post_count });
      setPosts(myPosts);
      if (user.professional_id) {
        const pro = await apiFetch(`/professional/${user.professional_id}`);
        setVerification(pro.verification_status);
      }
    } catch {
      // silent
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      refresh();
      load();
    }, [load, refresh])
  );

  if (!user) return null;

  return (
    <ScrollView
      ref={scrollRef}
      style={{ flex: 1, backgroundColor: colors.surface }}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: spacing.xxxl }}
    >
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Text style={styles.brand}>My Profile</Text>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          {user.role === "admin" && (
            <Pressable testID="profile-admin" onPress={() => router.push("/admin")} style={styles.headerBtn}>
              <MaterialCommunityIcons name="shield-crown-outline" size={20} color={colors.onSurface} />
            </Pressable>
          )}
          <Pressable testID="profile-logout" onPress={async () => { await logout(); router.replace("/(auth)/welcome"); }} style={styles.headerBtn}>
            <MaterialCommunityIcons name="logout" size={19} color={colors.onSurface} />
          </Pressable>
        </View>
      </View>

      <View style={styles.top}>
        <Avatar uri={user.avatar_url} name={user.display_name} size={90} ring />
        <View style={styles.nameRow}>
          <Text style={styles.name}>{user.display_name}</Text>
          <VerifiedBadge status={verification} size={18} />
        </View>
        <Text style={styles.username}>@{user.username}</Text>
        <View style={styles.roleChip}>
          <MaterialCommunityIcons
            name={user.is_professional ? "star-four-points" : "account-heart-outline"}
            size={13}
            color={colors.brandDeep}
          />
          <Text style={styles.roleChipText}>{user.is_professional ? "Professional" : "Client"}</Text>
        </View>
        {user.bio ? <Text style={[type.body, { textAlign: "center", marginTop: spacing.sm, paddingHorizontal: spacing.xl }]}>{user.bio}</Text> : null}
        {user.city ? (
          <View style={styles.locRow}>
            <MaterialCommunityIcons name="map-marker-outline" size={14} color={colors.muted} />
            <Text style={styles.loc}>{[user.city, user.state].filter(Boolean).join(", ")}</Text>
          </View>
        ) : null}

        <View style={styles.statsRow}>
          <Stat n={stats.post_count} label="Posts" onPress={() => looksY.current && scrollRef.current?.scrollTo({ y: looksY.current - 20, animated: true })} testID="profile-stat-posts" />
          <Stat n={stats.followers} label="Followers" onPress={() => router.push(`/connections/${user.id}?type=followers`)} testID="profile-stat-followers" />
          <Stat n={stats.following} label="Following" onPress={() => router.push(`/connections/${user.id}?type=following`)} testID="profile-stat-following" />
        </View>

        <View style={styles.actions}>
          <Btn testID="profile-edit" label="Edit Profile" variant="outline" onPress={() => router.push("/settings/edit-profile")} style={{ flex: 1, height: 46 }} />
          {user.is_professional ? (
            <Btn testID="profile-view-pro" label="Pro Studio" onPress={() => router.push("/professional/dashboard")} style={{ flex: 1, height: 46 }} />
          ) : (
            <Btn testID="profile-become-pro" label="Become a Pro" onPress={() => router.push("/professional/onboard")} style={{ flex: 1, height: 46 }} />
          )}
        </View>

        {user.is_professional && (
          <Btn
            testID="profile-view-public"
            label="View My Public Profile"
            variant="secondary"
            icon="account-eye-outline"
            onPress={() => user.professional_id && router.push(`/professional/${user.professional_id}`)}
            style={{ height: 46, marginTop: spacing.sm, width: "100%" }}
          />
        )}
      </View>

      <View style={styles.postsHeader} onLayout={(e) => { looksY.current = e.nativeEvent.layout.y; }}>
        <Text style={styles.sectionTitle}>My Looks</Text>
      </View>
      {posts.length ? (
        <MasonryFeed posts={posts} />
      ) : (
        <EmptyState icon="camera-plus-outline" title="No looks yet" subtitle="Share your first beauty look with the + button." />
      )}
    </ScrollView>
  );
}

function Stat({ n, label, onPress, testID }: { n: number; label: string; onPress?: () => void; testID?: string }) {
  return (
    <Pressable style={styles.stat} onPress={onPress} testID={testID}>
      <Text style={styles.statN}>{n}</Text>
      <Text style={styles.statL}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  brand: { fontFamily: font.display, fontSize: 28, color: colors.onSurface },
  headerBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  top: { alignItems: "center", paddingTop: spacing.md, paddingHorizontal: spacing.lg },
  nameRow: { flexDirection: "row", alignItems: "center", marginTop: spacing.md },
  name: { fontFamily: font.displaySemi, fontSize: 26, color: colors.onSurface },
  username: { fontFamily: font.medium, fontSize: 14, color: colors.muted, marginTop: 2 },
  roleChip: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: colors.brandTertiary, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 5, marginTop: spacing.sm },
  roleChipText: { fontFamily: font.bold, fontSize: 12, color: colors.brandDeep },
  locRow: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: spacing.sm },
  loc: { fontFamily: font.medium, fontSize: 13, color: colors.muted },
  statsRow: { flexDirection: "row", gap: spacing.xxl, marginTop: spacing.lg },
  stat: { alignItems: "center" },
  statN: { fontFamily: font.bold, fontSize: 20, color: colors.onSurface },
  statL: { fontFamily: font.regular, fontSize: 12, color: colors.muted, marginTop: 1 },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg, width: "100%" },
  interests: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.lg, justifyContent: "center" },
  postsHeader: { paddingHorizontal: spacing.lg, marginTop: spacing.xl, marginBottom: spacing.md },
  sectionTitle: { fontFamily: font.displaySemi, fontSize: 24, color: colors.onSurface },
});
