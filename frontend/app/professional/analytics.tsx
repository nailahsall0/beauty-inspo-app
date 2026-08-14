import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors, spacing, radius, font, type } from "@/src/theme/tokens";
import { apiFetch } from "@/src/lib/api";
import { Loading, IconBtn } from "@/src/components/ui";

export default function Analytics() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<any>(null);

  const load = useCallback(async () => {
    try { setData(await apiFetch("/professional/me/analytics")); } catch {}
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!data) return <View style={{ flex: 1, backgroundColor: colors.surface }}><Loading /></View>;

  const cards = [
    { label: "Profile Views", value: data.profile_views, icon: "eye-outline" },
    { label: "Post Views", value: data.post_views, icon: "image-multiple-outline" },
    { label: "Likes", value: data.likes, icon: "heart-outline" },
    { label: "Saves", value: data.saves, icon: "bookmark-outline" },
    { label: "Followers", value: data.followers, icon: "account-group-outline" },
    { label: "Tag Confirmations", value: data.tag_confirmations, icon: "check-decagram-outline" },
    { label: "Booking Clicks", value: data.booking_clicks, icon: "calendar-check-outline" },
    { label: "Total Posts", value: data.post_count, icon: "post-outline" },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top + spacing.sm }}>
      <View style={styles.header}>
        <IconBtn icon="chevron-left" onPress={() => router.back()} />
        <Text style={styles.title}>Analytics</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xxl }} showsVerticalScrollIndicator={false}>
        <Text style={[type.body, { marginBottom: spacing.lg }]}>Your performance at a glance.</Text>
        <View style={styles.grid}>
          {cards.map((c) => (
            <View key={c.label} style={styles.card}>
              <MaterialCommunityIcons name={c.icon as any} size={22} color={colors.brandDeep} />
              <Text style={styles.value}>{c.value}</Text>
              <Text style={styles.label}>{c.label}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { fontFamily: font.displaySemi, fontSize: 24, color: colors.onSurface },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  card: { width: "47.5%", backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, gap: 6 },
  value: { fontFamily: font.bold, fontSize: 28, color: colors.onSurface, marginTop: spacing.sm },
  label: { fontFamily: font.medium, fontSize: 12.5, color: colors.muted },
});
