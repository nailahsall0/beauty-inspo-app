import React, { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, Pressable, FlatList, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { formatDistanceToNow } from "date-fns";
import { colors, spacing, radius, font, type } from "@/src/theme/tokens";
import { apiFetch, mediaUrl } from "@/src/lib/api";
import { Loading } from "@/src/components/ui";
import { useAuth } from "@/src/context/AuthContext";

type Conversation = {
  id: string;
  other_user: any;
  professional?: any;
  last_message?: any;
  unread_count: number;
  last_message_at: string;
};

export default function MessagesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<Conversation[]>("/conversations");
      setConversations(data);
    } catch (e) {
      console.error("Failed to load conversations:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const formatTime = (iso: string) => {
    try {
      return formatDistanceToNow(new Date(iso), { addSuffix: true });
    } catch {
      return "";
    }
  };

  const renderConversation = ({ item }: { item: Conversation }) => {
    // Determine if the other user is a professional (not me)
    const otherIsPro = item.professional && item.professional.user_id === item.other_user?.id;
    // Determine if I'm the professional in this conversation
    const iAmThePro = item.professional && item.professional.id === user?.professional_id;

    // Always show the other user's info
    const displayName = otherIsPro
      ? item.professional.business_name || item.other_user?.display_name
      : item.other_user?.display_name || item.other_user?.username || "User";
    const avatar = item.other_user?.avatar_url;
    const lastText = item.last_message?.text || "No messages yet";
    const isUnread = item.unread_count > 0;

    return (
      <Pressable
        testID={`conversation-${item.id}`}
        style={styles.convoRow}
        onPress={() => router.push(`/messages/${item.id}`)}
      >
        <View style={styles.avatar}>
          {avatar ? (
            <Image source={{ uri: mediaUrl(avatar) }} style={styles.avatarImg} />
          ) : (
            <MaterialCommunityIcons name="account" size={28} color={colors.muted} />
          )}
        </View>
        <View style={styles.convoContent}>
          <View style={styles.convoHeader}>
            <View style={styles.nameRow}>
              <Text style={[styles.convoName, isUnread && styles.unreadText]} numberOfLines={1}>
                {displayName}
              </Text>
              {otherIsPro && (
                <View style={styles.proBadge}>
                  <Text style={styles.proBadgeText}>PRO</Text>
                </View>
              )}
              {iAmThePro && (
                <View style={styles.clientBadge}>
                  <Text style={styles.clientBadgeText}>Client</Text>
                </View>
              )}
            </View>
            <Text style={styles.convoTime}>{formatTime(item.last_message_at)}</Text>
          </View>
          <View style={styles.convoPreview}>
            <Text
              style={[styles.convoText, isUnread && styles.unreadText]}
              numberOfLines={1}
            >
              {lastText}
            </Text>
            {isUnread && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadCount}>{item.unread_count}</Text>
              </View>
            )}
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Messages</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <Loading />
        </View>
      ) : conversations.length === 0 ? (
        <View style={styles.center}>
          <MaterialCommunityIcons name="message-text-outline" size={48} color={colors.muted} />
          <Text style={styles.emptyTitle}>No messages yet</Text>
          <Text style={styles.emptyText}>
            Start a conversation with a professional from their profile or a post.
          </Text>
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.id}
          renderItem={renderConversation}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          contentContainerStyle={styles.list}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: { fontFamily: font.bold, fontSize: 18, color: colors.onSurface },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  emptyTitle: { fontFamily: font.semibold, fontSize: 18, color: colors.onSurface, marginTop: spacing.lg },
  emptyText: { fontFamily: font.regular, fontSize: 14, color: colors.muted, textAlign: "center", marginTop: spacing.sm },
  list: { paddingVertical: spacing.sm },
  convoRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImg: { width: "100%", height: "100%" },
  convoContent: { flex: 1 },
  convoHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  nameRow: { flexDirection: "row", alignItems: "center", flex: 1, gap: spacing.xs },
  convoName: { fontFamily: font.semibold, fontSize: 15, color: colors.onSurface, flexShrink: 1 },
  proBadge: { backgroundColor: colors.brandTertiary, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  proBadgeText: { fontFamily: font.bold, fontSize: 9, color: colors.brandDeep, letterSpacing: 0.5 },
  clientBadge: { backgroundColor: colors.surfaceTertiary, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  clientBadgeText: { fontFamily: font.semibold, fontSize: 9, color: colors.muted },
  convoTime: { fontFamily: font.regular, fontSize: 12, color: colors.muted },
  convoPreview: { flexDirection: "row", alignItems: "center", marginTop: 2 },
  convoText: { fontFamily: font.regular, fontSize: 14, color: colors.muted, flex: 1 },
  unreadText: { fontFamily: font.bold, color: colors.onSurface },
  unreadBadge: {
    backgroundColor: colors.brandDeep,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  unreadCount: { fontFamily: font.bold, fontSize: 11, color: colors.white },
});
