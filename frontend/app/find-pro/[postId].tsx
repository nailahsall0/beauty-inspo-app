import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors, spacing, radius, font, type } from "@/src/theme/tokens";
import { apiFetch } from "@/src/lib/api";
import { ProRow } from "@/src/components/ProCard";
import { Loading, EmptyState, IconBtn } from "@/src/components/ui";

type Ranked = { professional: any; score: number; distance: number | null; reasons: Record<string, any> };

export default function FindPro() {
  const { postId } = useLocalSearchParams<{ postId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [results, setResults] = useState<Ranked[]>([]);
  const [loading, setLoading] = useState(true);
  const [post, setPost] = useState<any>(null);

  useEffect(() => {
    (async () => {
      try {
        const [r, p] = await Promise.all([
          apiFetch<Ranked[]>(`/posts/${postId}/professionals`),
          apiFetch(`/posts/${postId}`),
        ]);
        setResults(r);
        setPost(p);
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    })();
  }, [postId]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top + spacing.sm }}>
      <View style={styles.header}>
        <IconBtn icon="close" onPress={() => router.back()} />
        <View style={{ flex: 1, marginLeft: spacing.md }}>
          <Text style={styles.title}>Professionals Near You</Text>
          {post?.service_name ? <Text style={type.small}>for {post.service_name}{post.style_name ? ` · ${post.style_name}` : ""}</Text> : null}
        </View>
      </View>

      {loading ? (
        <Loading label="Finding your match…" />
      ) : results.length === 0 ? (
        <EmptyState icon="account-search-outline" title="No professionals yet" subtitle="No pros offer this exact service in your area — try widening your search." />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: insets.bottom + spacing.xxl }} showsVerticalScrollIndicator={false}>
          {results.map((r, i) => (
            <View key={r.professional.id}>
              {i === 0 && r.reasons?.service_match === true && (
                <View style={styles.bestMatch}>
                  <MaterialCommunityIcons name="star-four-points" size={13} color={colors.brandDeep} />
                  <Text style={styles.bestMatchText}>Best match — offers this exact service</Text>
                </View>
              )}
              <ProRow pro={{ ...r.professional, distance: r.distance }} reasons={r.reasons} />
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { fontFamily: font.displaySemi, fontSize: 22, color: colors.onSurface },
  bestMatch: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: spacing.sm },
  bestMatchText: { fontFamily: font.bold, fontSize: 12, color: colors.brandDeep },
});
