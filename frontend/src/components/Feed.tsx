import React from "react";
import { View, Pressable, StyleSheet, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import { useRouter } from "expo-router";
import { colors, spacing, radius } from "@/src/theme/tokens";
import { mediaUrl } from "@/src/lib/api";

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
        {first?.type === "video" ? (
          <AutoVideo uri={mediaUrl(first.url)!} />
        ) : url ? (
          <Image source={{ uri: url }} style={{ width: "100%", height: "100%" }} contentFit="cover" transition={250} />
        ) : null}
      </View>
    </Pressable>
  );
}

function AutoVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });
  return <VideoView player={player} style={{ width: "100%", height: "100%" }} contentFit="cover" nativeControls={false} />;
}

export function MasonryFeed({ posts, containerWidth, tight }: { posts: Post[]; containerWidth?: number; tight?: boolean }) {
  const { width: winW } = useWindowDimensions();
  const totalW = containerWidth ?? winW;
  const pad = tight ? spacing.sm : spacing.lg;
  const gap = tight ? spacing.sm : spacing.md;
  const colW = (totalW - pad * 2 - gap) / 2;
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
    <View style={[styles.masonry, { paddingHorizontal: pad, gap }]}>
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
  videoPlaceholder: { width: "100%", height: "100%", backgroundColor: colors.onSurface, alignItems: "center", justifyContent: "center" },
  playCircle: { width: 48, height: 48, borderRadius: 24, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center" },
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
});
