import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, TextInput } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors, spacing, radius, font, type } from "@/src/theme/tokens";
import { apiFetch } from "@/src/lib/api";
import { Btn, IconBtn, Loading } from "@/src/components/ui";
import { useToast } from "@/src/components/Toast";

type Style = { id: string; name: string };

export default function EditPost() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [post, setPost] = useState<any>(null);
  const [caption, setCaption] = useState("");
  const [serviceName, setServiceName] = useState("");
  const [styleTags, setStyleTags] = useState<string[]>([]);
  const [styleQuery, setStyleQuery] = useState("");
  const [allStyles, setAllStyles] = useState<Style[]>([]);
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [p, styles] = await Promise.all([apiFetch(`/posts/${id}`), apiFetch<Style[]>("/styles")]);
        setPost(p);
        setCaption(p.caption || "");
        setServiceName(p.service_name || "");
        setStyleTags(p.style_names && p.style_names.length ? p.style_names : p.style_name ? [p.style_name] : []);
        setCity(p.city || "");
        setState(p.state || "");
        setAllStyles(styles);
      } catch {
        toast.show("Could not load post", "error");
      }
    })();
  }, [id]);

  if (!post) return <View style={{ flex: 1, backgroundColor: colors.surface }}><Loading /></View>;

  const save = async () => {
    setSaving(true);
    try {
      for (const s of styleTags) {
        await apiFetch("/styles", { method: "POST", body: { name: s, category_id: post.category_id } }).catch(() => {});
      }
      await apiFetch(`/posts/${id}`, {
        method: "PUT",
        body: {
          media: post.media,
          caption: caption.trim(),
          category_id: post.category_id,
          custom_category: post.custom_category ?? null,
          service_id: null,
          service_name: serviceName.trim() || null,
          style_name: styleTags[0] || null,
          style_names: styleTags,
          attributes: post.attributes || {},
          city: city.trim() || null,
          state: state.trim() || null,
        },
      });
      toast.show("Post updated", "success");
      router.back();
    } catch (e: any) {
      toast.show(e.message || "Failed", "error");
    } finally {
      setSaving(false);
    }
  };

  const suggestions = allStyles
    .filter((s) => (!styleQuery || s.name.toLowerCase().includes(styleQuery.toLowerCase())) && !styleTags.includes(s.name))
    .slice(0, 12);
  const canCreate = styleQuery.trim().length > 1 &&
    !allStyles.some((s) => s.name.toLowerCase() === styleQuery.trim().toLowerCase()) &&
    !styleTags.some((s) => s.toLowerCase() === styleQuery.trim().toLowerCase());

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top + spacing.sm }}>
      <View style={styles.header}>
        <IconBtn icon="chevron-left" onPress={() => router.back()} />
        <Text style={styles.title}>Edit Post</Text>
      </View>
      <KeyboardAwareScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }} bottomOffset={90} showsVerticalScrollIndicator={false}>
        <Text style={styles.label}>Caption</Text>
        <TextInput testID="edit-post-caption" value={caption} onChangeText={setCaption} placeholder="Write a caption" placeholderTextColor={colors.faint} multiline style={[styles.input, { minHeight: 90, textAlignVertical: "top", paddingTop: spacing.md }]} />

        <Text style={styles.label}>Service</Text>
        <TextInput testID="edit-post-service" value={serviceName} onChangeText={setServiceName} placeholder="e.g. Boho Knotless" placeholderTextColor={colors.faint} style={styles.input} />

        <Text style={styles.label}>Styles</Text>
        {styleTags.length > 0 && (
          <View style={styles.chips}>
            {styleTags.map((s) => (
              <Pressable key={s} testID={`edit-style-tag-${s}`} onPress={() => setStyleTags((a) => a.filter((x) => x !== s))} style={[styles.chip, styles.chipActive]}>
                <Text style={[styles.chipText, { color: colors.onSurfaceInverse }]}>{s}</Text>
                <MaterialCommunityIcons name="close" size={14} color={colors.onSurfaceInverse} />
              </Pressable>
            ))}
          </View>
        )}
        <TextInput testID="edit-style-search" value={styleQuery} onChangeText={setStyleQuery} placeholder="Search or create a style" placeholderTextColor={colors.faint} style={[styles.input, { marginTop: spacing.sm }]} autoCapitalize="words" />
        <View style={styles.chips}>
          {suggestions.map((s) => (
            <Pressable key={s.id} testID={`edit-style-${s.name}`} onPress={() => { setStyleTags((a) => [...a, s.name]); setStyleQuery(""); }} style={styles.chip}>
              <Text style={styles.chipText}>{s.name}</Text>
            </Pressable>
          ))}
          {canCreate && (
            <Pressable testID="edit-style-create" onPress={() => { setStyleTags((a) => [...a, styleQuery.trim()]); setStyleQuery(""); }} style={[styles.chip, { borderColor: colors.brandDeep, borderStyle: "dashed" }]}>
              <MaterialCommunityIcons name="plus" size={14} color={colors.brandDeep} />
              <Text style={[styles.chipText, { color: colors.brandDeep }]}>Create "{styleQuery.trim()}"</Text>
            </Pressable>
          )}
        </View>

        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>City</Text>
            <TextInput testID="edit-post-city" value={city} onChangeText={setCity} placeholder="Cincinnati" placeholderTextColor={colors.faint} style={styles.input} />
          </View>
          <View style={{ width: 90 }}>
            <Text style={styles.label}>State</Text>
            <TextInput testID="edit-post-state" value={state} onChangeText={setState} placeholder="OH" placeholderTextColor={colors.faint} style={styles.input} />
          </View>
        </View>
      </KeyboardAwareScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <Btn testID="edit-post-save" label="Save Changes" onPress={save} loading={saving} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { fontFamily: font.displaySemi, fontSize: 24, color: colors.onSurface },
  label: { fontFamily: font.semibold, fontSize: 13, color: colors.onSurface, marginBottom: 6, marginTop: spacing.md },
  input: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, paddingHorizontal: spacing.lg, height: 50, fontFamily: font.medium, fontSize: 15, color: colors.onSurface, borderWidth: 1, borderColor: colors.border },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: spacing.md, height: 40, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.surfaceInverse, borderColor: colors.surfaceInverse },
  chipText: { fontFamily: font.semibold, fontSize: 13, color: colors.onSurface },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
});
