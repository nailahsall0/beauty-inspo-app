import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing, font } from "@/src/theme/tokens";
import { apiFetch } from "@/src/lib/api";
import { MasonryFeed, Post } from "@/src/components/Feed";
import { Loading, EmptyState, IconBtn } from "@/src/components/ui";

export default function Collection() {
  const { id, name } = useLocalSearchParams<{ id: string; name: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [posts, setPosts] = useState<Post[] | null>(null);

  useEffect(() => {
    apiFetch<Post[]>(`/collections/${id}/posts`).then(setPosts).catch(() => setPosts([]));
  }, [id]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top + spacing.sm }}>
      <View style={styles.header}>
        <IconBtn icon="chevron-left" onPress={() => router.back()} />
        <Text style={styles.title}>{name || "Collection"}</Text>
      </View>
      {!posts ? (
        <Loading />
      ) : posts.length === 0 ? (
        <EmptyState icon="folder-open-outline" title="Empty collection" subtitle="Save looks into this collection from any post." />
      ) : (
        <ScrollView contentContainerStyle={{ paddingTop: spacing.md, paddingBottom: insets.bottom + spacing.xxl }} showsVerticalScrollIndicator={false}>
          <MasonryFeed posts={posts} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { fontFamily: font.displaySemi, fontSize: 24, color: colors.onSurface, flexShrink: 1 },
});
