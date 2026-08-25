import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, TextInput, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { spacing, radius, font, type } from "@/src/theme/tokens";
import { apiFetch } from "@/src/lib/api";
import { Btn, IconBtn, Loading } from "@/src/components/ui";
import { useToast } from "@/src/components/Toast";
import { useTheme } from "@/src/hooks/useTheme";

type Style = { id: string; name: string };
type Pro = { id: string; username: string; business_name: string };

export default function EditPost() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { colors } = useTheme();
  const [post, setPost] = useState<any>(null);
  const [caption, setCaption] = useState("");
  const [serviceName, setServiceName] = useState("");
  const [styleTags, setStyleTags] = useState<string[]>([]);
  const [styleQuery, setStyleQuery] = useState("");
  const [allStyles, setAllStyles] = useState<Style[]>([]);
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [taggedPro, setTaggedPro] = useState<Pro | null>(null);
  const [proQuery, setProQuery] = useState("");
  const [proResults, setProResults] = useState<Pro[]>([]);
  const [proSearching, setProSearching] = useState(false);
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
        if (p.tagged_professional) {
          setTaggedPro({
            id: p.tagged_professional.id,
            username: p.tagged_professional.username,
            business_name: p.tagged_professional.business_name,
          });
        }
      } catch {
        toast.show("Could not load post", "error");
      }
    })();
  }, [id]);

  useEffect(() => {
    if (proQuery.trim().length < 1) { setProResults([]); setProSearching(false); return; }
    setProSearching(true);
    const t = setTimeout(() => {
      apiFetch<Pro[]>(`/professionals/search?q=${encodeURIComponent(proQuery.trim())}`)
        .then((r) => { setProResults(r); setProSearching(false); })
        .catch(() => { setProResults([]); setProSearching(false); });
    }, 150);
    return () => clearTimeout(t);
  }, [proQuery]);

  if (!post) return <View style={{ flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}><Loading /></View>;

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
          tagged_professional_id: taggedPro?.id || null,
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
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <IconBtn icon="chevron-left" onPress={() => router.back()} />
        <Text style={[styles.title, { color: colors.onSurface }]}>Edit Post</Text>
      </View>
      <KeyboardAwareScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }} bottomOffset={90} showsVerticalScrollIndicator={false}>
        <Text style={[styles.label, { color: colors.onSurface }]}>Caption</Text>
        <TextInput testID="edit-post-caption" value={caption} onChangeText={setCaption} placeholder="Write a caption" placeholderTextColor={colors.faint} multiline style={[styles.input, { minHeight: 90, textAlignVertical: "top", paddingTop: spacing.md, backgroundColor: colors.surfaceSecondary, color: colors.onSurface, borderColor: colors.border }]} />

        <Text style={[styles.label, { color: colors.onSurface }]}>Service</Text>
        <TextInput testID="edit-post-service" value={serviceName} onChangeText={setServiceName} placeholder="e.g. Boho Knotless" placeholderTextColor={colors.faint} style={[styles.input, { backgroundColor: colors.surfaceSecondary, color: colors.onSurface, borderColor: colors.border }]} />

        <Text style={[styles.label, { color: colors.onSurface }]}>Styles</Text>
        {styleTags.length > 0 && (
          <View style={styles.chips}>
            {styleTags.map((s) => (
              <Pressable key={s} testID={`edit-style-tag-${s}`} onPress={() => setStyleTags((a) => a.filter((x) => x !== s))} style={[styles.chip, { backgroundColor: colors.surfaceInverse, borderColor: colors.surfaceInverse }]}>
                <Text style={[styles.chipText, { color: colors.onSurfaceInverse }]}>{s}</Text>
                <MaterialCommunityIcons name="close" size={14} color={colors.onSurfaceInverse} />
              </Pressable>
            ))}
          </View>
        )}
        <TextInput testID="edit-style-search" value={styleQuery} onChangeText={setStyleQuery} placeholder="Search or create a style" placeholderTextColor={colors.faint} style={[styles.input, { marginTop: spacing.sm, backgroundColor: colors.surfaceSecondary, color: colors.onSurface, borderColor: colors.border }]} autoCapitalize="words" />
        <View style={styles.chips}>
          {suggestions.map((s) => (
            <Pressable key={s.id} testID={`edit-style-${s.name}`} onPress={() => { setStyleTags((a) => [...a, s.name]); setStyleQuery(""); }} style={[styles.chip, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
              <Text style={[styles.chipText, { color: colors.onSurface }]}>{s.name}</Text>
            </Pressable>
          ))}
          {canCreate && (
            <Pressable testID="edit-style-create" onPress={() => { setStyleTags((a) => [...a, styleQuery.trim()]); setStyleQuery(""); }} style={[styles.chip, { backgroundColor: colors.surfaceSecondary, borderColor: colors.brandDeep, borderStyle: "dashed" }]}>
              <MaterialCommunityIcons name="plus" size={14} color={colors.brandDeep} />
              <Text style={[styles.chipText, { color: colors.brandDeep }]}>Create "{styleQuery.trim()}"</Text>
            </Pressable>
          )}
        </View>

        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { color: colors.onSurface }]}>City</Text>
            <TextInput testID="edit-post-city" value={city} onChangeText={setCity} placeholder="Cincinnati" placeholderTextColor={colors.faint} style={[styles.input, { backgroundColor: colors.surfaceSecondary, color: colors.onSurface, borderColor: colors.border }]} />
          </View>
          <View style={{ width: 90 }}>
            <Text style={[styles.label, { color: colors.onSurface }]}>State</Text>
            <TextInput testID="edit-post-state" value={state} onChangeText={setState} placeholder="OH" placeholderTextColor={colors.faint} style={[styles.input, { backgroundColor: colors.surfaceSecondary, color: colors.onSurface, borderColor: colors.border }]} />
          </View>
        </View>

        <Text style={[styles.label, { color: colors.onSurface }]}>Tagged Professional</Text>
        {taggedPro ? (
          <View style={[styles.taggedRow, { backgroundColor: colors.brandTertiary }]}>
            <MaterialCommunityIcons name="check-decagram" size={18} color={colors.brandDeep} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.taggedName, { color: colors.onSurface }]}>{taggedPro.business_name}</Text>
              <Text style={[styles.taggedHandle, { color: colors.muted }]}>@{taggedPro.username}</Text>
            </View>
            <Pressable testID="edit-remove-tag" onPress={() => setTaggedPro(null)} hitSlop={8}>
              <MaterialCommunityIcons name="close-circle" size={22} color={colors.faint} />
            </Pressable>
          </View>
        ) : (
          <>
            <TextInput
              testID="edit-tag-search"
              value={proQuery}
              onChangeText={setProQuery}
              placeholder="Search @username or business"
              placeholderTextColor={colors.faint}
              autoCapitalize="none"
              style={[styles.input, { backgroundColor: colors.surfaceSecondary, color: colors.onSurface, borderColor: colors.border }]}
            />
            {proSearching && (
              <View style={styles.proSearching}>
                <ActivityIndicator color={colors.brandDeep} />
              </View>
            )}
            {!proSearching && proQuery.trim().length >= 1 && proResults.length === 0 && (
              <View style={[styles.proNoResults, { backgroundColor: colors.surfaceSecondary }]}>
                <MaterialCommunityIcons name="account-search-outline" size={20} color={colors.muted} />
                <Text style={[styles.proNoResultsText, { color: colors.muted }]}>No professionals found</Text>
              </View>
            )}
            {proResults.map((p) => (
              <Pressable
                key={p.id}
                testID={`edit-tag-result-${p.id}`}
                onPress={() => { setTaggedPro(p); setProResults([]); setProQuery(""); }}
                style={[styles.proResult, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
              >
                <Text style={[styles.proResultName, { color: colors.onSurface }]}>{p.business_name}</Text>
                <Text style={[styles.proResultHandle, { color: colors.muted }]}>@{p.username}</Text>
              </Pressable>
            ))}
          </>
        )}
      </KeyboardAwareScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md, borderTopColor: colors.border, backgroundColor: colors.surface }]}>
        <Btn testID="edit-post-save" label="Save Changes" onPress={save} loading={saving} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1 },
  title: { fontFamily: font.displaySemi, fontSize: 24 },
  label: { fontFamily: font.semibold, fontSize: 13, marginBottom: 6, marginTop: spacing.md },
  input: { borderRadius: radius.md, paddingHorizontal: spacing.lg, height: 50, fontFamily: font.medium, fontSize: 15, borderWidth: 1 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: spacing.md, height: 40, borderRadius: radius.pill, borderWidth: 1 },
  chipText: { fontFamily: font.semibold, fontSize: 13 },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1 },
  taggedRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, borderRadius: radius.lg, padding: spacing.md },
  taggedName: { fontFamily: font.bold, fontSize: 14 },
  taggedHandle: { fontFamily: font.regular, fontSize: 12 },
  proSearching: { marginTop: spacing.md, alignItems: "center", paddingVertical: spacing.sm },
  proNoResults: { marginTop: spacing.sm, padding: spacing.md, borderRadius: radius.md, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  proNoResultsText: { fontFamily: font.medium, fontSize: 13 },
  proResult: { padding: spacing.md, borderRadius: radius.md, borderWidth: 1, marginTop: spacing.sm },
  proResultName: { fontFamily: font.bold, fontSize: 14 },
  proResultHandle: { fontFamily: font.regular, fontSize: 12 },
});
