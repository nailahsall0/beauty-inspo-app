import React, { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { spacing, radius, font, type } from "@/src/theme/tokens";
import { apiFetch } from "@/src/lib/api";
import { ProRow } from "@/src/components/ProCard";
import { Loading, EmptyState, IconBtn, Pill } from "@/src/components/ui";
import { useTheme } from "@/src/hooks/useTheme";

type Ranked = { professional: any; score: number; distance: number | null; reasons: Record<string, any> };

export default function FindPro() {
  const { postId } = useLocalSearchParams<{ postId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [results, setResults] = useState<Ranked[]>([]);
  const [loading, setLoading] = useState(true);
  const [post, setPost] = useState<any>(null);
  const [strictMatch, setStrictMatch] = useState(false);

  const loadResults = useCallback(async (strict: boolean) => {
    setLoading(true);
    try {
      const r = await apiFetch<Ranked[]>(`/posts/${postId}/professionals?strict=${strict}`);
      setResults(r);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [postId]);

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

  const toggleStrict = () => {
    const newStrict = !strictMatch;
    setStrictMatch(newStrict);
    loadResults(newStrict);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top + spacing.sm }}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <IconBtn icon="close" onPress={() => router.back()} />
        <View style={{ flex: 1, marginLeft: spacing.md }}>
          <Text style={[styles.title, { color: colors.onSurface }]}>Professionals Near You</Text>
          {post?.service_name ? <Text style={[type.small, { color: colors.onSurfaceSecondary }]}>for {post.service_name}{post.style_name ? ` · ${post.style_name}` : ""}</Text> : null}
        </View>
      </View>

      {/* Filter controls */}
      {post?.service_name && (
        <View style={[styles.filterBar, { borderBottomColor: colors.border }]}>
          <View style={styles.filterIndicator}>
            <MaterialCommunityIcons name="magnify" size={16} color={colors.muted} />
            <Text style={[styles.filterText, { color: colors.muted }]}>
              {post.service_name}{post.style_name ? ` · ${post.style_name}` : ""}
            </Text>
          </View>
          <Pill
            testID="strict-toggle"
            label="Exact match"
            active={strictMatch}
            onPress={toggleStrict}
          />
        </View>
      )}

      {loading ? (
        <Loading label="Finding your match…" />
      ) : results.length === 0 ? (
        <EmptyState
          icon="account-search-outline"
          title={strictMatch ? "No exact matches" : "No professionals found"}
          subtitle={strictMatch
            ? "Try turning off 'Exact match' to see more results."
            : "No pros offer this service in your area yet."}
          action={strictMatch ? (
            <Pressable testID="clear-strict" onPress={() => { setStrictMatch(false); loadResults(false); }} style={[styles.clearBtn, { backgroundColor: colors.brandTertiary }]}>
              <Text style={[styles.clearBtnText, { color: colors.brandDeep }]}>Show all results</Text>
            </Pressable>
          ) : undefined}
        />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: insets.bottom + spacing.xxl }} showsVerticalScrollIndicator={false}>
          {results.map((r, i) => (
            <View key={r.professional.id}>
              {i === 0 && r.reasons?.service_match === true && (
                <View style={styles.bestMatch}>
                  <MaterialCommunityIcons name="star-four-points" size={13} color={colors.brandDeep} />
                  <Text style={[styles.bestMatchText, { color: colors.brandDeep }]}>Best match — offers this exact service</Text>
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
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1 },
  title: { fontFamily: font.displaySemi, fontSize: 22 },
  filterBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderBottomWidth: 1 },
  filterIndicator: { flexDirection: "row", alignItems: "center", gap: spacing.xs, flex: 1 },
  filterText: { fontFamily: font.medium, fontSize: 13 },
  bestMatch: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: spacing.sm },
  bestMatchText: { fontFamily: font.bold, fontSize: 12 },
  clearBtn: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.pill },
  clearBtnText: { fontFamily: font.bold, fontSize: 14 },
});
