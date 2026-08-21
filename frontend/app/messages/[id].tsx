import React, { useEffect, useState, useRef, useCallback } from "react";
import {
  View, Text, StyleSheet, Pressable, FlatList, TextInput, KeyboardAvoidingView, Platform, Modal, ScrollView
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing, radius, font } from "@/src/theme/tokens";
import { apiFetch, mediaUrl, API, TOKEN_KEY } from "@/src/lib/api";
import { storage } from "@/src/utils/storage";
import { Loading } from "@/src/components/ui";
import { useAuth } from "@/src/context/AuthContext";

type Message = {
  id: string;
  sender_id: string;
  text: string;
  post_id?: string;
  post?: any;
  sender?: any;
  created_at: string;
};

export default function ChatScreen() {
  const router = useRouter();
  const { id: conversationId } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const flatListRef = useRef<FlatList>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [otherUser, setOtherUser] = useState<any>(null);
  const [otherIsPro, setOtherIsPro] = useState(false);
  const [iAmThePro, setIAmThePro] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  // Post attachment
  const [showPostPicker, setShowPostPicker] = useState(false);
  const [selectedPost, setSelectedPost] = useState<any>(null);
  const [myPosts, setMyPosts] = useState<any[]>([]);

  // Load messages
  const loadMessages = useCallback(async () => {
    try {
      const data = await apiFetch<Message[]>(`/conversations/${conversationId}/messages`);
      setMessages(data);
    } catch (e) {
      console.error("Failed to load messages:", e);
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  // Load conversation info
  useEffect(() => {
    const loadConvo = async () => {
      try {
        const convos = await apiFetch<any[]>("/conversations");
        const convo = convos.find((c) => c.id === conversationId);
        if (convo) {
          // other_user is always the other participant
          const other = convo.other_user;

          // Check if other user is the professional
          const otherPro = convo.professional && convo.professional.user_id === other?.id;
          setOtherIsPro(otherPro);

          // Check if I am the professional in this conversation
          const mePro = convo.professional && convo.professional.id === user?.professional_id;
          setIAmThePro(mePro);

          // If they're a professional, include their business name
          if (otherPro) {
            other.business_name = convo.professional.business_name;
          }
          setOtherUser(other);
        }
      } catch (e) {
        console.error("Failed to load conversation:", e);
      }
    };
    loadConvo();
    loadMessages();
  }, [conversationId, loadMessages, user?.professional_id]);

  // WebSocket connection for real-time updates
  useEffect(() => {
    let ws: WebSocket | null = null;

    const connectWebSocket = async () => {
      const token = await storage.secureGet(TOKEN_KEY, "");
      if (!token) return;

      const wsUrl = API.replace("http", "ws").replace("/api", "") + `/ws/${token}`;
      ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("[WS] Connected");
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "new_message" && data.conversation_id === conversationId) {
            setMessages((prev) => [...prev, data.message]);
            // Scroll to bottom
            setTimeout(() => {
              flatListRef.current?.scrollToEnd({ animated: true });
            }, 100);
          }
        } catch (e) {
          console.error("[WS] Parse error:", e);
        }
      };

      ws.onclose = () => {
        console.log("[WS] Disconnected");
      };

      // Keep alive
      const pingInterval = setInterval(() => {
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send("ping");
        }
      }, 30000);

      return () => clearInterval(pingInterval);
    };

    connectWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [conversationId]);

  const openPostPicker = async () => {
    setShowPostPicker(true);
    if (myPosts.length === 0 && user?.id) {
      try {
        const posts = await apiFetch<any[]>(`/users/${user.id}/posts`);
        setMyPosts(posts);
      } catch (e) {
        console.error("Failed to load posts:", e);
      }
    }
  };

  const sendMessage = async () => {
    if (!text.trim() || sending) return;

    setSending(true);
    const messageText = text.trim();
    setText("");

    try {
      const body: any = { text: messageText };
      if (selectedPost) {
        body.post_id = selectedPost.id;
      }
      const msg = await apiFetch<Message>(`/conversations/${conversationId}/messages`, {
        method: "POST",
        body,
      });
      // Message will come through WebSocket, but add it immediately for responsiveness
      setMessages((prev) => {
        if (prev.find((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
      setSelectedPost(null); // Clear selected post after sending
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    } catch (e) {
      console.error("Failed to send message:", e);
      setText(messageText); // Restore text on failure
    } finally {
      setSending(false);
    }
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isMe = item.sender_id === user?.id;

    return (
      <View style={[styles.msgRow, isMe && styles.msgRowMe]}>
        {!isMe && (
          <View style={styles.msgAvatar}>
            {item.sender?.avatar_url ? (
              <Image source={{ uri: mediaUrl(item.sender.avatar_url) }} style={styles.msgAvatarImg} />
            ) : (
              <MaterialCommunityIcons name="account" size={16} color={colors.muted} />
            )}
          </View>
        )}
        <View style={[styles.msgBubble, isMe ? styles.msgBubbleMe : styles.msgBubbleOther]}>
          {item.post && (
            <Pressable
              style={styles.postAttachment}
              onPress={() => router.push(`/post/${item.post.id}`)}
            >
              {item.post.media?.[0] && (
                <Image
                  source={{ uri: mediaUrl(item.post.media[0].url) }}
                  style={styles.postThumb}
                />
              )}
              <Text style={styles.postCaption} numberOfLines={1}>
                {item.post.caption || "View post"}
              </Text>
            </Pressable>
          )}
          <Text style={[styles.msgText, isMe && styles.msgTextMe]}>{item.text}</Text>
        </View>
      </View>
    );
  };

  const displayName = otherUser?.business_name || otherUser?.display_name || otherUser?.username || "Chat";

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={colors.onSurface} />
        </Pressable>
        <View style={styles.headerCenter}>
          <View style={styles.headerNameRow}>
            <Text style={styles.headerName} numberOfLines={1}>{displayName}</Text>
            {otherIsPro && (
              <View style={styles.proBadge}>
                <Text style={styles.proBadgeText}>PRO</Text>
              </View>
            )}
          </View>
          <View style={styles.headerSubRow}>
            {otherUser?.username && (
              <Text style={styles.headerUsername}>@{otherUser.username}</Text>
            )}
            {iAmThePro && (
              <Text style={styles.headerContext}> · Messaging your Pro account</Text>
            )}
          </View>
        </View>
        <View style={{ width: 24 }} />
      </View>

      {/* Messages */}
      {loading ? (
        <View style={styles.center}>
          <Loading />
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.messagesList}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
        />
      )}

      {/* Selected post preview */}
      {selectedPost && (
        <View style={styles.selectedPostBar}>
          <View style={styles.selectedPostContent}>
            {selectedPost.media?.[0] && (
              <Image
                source={{ uri: mediaUrl(selectedPost.media[0].url) }}
                style={styles.selectedPostThumb}
              />
            )}
            <Text style={styles.selectedPostText} numberOfLines={1}>
              {selectedPost.caption || "Post attached"}
            </Text>
          </View>
          <Pressable onPress={() => setSelectedPost(null)} hitSlop={8}>
            <MaterialCommunityIcons name="close" size={20} color={colors.muted} />
          </Pressable>
        </View>
      )}

      {/* Input */}
      <View style={[styles.inputBar, { paddingBottom: insets.bottom + spacing.sm }]}>
        <Pressable onPress={openPostPicker} style={styles.attachBtn}>
          <MaterialCommunityIcons name="image-plus" size={24} color={colors.brandDeep} />
        </Pressable>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="Type a message..."
          placeholderTextColor={colors.muted}
          multiline
          maxLength={2000}
        />
        <Pressable
          testID="send-message"
          onPress={sendMessage}
          disabled={!text.trim() || sending}
          style={[styles.sendBtn, (!text.trim() || sending) && styles.sendBtnDisabled]}
        >
          <MaterialCommunityIcons
            name="send"
            size={22}
            color={text.trim() && !sending ? colors.white : colors.muted}
          />
        </Pressable>
      </View>

      {/* Post picker modal */}
      <Modal visible={showPostPicker} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: insets.bottom }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Attach a Post</Text>
              <Pressable onPress={() => setShowPostPicker(false)} hitSlop={8}>
                <MaterialCommunityIcons name="close" size={24} color={colors.onSurface} />
              </Pressable>
            </View>
            {myPosts.length === 0 ? (
              <View style={styles.emptyPosts}>
                <Text style={styles.emptyText}>No posts yet</Text>
              </View>
            ) : (
              <ScrollView contentContainerStyle={styles.postsGrid}>
                {myPosts.map((post) => (
                  <Pressable
                    key={post.id}
                    style={styles.postGridItem}
                    onPress={() => {
                      setSelectedPost(post);
                      setShowPostPicker(false);
                    }}
                  >
                    {post.media?.[0] && (
                      <Image
                        source={{ uri: mediaUrl(post.media[0].url) }}
                        style={styles.postGridImg}
                      />
                    )}
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.md,
  },
  headerCenter: { flex: 1 },
  headerNameRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  headerName: { fontFamily: font.bold, fontSize: 16, color: colors.onSurface },
  headerSubRow: { flexDirection: "row", alignItems: "center" },
  headerUsername: { fontFamily: font.regular, fontSize: 12, color: colors.muted },
  headerContext: { fontFamily: font.medium, fontSize: 11, color: colors.brandDeep },
  proBadge: { backgroundColor: colors.brandTertiary, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  proBadgeText: { fontFamily: font.bold, fontSize: 9, color: colors.brandDeep, letterSpacing: 0.5 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  messagesList: { padding: spacing.md, gap: spacing.sm },
  msgRow: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm, maxWidth: "85%" },
  msgRowMe: { alignSelf: "flex-end", flexDirection: "row-reverse" },
  msgAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  msgAvatarImg: { width: "100%", height: "100%" },
  msgBubble: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    maxWidth: "100%",
  },
  msgBubbleMe: {
    backgroundColor: colors.brandDeep,
    borderBottomRightRadius: 4,
  },
  msgBubbleOther: {
    backgroundColor: colors.surfaceSecondary,
    borderBottomLeftRadius: 4,
  },
  msgText: { fontFamily: font.regular, fontSize: 15, color: colors.onSurface },
  msgTextMe: { color: colors.white },
  postAttachment: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.1)",
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  postThumb: { width: 40, height: 40, borderRadius: radius.sm },
  postCaption: { fontFamily: font.medium, fontSize: 12, color: colors.onSurface, flex: 1 },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontFamily: font.regular,
    fontSize: 15,
    color: colors.onSurface,
    maxHeight: 100,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.brandDeep,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: {
    backgroundColor: colors.surfaceTertiary,
  },
  attachBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  selectedPostBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
  },
  selectedPostContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  selectedPostThumb: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
  },
  selectedPostText: {
    fontFamily: font.medium,
    fontSize: 13,
    color: colors.onSurface,
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: "70%",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontFamily: font.bold,
    fontSize: 18,
    color: colors.onSurface,
  },
  emptyPosts: {
    padding: spacing.xl,
    alignItems: "center",
  },
  emptyText: {
    fontFamily: font.regular,
    fontSize: 14,
    color: colors.muted,
  },
  postsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    padding: spacing.sm,
  },
  postGridItem: {
    width: "33.33%",
    aspectRatio: 1,
    padding: 2,
  },
  postGridImg: {
    width: "100%",
    height: "100%",
    borderRadius: radius.sm,
  },
});
