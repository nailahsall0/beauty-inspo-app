import React from "react";
import { View, Text, Pressable, StyleSheet, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { colors, spacing, radius, font } from "@/src/theme/tokens";
import { mediaUrl } from "@/src/lib/api";
import { Avatar, VerifiedBadge } from "@/src/components/ui";

export type Post = {
  id: string;
  media: { url: string; type: string; width?: number; height?: number }[];
  caption: string;
  service_name?: string | null;
  style_name?: string | null;
  city?: string | null;
  post_type: string;
  like_count: number;
  save_count: number;
  liked: boolean;
  saved: boolean;
  author: any;
  tagged_professional?: any;
  attributes?: Record<string, any>;
  professional_details?: string | null;
};

export function FeedCard({ post, width }: { post: Post; width: number }) {
  const router = useRouter();
  const first = post.media?.[0];
  const ar = first?.width && first?.height ? first.width / first.height : 0.8;
  const h = Math.max(160, Math.min(width / ar, width * 1.7));
  const url = mediaUrl(first?.url);
  return (
    <Pressable
      testID={`feed-card-${post.id}`}
      onPress={() => router.push(`/post/${post.id}`)}
      style={styles.card}
    >
      <View style={{ width, height: h, backgroundColor: colors.surfaceTertiary }}>
        {url ? (
          <Image source={{ uri: url }} style={{ width: "100%", height: "100%" }} contentFit="cover" transition={250} />
        ) : null}
        {first?.type === "video" && (
          <View style={styles.videoTag}>
            <MaterialCommunityIcons name="play" size={14} color={colors.white} />
          </View>
        )}
        <LinearGradient colors={["transparent", "rgba(28,20,16,0.75)"]} style={styles.scrim} />
        <View style={styles.overlay}>
          {post.service_name ? (
            <Text style={styles.serviceText} numberOfLines={1}>
              {post.service_name}
            </Text>
          ) : null}
          <View style={styles.metaRow}>
            <Text style={styles.styleText} numberOfLines={1}>
              {post.style_name || post.city || ""}
            </Text>
            {post.save_count > 0 && (
              <View style={styles.saveChip}>
                <MaterialCommunityIcons name="bookmark" size={11} color={colors.white} />
                <Text style={styles.saveChipText}>{post.save_count}</Text>
              </View>
            )}
          </View>
        </View>
      </View>
      <View style={styles.footer}>
        <Avatar uri={post.author?.avatar_url} name={post.author?.display_name} size={22} />
        <Text style={styles.authorText} numberOfLines={1}>
          {post.author?.username ? `@${post.author.username}` : post.author?.display_name}
        </Text>
        {post.tagged_professional?.verification_status === "VERIFIED" && <VerifiedBadge status="VERIFIED" size={12} />}
      </View>
    </Pressable>
  );
}

export function MasonryFeed({ posts, containerWidth }: { posts: Post[]; containerWidth?: number }) {
  const { width: winW } = useWindowDimensions();
  const totalW = containerWidth ?? winW;
  const gap = spacing.md;
  const colW = (totalW - spacing.lg * 2 - gap) / 2;
  const cols: Post[][] = [[], []];
  const heights = [0, 0];
  posts.forEach((p) => {
    const first = p.media?.[0];
    const ar = first?.width && first?.height ? first.width / first.height : 0.8;
    const h = Math.max(160, Math.min(colW / ar, colW * 1.7)) + 40;
    const idx = heights[0] <= heights[1] ? 0 : 1;
    cols[idx].push(p);
    heights[idx] += h + gap;
  });
  return (
    <View style={styles.masonry}>
      {cols.map((col, i) => (
        <View key={i} style={{ width: colW, gap }}>
          {col.map((p) => (
            <FeedCard key={p.id} post={p} width={colW} />
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  masonry: { flexDirection: "row", gap: spacing.md, paddingHorizontal: spacing.lg },
  card: {
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  scrim: { position: "absolute", bottom: 0, left: 0, right: 0, height: "45%" },
  overlay: { position: "absolute", bottom: 0, left: 0, right: 0, padding: spacing.md },
  serviceText: { fontFamily: font.bold, fontSize: 14, color: colors.white },
  metaRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 2 },
  styleText: { fontFamily: font.medium, fontSize: 11, color: "rgba(255,255,255,0.85)", flexShrink: 1 },
  saveChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: "rgba(0,0,0,0.35)",
    borderRadius: radius.pill,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  saveChipText: { fontFamily: font.semibold, fontSize: 10, color: colors.white },
  videoTag: {
    position: "absolute",
    top: spacing.sm,
    right: spacing.sm,
    backgroundColor: "rgba(0,0,0,0.4)",
    borderRadius: radius.pill,
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  footer: { flexDirection: "row", alignItems: "center", padding: spacing.sm, gap: 6 },
  authorText: { fontFamily: font.medium, fontSize: 12, color: colors.onSurfaceSecondary, flexShrink: 1 },
});
