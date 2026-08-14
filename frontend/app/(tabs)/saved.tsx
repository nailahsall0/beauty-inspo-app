import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors, spacing, radius, font } from "@/src/theme/tokens";
import { apiFetch, mediaUrl } from "@/src/lib/api";
import { MasonryFeed, Post } from "@/src/components/Feed";
import { Loading, EmptyState, Btn } from "@/src/components/ui";
import { useToast } from "@/src/components/Toast";

type Collection = { id: string; name: string; cover_url?: string | null; thumbs?: string[]; post_count: number };

function CollectionThumb({ thumbs }: { thumbs: string[] }) {
  const t = (thumbs || []).slice(0, 4);
  if (t.length === 0) {
    return <MaterialCommunityIcons name="folder-image" size={32} color={colors.faint} />;
  }
  if (t.length === 1) {
    return <Image source={{ uri: mediaUrl(t[0]) }} style={{ width: "100%", height: "100%" }} contentFit="cover" />;
  }
  if (t.length === 2) {
    return (
      <View style={{ flex: 1, flexDirection: "row", gap: 2 }}>
        {t.map((u, i) => <Image key={i} source={{ uri: mediaUrl(u) }} style={{ flex: 1, height: "100%" }} contentFit="cover" />)}
      </View>
    );
  }
  if (t.length === 3) {
    return (
      <View style={{ flex: 1, flexDirection: "row", gap: 2 }}>
        <Image source={{ uri: mediaUrl(t[0]) }} style={{ flex: 1, height: "100%" }} contentFit="cover" />
        <View style={{ flex: 1, gap: 2 }}>
          <Image source={{ uri: mediaUrl(t[1]) }} style={{ flex: 1, width: "100%" }} contentFit="cover" />
          <Image source={{ uri: mediaUrl(t[2]) }} style={{ flex: 1, width: "100%" }} contentFit="cover" />
        </View>
      </View>
    );
  }
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <View style={{ flex: 1, flexDirection: "row", gap: 2 }}>
        <Image source={{ uri: mediaUrl(t[0]) }} style={{ flex: 1, height: "100%" }} contentFit="cover" />
        <Image source={{ uri: mediaUrl(t[1]) }} style={{ flex: 1, height: "100%" }} contentFit="cover" />
      </View>
      <View style={{ flex: 1, flexDirection: "row", gap: 2 }}>
        <Image source={{ uri: mediaUrl(t[2]) }} style={{ flex: 1, height: "100%" }} contentFit="cover" />
        <Image source={{ uri: mediaUrl(t[3]) }} style={{ flex: 1, height: "100%" }} contentFit="cover" />
      </View>
    </View>
  );
}

export default function Saved() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState<"posts" | "collections">("posts");
  const [posts, setPosts] = useState<Post[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const load = useCallback(async () => {
    try {
      const [p, c] = await Promise.all([apiFetch<Post[]>("/saved"), apiFetch<Collection[]>("/collections")]);
      setPosts(p);
      setCollections(c);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const createCollection = async () => {
    if (!newName.trim()) return;
    try {
      await apiFetch("/collections", { method: "POST", body: { name: newName.trim() } });
      setNewName("");
      setCreating(false);
      toast.show("Collection created", "success");
      load();
    } catch (e: any) {
      toast.show(e.message || "Failed", "error");
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Text style={styles.title}>Saved</Text>
        <View style={styles.tabs}>
          <Pressable testID="saved-tab-posts" onPress={() => setTab("posts")} style={styles.tab}>
            <Text style={[styles.tabText, tab === "posts" && styles.tabActive]}>Posts</Text>
            {tab === "posts" && <View style={styles.underline} />}
          </Pressable>
          <Pressable testID="saved-tab-collections" onPress={() => setTab("collections")} style={styles.tab}>
            <Text style={[styles.tabText, tab === "collections" && styles.tabActive]}>Collections</Text>
            {tab === "collections" && <View style={styles.underline} />}
          </Pressable>
        </View>
      </View>

      {loading ? (
        <Loading />
      ) : tab === "posts" ? (
        posts.length ? (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: spacing.md, paddingBottom: spacing.xxxl }}>
            <MasonryFeed posts={posts} />
          </ScrollView>
        ) : (
          <EmptyState icon="bookmark-outline" title="No saved looks yet" subtitle="Tap the bookmark on any look to save it here." />
        )
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}>
          {creating ? (
            <View style={styles.createBox}>
              <TextInput
                testID="collection-name-input"
                value={newName}
                onChangeText={setNewName}
                placeholder="Collection name (e.g. Birthday Hair)"
                placeholderTextColor={colors.faint}
                style={styles.createInput}
                autoFocus
              />
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <Btn label="Cancel" variant="outline" onPress={() => setCreating(false)} style={{ flex: 1, height: 46 }} />
                <Btn testID="collection-create-confirm" label="Create" onPress={createCollection} style={{ flex: 1, height: 46 }} />
              </View>
            </View>
          ) : (
            <Pressable testID="saved-new-collection" onPress={() => setCreating(true)} style={styles.newCol}>
              <MaterialCommunityIcons name="plus" size={22} color={colors.brandDeep} />
              <Text style={styles.newColText}>New Collection</Text>
            </Pressable>
          )}

          {collections.length === 0 && !creating ? (
            <EmptyState icon="folder-multiple-outline" title="No collections" subtitle="Organize saved looks into collections like Nail Inspo or Wedding." />
          ) : (
            <View style={styles.grid}>
              {collections.map((c) => (
                <Pressable
                  key={c.id}
                  testID={`collection-${c.id}`}
                  onPress={() => router.push(`/collection/${c.id}?name=${encodeURIComponent(c.name)}`)}
                  style={styles.colCard}
                >
                  <View style={styles.colCover}>
                    <CollectionThumb thumbs={c.thumbs || (c.cover_url ? [c.cover_url] : [])} />
                  </View>
                  <Text style={styles.colName} numberOfLines={1}>
                    {c.name}
                  </Text>
                  <Text style={styles.colCount}>{c.post_count} saved</Text>
                </Pressable>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { fontFamily: font.display, fontSize: 32, color: colors.onSurface, marginBottom: spacing.sm },
  tabs: { flexDirection: "row", gap: spacing.xl },
  tab: { alignItems: "center", paddingBottom: spacing.sm },
  tabText: { fontFamily: font.semibold, fontSize: 15, color: colors.faint },
  tabActive: { color: colors.onSurface },
  underline: { height: 2.5, width: 22, backgroundColor: colors.brandDeep, borderRadius: 2, marginTop: 5 },
  newCol: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.brandTertiary,
    borderRadius: radius.lg,
    height: 52,
    marginBottom: spacing.lg,
  },
  newColText: { fontFamily: font.bold, fontSize: 15, color: colors.brandDeep },
  createBox: { gap: spacing.md, marginBottom: spacing.lg },
  createInput: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    height: 52,
    fontFamily: font.medium,
    fontSize: 15,
    color: colors.onSurface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  colCard: { width: "47.5%" },
  colCover: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceTertiary,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  colName: { fontFamily: font.bold, fontSize: 15, color: colors.onSurface },
  colCount: { fontFamily: font.regular, fontSize: 12, color: colors.muted },
});
