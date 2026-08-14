import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors, spacing, radius, font, type } from "@/src/theme/tokens";
import { apiFetch } from "@/src/lib/api";
import { Avatar, Btn, Tag, VerifiedBadge, EmptyState } from "@/src/components/ui";
import { MasonryFeed, Post } from "@/src/components/Feed";
import { useAuth } from "@/src/context/AuthContext";

export default function Profile() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, logout, refresh } = useAuth();
  const [stats, setStats] = useState({ followers: 0, following: 0, post_count: 0 });
  const [posts, setPosts] = useState<Post[]>([]);
  const [verification, setVerification] = useState<string | undefined>();

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
        {user.bio ? <Text style={[type.body, { textAlign: "center", marginTop: spacing.sm, paddingHorizontal: spacing.xl }]}>{user.bio}</Text> : null}
        {user.city ? (
          <View style={styles.locRow}>
            <MaterialCommunityIcons name="map-marker-outline" size={14} color={colors.muted} />
            <Text style={styles.loc}>{[user.city, user.state].filter(Boolean).join(", ")}</Text>
          </View>
        ) : null}

        <View style={styles.statsRow}>
          <Stat n={stats.post_count} label="Posts" />
          <Stat n={stats.followers} label="Followers" />
          <Stat n={stats.following} label="Following" />
        </View>

        <View style={styles.actions}>
          <Btn testID="profile-edit" label="Edit Profile" variant="outline" onPress={() => router.push("/settings/edit-profile")} style={{ flex: 1, height: 46 }} />
          {user.is_professional ? (
            <Btn testID="profile-view-pro" label="Pro Studio" onPress={() => router.push("/professional/dashboard")} style={{ flex: 1, height: 46 }} />
          ) : (
            <Btn testID="profile-become-pro" label="Become a Pro" onPress={() => router.push("/professional/onboard")} style={{ flex: 1, height: 46 }} />
          )}
        </View>

        {user.interests?.length > 0 && (
          <View style={styles.interests}>
            {user.interests.map((i) => (
              <Tag key={i} label={i} />
            ))}
          </View>
        )}
      </View>

      <View style={styles.postsHeader}>
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

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statN}>{n}</Text>
      <Text style={styles.statL}>{label}</Text>
    </View>
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
