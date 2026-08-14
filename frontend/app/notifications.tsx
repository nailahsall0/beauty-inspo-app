import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors, spacing, radius, font } from "@/src/theme/tokens";
import { apiFetch } from "@/src/lib/api";
import { Avatar, Loading, EmptyState, IconBtn } from "@/src/components/ui";
import { formatDistanceToNow } from "date-fns";

type Notif = { id: string; type: string; text: string; read: boolean; created_at: string; post_id?: string; actor?: any };

const ICONS: Record<string, string> = {
  like: "heart", comment: "comment", reply: "reply", follow: "account-plus", save: "bookmark",
  tag_request: "tag", tag_confirmed: "check-decagram", tag_rejected: "close-circle", pro_details: "scissors-cutting",
};

export default function Notifications() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const n = await apiFetch<Notif[]>("/notifications");
      setNotifs(n);
      apiFetch("/notifications/read", { method: "POST" }).catch(() => {});
    } catch {} finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top + spacing.sm }}>
      <View style={styles.header}>
        <IconBtn icon="chevron-left" onPress={() => router.back()} />
        <Text style={styles.title}>Notifications</Text>
      </View>
      {loading ? (
        <Loading />
      ) : notifs.length === 0 ? (
        <EmptyState icon="bell-outline" title="No notifications yet" subtitle="Likes, comments, follows and tags will show up here." />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }} showsVerticalScrollIndicator={false}>
          {notifs.map((n) => (
            <Pressable
              key={n.id}
              testID={`notif-${n.id}`}
              onPress={() => n.post_id && router.push(`/post/${n.post_id}`)}
              style={[styles.row, !n.read && styles.unread]}
            >
              <View style={{ position: "relative" }}>
                <Avatar uri={n.actor?.avatar_url} name={n.actor?.display_name} size={44} />
                <View style={styles.iconBadge}>
                  <MaterialCommunityIcons name={(ICONS[n.type] || "bell") as any} size={12} color={colors.white} />
                </View>
              </View>
              <View style={{ flex: 1, marginLeft: spacing.md }}>
                <Text style={styles.text}>{n.text}</Text>
                <Text style={styles.time}>{timeAgo(n.created_at)}</Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function timeAgo(iso: string) {
  try { return formatDistanceToNow(new Date(iso), { addSuffix: true }); } catch { return ""; }
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { fontFamily: font.displaySemi, fontSize: 24, color: colors.onSurface },
  row: { flexDirection: "row", alignItems: "center", padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.divider },
  unread: { backgroundColor: colors.surfaceSecondary },
  iconBadge: { position: "absolute", bottom: -2, right: -2, width: 20, height: 20, borderRadius: 10, backgroundColor: colors.brandDeep, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.surface },
  text: { fontFamily: font.medium, fontSize: 14, color: colors.onSurface, lineHeight: 19 },
  time: { fontFamily: font.regular, fontSize: 12, color: colors.muted, marginTop: 2 },
});
