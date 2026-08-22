import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, useWindowDimensions, Modal } from "react-native";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, { useSharedValue, useAnimatedStyle, withSpring, runOnJS } from "react-native-reanimated";

// Dynamically import to handle Expo Go (which lacks native modules)
let MediaLibrary: typeof import("expo-media-library") | null = null;
let FileSystem: typeof import("expo-file-system/legacy") | null = null;
try {
  MediaLibrary = require("expo-media-library");
  FileSystem = require("expo-file-system/legacy");
} catch (e) {
  console.log("Media library not available (Expo Go)");
}
import { colors, spacing, radius, font, type } from "@/src/theme/tokens";
import { apiFetch, mediaUrl } from "@/src/lib/api";
import { Avatar, VerifiedBadge, Btn, IconBtn, Loading } from "@/src/components/ui";
import { Post } from "@/src/components/Feed";
import { SaveSheet } from "@/src/components/SaveSheet";
import { useAuth } from "@/src/context/AuthContext";
import { useToast } from "@/src/components/Toast";

type Comment = { id: string; text: string; parent_id?: string | null; author: any; created_at: string };

export default function PostDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { user } = useAuth();
  const toast = useToast();
  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [comment, setComment] = useState("");
  const [showDetails, setShowDetails] = useState(false);
  const [proDetailsInput, setProDetailsInput] = useState("");
  const [addingDetails, setAddingDetails] = useState(false);
  const [saveSheet, setSaveSheet] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showShareToPro, setShowShareToPro] = useState(false);
  const [pros, setPros] = useState<any[]>([]);
  const [loadingPros, setLoadingPros] = useState(false);
  const [showImageViewer, setShowImageViewer] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, c] = await Promise.all([apiFetch<Post>(`/posts/${id}`), apiFetch<Comment[]>(`/posts/${id}/comments`)]);
      setPost(p);
      setComments(c);
    } catch (e: any) {
      toast.show("Could not load post", "error");
    }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!post) return <View style={{ flex: 1, backgroundColor: colors.surface }}><Loading /></View>;

  const media = post.media?.[0];
  const isVideo = media?.type === "video";
  const attrs = post.attributes || {};
  const attrEntries = Object.entries(attrs).filter(([, v]) => v);
  const tagged = post.tagged_professional;
  const isTaggedPro = user?.professional_id && tagged?.id === user.professional_id;
  const canFindPro = !!(post.service_name || post.style_name);
  const isAuthor = user?.id === post.author?.id;

  const doDelete = async () => {
    try {
      await apiFetch(`/posts/${post.id}`, { method: "DELETE" });
      setConfirmDelete(false);
      toast.show("Post deleted", "success");
      router.back();
    } catch (e: any) {
      toast.show(e.message || "Failed to delete", "error");
    }
  };

  const toggleLike = async () => {
    if (!post) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const liked = !post.liked;
    setPost({ ...post, liked, like_count: post.like_count + (liked ? 1 : -1) });
    try {
      await apiFetch(`/posts/${post.id}/like`, { method: liked ? "POST" : "DELETE" });
    } catch { load(); }
  };

  const toggleSave = async () => {
    if (!post) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const saved = !post.saved;
    setPost({ ...post, saved, save_count: post.save_count + (saved ? 1 : -1) });
    try {
      await apiFetch(`/posts/${post.id}/save`, { method: saved ? "POST" : "DELETE" });
      toast.show(saved ? "Saved to your looks" : "Removed", saved ? "success" : "info");
    } catch { load(); }
  };

  const sendComment = async () => {
    if (!comment.trim()) return;
    try {
      const c = await apiFetch<Comment>(`/posts/${post.id}/comments`, { method: "POST", body: { text: comment.trim() } });
      setComments((prev) => [...prev, c]);
      setComment("");
      setPost({ ...post, comment_count: (post as any).comment_count + 1 });
    } catch (e: any) {
      toast.show(e.message || "Failed", "error");
    }
  };

  const respondTag = async (accept: boolean) => {
    try {
      await apiFetch(`/posts/${post.id}/tag/respond?accept=${accept}`, { method: "POST" });
      toast.show(accept ? "Tag confirmed" : "Tag rejected", accept ? "success" : "info");
      load();
    } catch (e: any) {
      toast.show(e.message || "Failed", "error");
    }
  };

  const submitProDetails = async () => {
    if (!proDetailsInput.trim()) return;
    try {
      await apiFetch(`/posts/${post.id}/professional-details`, { method: "POST", body: { details: proDetailsInput.trim() } });
      setAddingDetails(false);
      setProDetailsInput("");
      toast.show("Professional details added", "success");
      load();
    } catch (e: any) {
      toast.show(e.message || "Failed", "error");
    }
  };

  const report = async () => {
    try {
      await apiFetch("/reports", { method: "POST", body: { target_type: "post", target_id: post.id, reason: "Inappropriate content" } });
      toast.show("Reported. Thank you.", "success");
    } catch {}
  };

  const openShareToPro = async () => {
    setShowShareToPro(true);
    if (pros.length === 0) {
      setLoadingPros(true);
      try {
        // Get professionals from existing conversations and nearby
        const [convos, nearby] = await Promise.all([
          apiFetch<any[]>("/conversations").catch(() => []),
          apiFetch<any[]>("/professionals/search?limit=10").catch(() => []),
        ]);

        // Extract professionals from conversations (exclude self)
        const myProId = user?.professional_id;
        const convoPros = convos
          .filter((c) => c.professional && c.professional.id !== myProId)
          .map((c) => ({ ...c.professional, from_conversation: true, conversation_id: c.id }));

        // Combine and dedupe (exclude self)
        const allPros = [...convoPros];
        for (const p of nearby) {
          if (p.id !== myProId && !allPros.find((x) => x.id === p.id)) {
            allPros.push(p);
          }
        }
        setPros(allPros);
      } catch (e) {
        console.error("Failed to load pros:", e);
      } finally {
        setLoadingPros(false);
      }
    }
  };

  const sendToPro = async (pro: any) => {
    try {
      // If we have an existing conversation, send message there
      if (pro.conversation_id) {
        await apiFetch(`/conversations/${pro.conversation_id}/messages`, {
          method: "POST",
          body: { text: "Check out this look!", post_id: post?.id },
        });
        setShowShareToPro(false);
        router.push(`/messages/${pro.conversation_id}`);
      } else {
        // Start new conversation
        const result = await apiFetch<{ conversation_id: string }>("/conversations", {
          method: "POST",
          body: { professional_id: pro.id, text: "Check out this look!", post_id: post?.id },
        });
        setShowShareToPro(false);
        router.push(`/messages/${result.conversation_id}`);
      }
    } catch (e: any) {
      toast.show(e.message || "Failed to send", "error");
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
        {/* Hero */}
        <Pressable
          style={{ width, aspectRatio: 0.85, backgroundColor: colors.surfaceTertiary }}
          onPress={() => !isVideo && setShowImageViewer(true)}
        >
          {media && (isVideo ? <PostVideo uri={mediaUrl(media.url)!} /> : <Image source={{ uri: mediaUrl(media.url) }} style={{ width: "100%", height: "100%" }} contentFit="cover" transition={200} />)}
          <View style={[styles.heroBar, { top: insets.top + spacing.sm }]}>
            <IconBtn icon="chevron-left" onPress={() => router.back()} bg="rgba(253,251,247,0.9)" />
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <IconBtn icon="share-variant-outline" onPress={() => toast.show("Share coming soon", "info")} bg="rgba(253,251,247,0.9)" />
              {isAuthor ? (
                <>
                  <IconBtn testID="post-edit" icon="pencil-outline" onPress={() => router.push(`/post/edit/${post.id}`)} bg="rgba(253,251,247,0.9)" />
                  <IconBtn testID="post-delete" icon="trash-can-outline" onPress={() => setConfirmDelete(true)} bg="rgba(253,251,247,0.9)" />
                </>
              ) : (
                <IconBtn testID="post-report" icon="flag-outline" onPress={report} bg="rgba(253,251,247,0.9)" />
              )}
            </View>
          </View>
        </Pressable>

        <View style={styles.body}>
          {/* Author */}
          <Pressable style={styles.authorRow} onPress={() => router.push(`/user/${post.author.id}`)} testID="post-author">
            <Avatar uri={post.author?.avatar_url} name={post.author?.display_name} size={40} />
            <View style={{ flex: 1, marginLeft: spacing.md }}>
              <Text style={styles.authorName}>{post.author?.display_name}</Text>
              <Text style={styles.authorHandle}>@{post.author?.username} · {post.post_type === "professional" ? "Pro" : "Client"}</Text>
            </View>
          </Pressable>

          {post.caption ? <Text style={styles.caption}>{post.caption}</Text> : null}

          {/* Title */}
          {(post.service_name || post.style_name) && (
            <Text style={styles.lookTitle}>{post.service_name || post.style_name}</Text>
          )}
          {attrEntries.length > 0 && (
            <Text style={styles.lookSub}>
              {attrEntries.slice(0, 2).map(([k, v]) => `${v}`).join(" · ")}
            </Text>
          )}

          {/* Details toggle */}
          <Pressable testID="post-view-details" onPress={() => setShowDetails((s) => !s)} style={styles.detailsToggle}>
            <Text style={styles.detailsToggleText}>{showDetails ? "Hide Details" : "View Details"}</Text>
            <MaterialCommunityIcons name={showDetails ? "chevron-up" : "chevron-down"} size={20} color={colors.brandDeep} />
          </Pressable>

          {showDetails && (
            <View style={styles.detailsCard}>
              <DetailRow label="SERVICE" value={post.service_name} />
              <DetailRow label="STYLE" value={post.style_name} />
              {attrEntries.map(([k, v]) => (
                <DetailRow key={k} label={k.toUpperCase()} value={String(v)} />
              ))}
              <DetailRow label="LOCATION" value={[post.city, (post as any).state].filter(Boolean).join(", ")} />
            </View>
          )}

          {/* Professional attribution */}
          {tagged && post_tag_confirmed(post) && (
            <Pressable testID="post-tagged-pro" onPress={() => router.push(`/professional/${tagged.id}`)} style={styles.proAttrib}>
              <MaterialCommunityIcons name="check-decagram" size={18} color={colors.brandDeep} />
              <Text style={styles.proAttribText}>
                Done by <Text style={{ fontFamily: font.bold }}>@{tagged.username}</Text>
              </Text>
              <MaterialCommunityIcons name="chevron-right" size={18} color={colors.faint} style={{ marginLeft: "auto" }} />
            </Pressable>
          )}

          {/* Pending tag response for the tagged pro */}
          {isTaggedPro && (post as any).tag_status === "pending" && (
            <View style={styles.tagRespond}>
              <Text style={styles.tagRespondTitle}>You were tagged in this post</Text>
              <Text style={type.small}>Confirm if you performed this service.</Text>
              <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
                <Btn testID="tag-reject" label="Reject" variant="outline" onPress={() => respondTag(false)} style={{ flex: 1, height: 44 }} />
                <Btn testID="tag-confirm" label="Confirm" onPress={() => respondTag(true)} style={{ flex: 1, height: 44 }} />
              </View>
            </View>
          )}

          {/* Professional details block */}
          {post.professional_details ? (
            <View style={styles.proDetails}>
              <View style={styles.proDetailsHeader}>
                <MaterialCommunityIcons name="scissors-cutting" size={16} color={colors.brandDeep} />
                <Text style={styles.proDetailsTitle}>PROFESSIONAL DETAILS</Text>
              </View>
              <Text style={styles.proDetailsText}>{post.professional_details}</Text>
              {tagged && <Text style={styles.proDetailsBy}>— @{tagged.username}</Text>}
            </View>
          ) : isTaggedPro && post_tag_confirmed(post) ? (
            addingDetails ? (
              <View style={styles.proDetails}>
                <TextInput
                  testID="pro-details-input"
                  value={proDetailsInput}
                  onChangeText={setProDetailsInput}
                  placeholder="Medium boho knotless · Waist length · 3 packs X-Pression · ~6 hours"
                  placeholderTextColor={colors.faint}
                  multiline
                  style={styles.proDetailsInput}
                />
                <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
                  <Btn label="Cancel" variant="outline" onPress={() => setAddingDetails(false)} style={{ flex: 1, height: 42 }} />
                  <Btn testID="pro-details-submit" label="Add" onPress={submitProDetails} style={{ flex: 1, height: 42 }} />
                </View>
              </View>
            ) : (
              <Btn testID="add-pro-details" label="Add Professional Details" variant="secondary" icon="plus" onPress={() => setAddingDetails(true)} style={{ marginTop: spacing.md, height: 46 }} />
            )
          ) : null}

          {/* Actions */}
          <View style={styles.actions}>
            <Pressable testID="post-like" onPress={toggleLike} style={styles.actionBtn}>
              <MaterialCommunityIcons name={post.liked ? "heart" : "heart-outline"} size={24} color={post.liked ? colors.pinkDeep : colors.onSurface} />
              <Text style={styles.actionCount}>{post.like_count}</Text>
            </Pressable>
            <View style={styles.actionBtn}>
              <MaterialCommunityIcons name="comment-outline" size={22} color={colors.onSurface} />
              <Text style={styles.actionCount}>{(post as any).comment_count}</Text>
            </View>
            <Pressable testID="post-save" onPress={toggleSave} onLongPress={() => setSaveSheet(true)} delayLongPress={250} style={styles.actionBtn}>
              <MaterialCommunityIcons name={post.saved ? "bookmark" : "bookmark-outline"} size={23} color={post.saved ? colors.brandDeep : colors.onSurface} />
              <Text style={styles.actionCount}>{post.save_count}</Text>
            </Pressable>
            <Pressable testID="post-save-to" onPress={() => setSaveSheet(true)} style={styles.actionBtn}>
              <MaterialCommunityIcons name="folder-plus-outline" size={22} color={colors.onSurface} />
            </Pressable>
            <Pressable testID="post-send-to-pro" onPress={openShareToPro} style={styles.actionBtn}>
              <MaterialCommunityIcons name="send-outline" size={22} color={colors.onSurface} />
            </Pressable>
          </View>

          {/* Comments */}
          <Text style={styles.commentsTitle}>Comments</Text>
          {comments.length === 0 ? (
            <Text style={[type.small, { marginTop: spacing.sm }]}>Be the first to comment.</Text>
          ) : (
            comments.map((c) => (
              <View key={c.id} style={[styles.comment, c.parent_id && { marginLeft: spacing.xl }]}>
                <Avatar uri={c.author?.avatar_url} name={c.author?.display_name} size={32} />
                <View style={{ flex: 1, marginLeft: spacing.sm }}>
                  <Text style={styles.commentAuthor}>{c.author?.display_name}</Text>
                  <Text style={styles.commentText}>{c.text}</Text>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* Sticky bottom: comment input + Find Pro */}
      <KeyboardStickyView offset={{ closed: 0, opened: 0 }}>
        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + spacing.sm }]}>
          <View style={styles.commentInputRow}>
            <TextInput
              testID="comment-input"
              value={comment}
              onChangeText={setComment}
              placeholder="Add a comment…"
              placeholderTextColor={colors.faint}
              style={styles.commentInput}
            />
            <Pressable testID="comment-send" onPress={sendComment} style={styles.sendBtn}>
              <MaterialCommunityIcons name="send" size={18} color={colors.onSurfaceInverse} />
            </Pressable>
          </View>
          {canFindPro && (
            <Btn
              testID="find-pro-cta"
              label="Find Someone Who Can Do This"
              icon="map-marker-radius-outline"
              onPress={() => router.push(`/find-pro/${post.id}`)}
              style={{ marginTop: spacing.sm, height: 50 }}
            />
          )}
        </View>
      </KeyboardStickyView>

      <SaveSheet
        visible={saveSheet}
        postId={post.id}
        onClose={() => setSaveSheet(false)}
        onChanged={() => setPost((p) => (p && !p.saved ? { ...p, saved: true, save_count: p.save_count + 1 } : p))}
      />

      <Modal visible={confirmDelete} transparent animationType="fade" onRequestClose={() => setConfirmDelete(false)}>
        <Pressable style={styles.confirmBackdrop} onPress={() => setConfirmDelete(false)} />
        <View style={styles.confirmCard} testID="delete-confirm">
          <Text style={styles.confirmTitle}>Delete this post?</Text>
          <Text style={styles.confirmSub}>This can't be undone. Your look will be removed for everyone.</Text>
          <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg }}>
            <Btn label="Cancel" variant="outline" onPress={() => setConfirmDelete(false)} style={{ flex: 1, height: 46 }} />
            <Btn testID="delete-confirm-btn" label="Delete" variant="dark" onPress={doDelete} style={{ flex: 1, height: 46 }} />
          </View>
        </View>
      </Modal>

      {/* Send to Pro Modal */}
      <Modal visible={showShareToPro} transparent animationType="slide" onRequestClose={() => setShowShareToPro(false)}>
        <View style={styles.shareModalOverlay}>
          <View style={[styles.shareModalContent, { paddingBottom: insets.bottom }]}>
            <View style={styles.shareModalHeader}>
              <Text style={styles.shareModalTitle}>Send to a Professional</Text>
              <Pressable onPress={() => setShowShareToPro(false)} hitSlop={8}>
                <MaterialCommunityIcons name="close" size={24} color={colors.onSurface} />
              </Pressable>
            </View>
            {loadingPros ? (
              <View style={styles.shareModalLoading}>
                <Loading />
              </View>
            ) : pros.length === 0 ? (
              <View style={styles.shareModalEmpty}>
                <MaterialCommunityIcons name="account-search" size={48} color={colors.muted} />
                <Text style={styles.shareModalEmptyText}>No professionals found</Text>
                <Text style={styles.shareModalEmptySub}>Find a professional from your Nearby feed</Text>
              </View>
            ) : (
              <ScrollView style={styles.shareModalList}>
                {pros.map((pro) => (
                  <Pressable key={pro.id} style={styles.proRow} onPress={() => sendToPro(pro)}>
                    <Avatar uri={pro.avatar_url} name={pro.business_name || pro.display_name} size={48} />
                    <View style={styles.proRowInfo}>
                      <Text style={styles.proRowName}>{pro.business_name || pro.display_name}</Text>
                      <Text style={styles.proRowSub}>@{pro.username}</Text>
                    </View>
                    {pro.from_conversation && (
                      <View style={styles.recentBadge}>
                        <Text style={styles.recentBadgeText}>Recent</Text>
                      </View>
                    )}
                    <MaterialCommunityIcons name="chevron-right" size={22} color={colors.muted} />
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Full-screen Image Viewer with Zoom/Pan */}
      <Modal visible={showImageViewer} transparent animationType="fade" onRequestClose={() => setShowImageViewer(false)}>
        <ZoomableImage
          uri={mediaUrl(media?.url)}
          onClose={() => setShowImageViewer(false)}
        />
      </Modal>
    </View>
  );
}

function ZoomableImage({ uri, onClose, onDownload }: { uri?: string; onClose: () => void; onDownload?: () => void }) {
  const { width: screenW, height: screenH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    if (!uri || downloading) return;

    // Check if native modules are available
    if (!MediaLibrary || !FileSystem) {
      alert("Download not available in Expo Go. Use a development build.");
      return;
    }

    try {
      setDownloading(true);

      // Request permission
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== "granted") {
        alert("Permission needed to save photos");
        return;
      }

      // Download to local file
      const filename = uri.split("/").pop() || "image.jpg";
      const localUri = FileSystem.cacheDirectory + filename;

      await FileSystem.downloadAsync(uri, localUri);

      // Save to camera roll
      await MediaLibrary.saveToLibraryAsync(localUri);

      // Clean up
      await FileSystem.deleteAsync(localUri, { idempotent: true });

      alert("Saved to camera roll!");
    } catch (e) {
      console.error("Download failed:", e);
      alert("Failed to save image");
    } finally {
      setDownloading(false);
    }
  };

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = savedScale.value * e.scale;
    })
    .onEnd(() => {
      if (scale.value < 1) {
        scale.value = withSpring(1);
        savedScale.value = 1;
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else if (scale.value > 4) {
        scale.value = withSpring(4);
        savedScale.value = 4;
      } else {
        savedScale.value = scale.value;
      }
    });

  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      if (scale.value > 1) {
        translateX.value = savedTranslateX.value + e.translationX;
        translateY.value = savedTranslateY.value + e.translationY;
      }
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1) {
        scale.value = withSpring(1);
        savedScale.value = 1;
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else {
        scale.value = withSpring(2.5);
        savedScale.value = 2.5;
      }
    });

  const singleTapGesture = Gesture.Tap()
    .onEnd(() => {
      runOnJS(onClose)();
    });

  const composedGesture = Gesture.Simultaneous(
    pinchGesture,
    panGesture,
    Gesture.Exclusive(doubleTapGesture, singleTapGesture)
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: "black" }}>
      <GestureDetector gesture={composedGesture}>
        <Animated.View style={[{ flex: 1, justifyContent: "center", alignItems: "center" }, animatedStyle]}>
          <Image
            source={{ uri }}
            style={{ width: screenW, height: screenH }}
            contentFit="contain"
          />
        </Animated.View>
      </GestureDetector>
      <View style={{
        position: "absolute",
        top: insets.top + spacing.md,
        right: spacing.lg,
        flexDirection: "row",
        gap: spacing.sm,
      }}>
        <Pressable
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: "rgba(0,0,0,0.5)",
            alignItems: "center",
            justifyContent: "center",
          }}
          onPress={handleDownload}
          disabled={downloading}
        >
          <MaterialCommunityIcons
            name={downloading ? "loading" : "download"}
            size={24}
            color="white"
          />
        </Pressable>
        <Pressable
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: "rgba(0,0,0,0.5)",
            alignItems: "center",
            justifyContent: "center",
          }}
          onPress={onClose}
        >
          <MaterialCommunityIcons name="close" size={24} color="white" />
        </Pressable>
      </View>
      <Text style={{
        position: "absolute",
        bottom: insets.bottom + spacing.lg,
        alignSelf: "center",
        color: "rgba(255,255,255,0.6)",
        fontFamily: font.regular,
        fontSize: 12,
      }}>
        Pinch to zoom · Double-tap to toggle · Tap to close
      </Text>
    </GestureHandlerRootView>
  );
}

function post_tag_confirmed(post: any) {
  return post.tag_status === "confirmed";
}

function PostVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = false;
    p.play();
  });
  return <VideoView player={player} style={{ width: "100%", height: "100%" }} contentFit="contain" nativeControls allowsFullscreen />;
}

function DetailRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  heroBar: { position: "absolute", left: spacing.lg, right: spacing.lg, flexDirection: "row", justifyContent: "space-between" },
  body: { padding: spacing.lg },
  authorRow: { flexDirection: "row", alignItems: "center" },
  authorName: { fontFamily: font.bold, fontSize: 15, color: colors.onSurface },
  authorHandle: { fontFamily: font.regular, fontSize: 12.5, color: colors.muted },
  caption: { fontFamily: font.regular, fontSize: 15, lineHeight: 22, color: colors.onSurface, marginTop: spacing.md },
  lookTitle: { fontFamily: font.displaySemi, fontSize: 28, color: colors.onSurface, marginTop: spacing.md },
  lookSub: { fontFamily: font.medium, fontSize: 14, color: colors.muted, marginTop: 2 },
  detailsToggle: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: spacing.md },
  detailsToggleText: { fontFamily: font.bold, fontSize: 14, color: colors.brandDeep },
  detailsCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, marginTop: spacing.md, gap: spacing.md },
  detailRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  detailLabel: { fontFamily: font.semibold, fontSize: 11, color: colors.muted, letterSpacing: 0.6 },
  detailValue: { fontFamily: font.semibold, fontSize: 14, color: colors.onSurface, flexShrink: 1, textAlign: "right", marginLeft: spacing.md },
  proAttrib: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.brandTertiary, borderRadius: radius.lg, padding: spacing.md, marginTop: spacing.md },
  proAttribText: { fontFamily: font.medium, fontSize: 14, color: colors.onSurface },
  tagRespond: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, marginTop: spacing.md, borderWidth: 1, borderColor: colors.borderStrong },
  tagRespondTitle: { fontFamily: font.bold, fontSize: 15, color: colors.onSurface, marginBottom: 2 },
  proDetails: { backgroundColor: "#F3EEF8", borderRadius: radius.lg, padding: spacing.lg, marginTop: spacing.md, borderLeftWidth: 3, borderLeftColor: colors.brandDeep },
  proDetailsHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: spacing.sm },
  proDetailsTitle: { fontFamily: font.bold, fontSize: 11, color: colors.brandDeep, letterSpacing: 0.8 },
  proDetailsText: { fontFamily: font.medium, fontSize: 14, lineHeight: 21, color: colors.onSurface },
  proDetailsBy: { fontFamily: font.semibold, fontSize: 12, color: colors.muted, marginTop: spacing.sm },
  proDetailsInput: { fontFamily: font.medium, fontSize: 14, color: colors.onSurface, minHeight: 70, textAlignVertical: "top" },
  actions: { flexDirection: "row", gap: spacing.xl, marginTop: spacing.xl, paddingTop: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 6 },
  actionCount: { fontFamily: font.semibold, fontSize: 14, color: colors.onSurface },
  commentsTitle: { fontFamily: font.displaySemi, fontSize: 22, color: colors.onSurface, marginTop: spacing.xl },
  comment: { flexDirection: "row", marginTop: spacing.lg },
  commentAuthor: { fontFamily: font.bold, fontSize: 13, color: colors.onSurface },
  commentText: { fontFamily: font.regular, fontSize: 14, lineHeight: 20, color: colors.onSurfaceSecondary, marginTop: 1 },
  bottomBar: { backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  commentInputRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  commentInput: { flex: 1, backgroundColor: colors.surfaceSecondary, borderRadius: radius.pill, paddingHorizontal: spacing.lg, height: 44, fontFamily: font.medium, fontSize: 14, color: colors.onSurface },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brandDeep, alignItems: "center", justifyContent: "center" },
  confirmBackdrop: { flex: 1, backgroundColor: colors.scrim },
  confirmCard: { position: "absolute", left: spacing.lg, right: spacing.lg, top: "40%", backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.xl },
  confirmTitle: { fontFamily: font.displaySemi, fontSize: 22, color: colors.onSurface, marginBottom: spacing.xs },
  confirmSub: { fontFamily: font.regular, fontSize: 14, lineHeight: 20, color: colors.muted },
  shareModalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  shareModalContent: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, maxHeight: "70%" },
  shareModalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  shareModalTitle: { fontFamily: font.bold, fontSize: 18, color: colors.onSurface },
  shareModalLoading: { padding: spacing.xl, alignItems: "center" },
  shareModalEmpty: { padding: spacing.xl, alignItems: "center", gap: spacing.sm },
  shareModalEmptyText: { fontFamily: font.semibold, fontSize: 16, color: colors.onSurface },
  shareModalEmptySub: { fontFamily: font.regular, fontSize: 14, color: colors.muted, textAlign: "center" },
  shareModalList: { padding: spacing.md },
  proRow: { flexDirection: "row", alignItems: "center", padding: spacing.md, borderRadius: radius.lg, marginBottom: spacing.sm, backgroundColor: colors.surfaceSecondary },
  proRowInfo: { flex: 1, marginLeft: spacing.md },
  proRowName: { fontFamily: font.bold, fontSize: 15, color: colors.onSurface },
  proRowSub: { fontFamily: font.regular, fontSize: 13, color: colors.muted },
  recentBadge: { backgroundColor: colors.brandTertiary, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 2, marginRight: spacing.sm },
  recentBadgeText: { fontFamily: font.semibold, fontSize: 11, color: colors.brandDeep },
});
