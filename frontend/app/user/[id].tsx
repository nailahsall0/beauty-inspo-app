import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors, spacing, font, type } from "@/src/theme/tokens";
import { apiFetch } from "@/src/lib/api";
import { Avatar, Btn, Loading, EmptyState, IconBtn, Tag } from "@/src/components/ui";
import { MasonryFeed, Post } from "@/src/components/Feed";
import { useAuth } from "@/src/context/AuthContext";

export default function UserProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user: me } = useAuth();
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

  if (!profile) return <View style={{ flex: 1, backgroundColor: colors.surface }}><Loading /></View>;

  const isMe = profile.id === me?.id;
  const toggleFollow = async () => {
    setFollowing((f) => !f);
    try { await apiFetch(`/users/${profile.id}/follow`, { method: following ? "DELETE" : "POST" }); } catch { load(); }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.surface }} contentContainerStyle={{ paddingBottom: spacing.xxl }} showsVerticalScrollIndicator={false}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <IconBtn icon="chevron-left" onPress={() => router.back()} />
      </View>
      <View style={styles.top}>
        <Avatar uri={profile.avatar_url} name={profile.display_name} size={88} ring />
        <Text style={styles.name}>{profile.display_name}</Text>
        <Text style={styles.username}>@{profile.username}</Text>
        {profile.bio ? <Text style={[type.body, { textAlign: "center", marginTop: spacing.sm, paddingHorizontal: spacing.xl }]}>{profile.bio}</Text> : null}
        <View style={styles.stats}>
          <Text style={styles.stat}><Text style={styles.statN}>{profile.post_count}</Text> posts</Text>
          <Text style={styles.stat}><Text style={styles.statN}>{profile.followers}</Text> followers</Text>
          <Text style={styles.stat}><Text style={styles.statN}>{profile.following}</Text> following</Text>
        </View>
        {!isMe && (
          <Btn testID="user-follow" label={following ? "Following" : "Follow"} variant={following ? "outline" : "primary"} onPress={toggleFollow} style={{ marginTop: spacing.lg, width: 200, height: 44 }} />
        )}
        {profile.interests?.length > 0 && (
          <View style={styles.interests}>{profile.interests.map((i: string) => <Tag key={i} label={i} />)}</View>
        )}
      </View>
      <Text style={styles.sectionTitle}>Looks</Text>
      {posts.length ? <MasonryFeed posts={posts} /> : <EmptyState icon="image-outline" title="No looks yet" />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  top: { alignItems: "center", paddingHorizontal: spacing.lg },
  name: { fontFamily: font.displaySemi, fontSize: 26, color: colors.onSurface, marginTop: spacing.md },
  username: { fontFamily: font.medium, fontSize: 14, color: colors.muted, marginTop: 1 },
  stats: { flexDirection: "row", gap: spacing.xl, marginTop: spacing.lg },
  stat: { fontFamily: font.regular, fontSize: 13, color: colors.muted },
  statN: { fontFamily: font.bold, fontSize: 14, color: colors.onSurface },
  interests: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.lg, justifyContent: "center" },
  sectionTitle: { fontFamily: font.displaySemi, fontSize: 24, color: colors.onSurface, paddingHorizontal: spacing.lg, marginVertical: spacing.lg },
});
