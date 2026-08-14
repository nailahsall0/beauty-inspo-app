import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing, radius, font } from "@/src/theme/tokens";
import { apiFetch } from "@/src/lib/api";
import { Avatar, VerifiedBadge, Loading, EmptyState, IconBtn } from "@/src/components/ui";

type Row = {
  id: string;
  username: string;
  display_name: string;
  avatar_url?: string | null;
  is_professional: boolean;
  professional_id?: string | null;
  is_following: boolean;
  is_me: boolean;
};

export default function Connections() {
  const { id, type } = useLocalSearchParams<{ id: string; type: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<Row[] | null>(null);
  const kind = type === "following" ? "following" : "followers";

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<Row[]>(`/users/${id}/${kind}`);
      setRows(data);
    } catch {
      setRows([]);
    }
  }, [id, kind]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const toggle = async (row: Row) => {
    setRows((rs) => rs!.map((r) => (r.id === row.id ? { ...r, is_following: !r.is_following } : r)));
    try {
      await apiFetch(`/users/${row.id}/follow`, { method: row.is_following ? "DELETE" : "POST" });
    } catch { load(); }
  };

  const openProfile = (row: Row) => {
    if (row.professional_id) router.push(`/professional/${row.professional_id}`);
    else router.push(`/user/${row.id}`);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top + spacing.sm }}>
      <View style={styles.header}>
        <IconBtn icon="chevron-left" onPress={() => router.back()} />
        <Text style={styles.title}>{kind === "following" ? "Following" : "Followers"}</Text>
      </View>
      {!rows ? (
        <Loading />
      ) : rows.length === 0 ? (
        <EmptyState icon="account-group-outline" title={kind === "following" ? "Not following anyone yet" : "No followers yet"} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: insets.bottom + spacing.xxl }} showsVerticalScrollIndicator={false}>
          {rows.map((r) => (
            <View key={r.id} style={styles.row}>
              <Pressable testID={`connection-${r.id}`} onPress={() => openProfile(r)} style={styles.rowLeft}>
                <Avatar uri={r.avatar_url} name={r.display_name} size={46} />
                <View style={{ marginLeft: spacing.md, flex: 1 }}>
                  <View style={styles.nameRow}>
                    <Text style={styles.name} numberOfLines={1}>{r.display_name}</Text>
                    {r.is_professional && <VerifiedBadge status="VERIFIED" size={13} />}
                  </View>
                  <Text style={styles.sub}>@{r.username} · {r.is_professional ? "Professional" : "Client"}</Text>
                </View>
              </Pressable>
              {!r.is_me && (
                <Pressable testID={`follow-toggle-${r.id}`} onPress={() => toggle(r)} style={[styles.followBtn, r.is_following && styles.followingBtn]}>
                  <Text style={[styles.followText, r.is_following && { color: colors.onSurface }]}>{r.is_following ? "Following" : "Follow"}</Text>
                </Pressable>
              )}
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { fontFamily: font.displaySemi, fontSize: 24, color: colors.onSurface },
  row: { flexDirection: "row", alignItems: "center" },
  rowLeft: { flexDirection: "row", alignItems: "center", flex: 1 },
  nameRow: { flexDirection: "row", alignItems: "center" },
  name: { fontFamily: font.bold, fontSize: 15, color: colors.onSurface },
  sub: { fontFamily: font.regular, fontSize: 12.5, color: colors.muted, marginTop: 1 },
  followBtn: { backgroundColor: colors.brand, borderRadius: radius.pill, paddingHorizontal: spacing.lg, height: 36, alignItems: "center", justifyContent: "center" },
  followingBtn: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  followText: { fontFamily: font.bold, fontSize: 13, color: colors.onSurface },
});
