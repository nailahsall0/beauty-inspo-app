import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { spacing, font, type } from "@/src/theme/tokens";
import { apiFetch } from "@/src/lib/api";
import { Avatar, Btn, Loading, EmptyState, IconBtn, Tag } from "@/src/components/ui";
import { MasonryFeed, Post } from "@/src/components/Feed";
import { useAuth } from "@/src/context/AuthContext";
import { useTheme } from "@/src/hooks/useTheme";
import { useToast } from "@/src/components/Toast";

export default function UserProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user: me } = useAuth();
  const { colors } = useTheme();
  const toast = useToast();
  const [profile, setProfile] = useState<any>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [following, setFollowing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, ps] = await Promise.all([apiFetch(`/users/${id}`), apiFetch<Post[]>(`/users/${id}/posts`)]);
      // If this user is a professional, redirect to their pro page
      if (p.professional_id && p.id !== me?.id) {
        router.replace(`/professional/${p.professional_id}`);
        return;
      }
      setProfile(p);
      setPosts(ps);
      setFollowing(p.is_following);
    } catch {}
  }, [id, me?.id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!profile) return <View style={{ flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}><Loading /></View>;

  const isMe = profile.id === me?.id;
  const toggleFollow = async () => {
    setFollowing((f) => !f);
    try { await apiFetch(`/users/${profile.id}/follow`, { method: following ? "DELETE" : "POST" }); } catch { load(); }
  };

  const startMessage = async () => {
    try {
      // First check if we already have a conversation with this user
      const convos = await apiFetch<any[]>("/conversations");
      const existing = convos.find((c) => c.other_user?.id === profile.id);
      if (existing?.id) {
        router.push(`/messages/${existing.id}`);
        return;
      }
      // Create new conversation
      const result = await apiFetch<{ conversation_id: string }>("/conversations", {
        method: "POST",
        body: { user_id: profile.id }
      });
      if (!result?.conversation_id) {
        throw new Error("Failed to create conversation");
      }
      router.push(`/messages/${result.conversation_id}`);
    } catch (e: any) {
      console.error("Failed to start conversation:", e);
      toast.show(e.message || "Could not start conversation", "error");
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.surface }} contentContainerStyle={{ paddingBottom: spacing.xxl }} showsVerticalScrollIndicator={false}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <IconBtn icon="chevron-left" onPress={() => router.back()} />
      </View>
      <View style={styles.top}>
        <Avatar uri={profile.avatar_url} name={profile.display_name} size={88} ring />
        <Text style={[styles.name, { color: colors.onSurface }]}>{profile.display_name}</Text>
        <Text style={[styles.username, { color: colors.muted }]}>@{profile.username}</Text>
        {profile.bio ? <Text style={[type.body, { textAlign: "center", marginTop: spacing.sm, paddingHorizontal: spacing.xl, color: colors.onSurfaceSecondary }]}>{profile.bio}</Text> : null}
        <View style={styles.stats}>
          <Text style={[styles.stat, { color: colors.muted }]}><Text style={[styles.statN, { color: colors.onSurface }]}>{profile.post_count}</Text> posts</Text>
          <Pressable testID="user-followers" onPress={() => router.push(`/connections/${profile.id}?type=followers`)}><Text style={[styles.stat, { color: colors.muted }]}><Text style={[styles.statN, { color: colors.onSurface }]}>{profile.followers}</Text> followers</Text></Pressable>
          <Pressable testID="user-following" onPress={() => router.push(`/connections/${profile.id}?type=following`)}><Text style={[styles.stat, { color: colors.muted }]}><Text style={[styles.statN, { color: colors.onSurface }]}>{profile.following}</Text> following</Text></Pressable>
        </View>
        {!isMe && (
          <View style={styles.actions}>
            <Btn testID="user-follow" label={following ? "Following" : "Follow"} variant={following ? "outline" : "primary"} onPress={toggleFollow} style={{ flex: 1, height: 44 }} />
            <IconBtn testID="user-message" icon="message-outline" onPress={startMessage} bg={colors.surfaceSecondary} />
          </View>
        )}
        {profile.interests?.length > 0 && (
          <View style={styles.interests}>{profile.interests.map((i: string) => <Tag key={i} label={i} />)}</View>
        )}
      </View>
      <Text style={[styles.sectionTitle, { color: colors.onSurface }]}>Looks</Text>
      {posts.length ? <MasonryFeed posts={posts} /> : <EmptyState icon="image-outline" title="No looks yet" />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  top: { alignItems: "center", paddingHorizontal: spacing.lg },
  name: { fontFamily: font.displaySemi, fontSize: 26, marginTop: spacing.md },
  username: { fontFamily: font.medium, fontSize: 14, marginTop: 1 },
  stats: { flexDirection: "row", gap: spacing.xl, marginTop: spacing.lg },
  stat: { fontFamily: font.regular, fontSize: 13 },
  statN: { fontFamily: font.bold, fontSize: 14 },
  actions: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.lg, width: "100%" },
  interests: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.lg, justifyContent: "center" },
  sectionTitle: { fontFamily: font.displaySemi, fontSize: 24, paddingHorizontal: spacing.lg, marginVertical: spacing.lg },
});
