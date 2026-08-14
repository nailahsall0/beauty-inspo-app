import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, Modal, ScrollView, TextInput } from "react-native";
import { Image } from "expo-image";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors, spacing, radius, font } from "@/src/theme/tokens";
import { apiFetch, mediaUrl } from "@/src/lib/api";
import { useToast } from "@/src/components/Toast";

type Collection = { id: string; name: string; thumbs?: string[]; post_count: number };

export function SaveSheet({ visible, postId, onClose, onChanged }: { visible: boolean; postId: string; onClose: () => void; onChanged?: () => void }) {
  const toast = useToast();
  const [cols, setCols] = useState<Collection[]>([]);
  const [inIds, setInIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const load = useCallback(async () => {
    try {
      const [c, mine] = await Promise.all([
        apiFetch<Collection[]>("/collections"),
        apiFetch<{ collection_ids: string[] }>(`/posts/${postId}/collections`),
      ]);
      setCols(c);
      setInIds(mine.collection_ids);
    } catch {}
  }, [postId]);

  useEffect(() => { if (visible) load(); }, [visible, load]);

  const toggle = async (cid: string) => {
    const inside = inIds.includes(cid);
    setInIds((ids) => (inside ? ids.filter((x) => x !== cid) : [...ids, cid]));
    try {
      if (inside) await apiFetch(`/collections/${cid}/items/${postId}`, { method: "DELETE" });
      else await apiFetch(`/collections/${cid}/items?post_id=${postId}`, { method: "POST" });
      onChanged?.();
    } catch { load(); }
  };

  const create = async () => {
    if (!newName.trim()) return;
    try {
      const col = await apiFetch<Collection>("/collections", { method: "POST", body: { name: newName.trim() } });
      setNewName("");
      setCreating(false);
      await apiFetch(`/collections/${col.id}/items?post_id=${postId}`, { method: "POST" });
      toast.show("Saved to new collection", "success");
      load();
      onChanged?.();
    } catch (e: any) { toast.show(e.message || "Failed", "error"); }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet} testID="save-sheet">
        <View style={styles.handle} />
        <Text style={styles.title}>Save to Collection</Text>
        <ScrollView style={{ maxHeight: 340 }} showsVerticalScrollIndicator={false}>
          {cols.map((c) => {
            const inside = inIds.includes(c.id);
            return (
              <Pressable key={c.id} testID={`save-collection-${c.id}`} onPress={() => toggle(c.id)} style={styles.row}>
                <View style={styles.thumb}>
                  {c.thumbs?.[0] ? <Image source={{ uri: mediaUrl(c.thumbs[0]) }} style={{ width: "100%", height: "100%" }} contentFit="cover" /> : <MaterialCommunityIcons name="folder-image" size={22} color={colors.faint} />}
                </View>
                <View style={{ flex: 1, marginLeft: spacing.md }}>
                  <Text style={styles.name}>{c.name}</Text>
                  <Text style={styles.count}>{c.post_count} saved</Text>
                </View>
                <MaterialCommunityIcons name={inside ? "check-circle" : "circle-outline"} size={24} color={inside ? colors.brandDeep : colors.faint} />
              </Pressable>
            );
          })}
        </ScrollView>
        {creating ? (
          <View style={styles.createRow}>
            <TextInput testID="save-new-collection-input" value={newName} onChangeText={setNewName} placeholder="Collection name" placeholderTextColor={colors.faint} style={styles.input} autoFocus />
            <Pressable testID="save-new-collection-confirm" onPress={create} style={styles.createBtn}><Text style={styles.createBtnText}>Create</Text></Pressable>
          </View>
        ) : (
          <Pressable testID="save-new-collection" onPress={() => setCreating(true)} style={styles.newCol}>
            <MaterialCommunityIcons name="plus" size={20} color={colors.brandDeep} />
            <Text style={styles.newColText}>Create Collection</Text>
          </Pressable>
        )}
        <Pressable testID="save-sheet-done" onPress={onClose} style={styles.doneBtn}><Text style={styles.doneText}>Done</Text></Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.scrim },
  sheet: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, paddingBottom: spacing.xxl },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, alignSelf: "center", marginBottom: spacing.md },
  title: { fontFamily: font.displaySemi, fontSize: 22, color: colors.onSurface, marginBottom: spacing.md },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.sm },
  thumb: { width: 46, height: 46, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  name: { fontFamily: font.bold, fontSize: 15, color: colors.onSurface },
  count: { fontFamily: font.regular, fontSize: 12, color: colors.muted },
  newCol: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.md, marginTop: spacing.sm },
  newColText: { fontFamily: font.bold, fontSize: 15, color: colors.brandDeep },
  createRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  input: { flex: 1, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, paddingHorizontal: spacing.lg, height: 48, fontFamily: font.medium, fontSize: 15, color: colors.onSurface, borderWidth: 1, borderColor: colors.border },
  createBtn: { backgroundColor: colors.brand, borderRadius: radius.md, paddingHorizontal: spacing.lg, alignItems: "center", justifyContent: "center" },
  createBtnText: { fontFamily: font.bold, fontSize: 14, color: colors.onSurface },
  doneBtn: { backgroundColor: colors.surfaceInverse, borderRadius: radius.pill, height: 50, alignItems: "center", justifyContent: "center", marginTop: spacing.md },
  doneText: { fontFamily: font.bold, fontSize: 15, color: colors.onSurfaceInverse },
});
