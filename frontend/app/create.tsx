import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, Linking } from "react-native";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors, spacing, radius, font, type } from "@/src/theme/tokens";
import { apiFetch, uploadMedia, mediaUrl } from "@/src/lib/api";
import { Btn, Loading } from "@/src/components/ui";
import { useAuth } from "@/src/context/AuthContext";
import { useToast } from "@/src/components/Toast";

type Media = { url: string; type: string; width?: number; height?: number };
type Cat = { id: string; name: string; icon: string };
type Svc = { id: string; name: string };
type Style = { id: string; name: string };

const ATTR_FIELDS = ["Length", "Size", "Color", "Shape", "Products", "Technique", "Finish", "Duration"];

export default function CreatePost() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const toast = useToast();

  const [step, setStep] = useState(0);
  const [media, setMedia] = useState<Media[]>([]);
  const [uploading, setUploading] = useState(false);
  const [caption, setCaption] = useState("");
  const [cats, setCats] = useState<Cat[]>([]);
  const [services, setServices] = useState<Svc[]>([]);
  const [styles_, setStyles] = useState<Style[]>([]);
  const [catId, setCatId] = useState<string | null>(null);
  const [catName, setCatName] = useState<string>("");
  const [svc, setSvc] = useState<Svc | null>(null);
  const [customCategory, setCustomCategory] = useState("");
  const [svcMode, setSvcMode] = useState<"pick" | "custom">("pick");
  const [customService, setCustomService] = useState("");
  const [styleQuery, setStyleQuery] = useState("");
  const [selectedStyles, setSelectedStyles] = useState<string[]>([]);
  const [attrs, setAttrs] = useState<Record<string, string>>({});
  const [city, setCity] = useState(user?.city || "");
  const [state, setState] = useState(user?.state || "");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [proQuery, setProQuery] = useState("");
  const [proResults, setProResults] = useState<any[]>([]);
  const [taggedPro, setTaggedPro] = useState<any>(null);
  const [postAsPro, setPostAsPro] = useState(!!user?.is_professional);
  const [publishing, setPublishing] = useState(false);

  const STEPS = ["Media", "Caption", "Category", "Service", "Style", "Details", "Location", "Tag Pro", "Preview"];

  useEffect(() => {
    apiFetch<Cat[]>("/categories", { auth: false }).then(setCats).catch(() => {});
    apiFetch<Style[]>("/styles", { auth: false }).then(setStyles).catch(() => {});
  }, []);

  useEffect(() => {
    if (catId) apiFetch<Svc[]>(`/services?category_id=${catId}`).then(setServices).catch(() => {});
  }, [catId]);

  useEffect(() => {
    if (proQuery.trim().length < 2) { setProResults([]); return; }
    const t = setTimeout(() => {
      apiFetch(`/professionals/search?q=${encodeURIComponent(proQuery.trim())}`).then(setProResults).catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [proQuery]);

  const pickMedia = async () => {
    const perm = await ImagePicker.getMediaLibraryPermissionsAsync();
    let status = perm.status;
    if (status !== "granted") {
      if (!perm.canAskAgain) {
        toast.show("Enable photo access in Settings", "error");
        Linking.openSettings();
        return;
      }
      const req = await ImagePicker.requestMediaLibraryPermissionsAsync();
      status = req.status;
    }
    if (status !== "granted") {
      toast.show("Photo access is needed to add media", "error");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images", "videos"],
      allowsMultipleSelection: true,
      quality: 0.7,
      selectionLimit: 5,
    });
    if (result.canceled) return;
    setUploading(true);
    try {
      const uploaded: Media[] = [];
      for (const asset of result.assets) {
        const name = asset.fileName || `upload.${asset.type === "video" ? "mp4" : "jpg"}`;
        const mime = asset.mimeType || (asset.type === "video" ? "video/mp4" : "image/jpeg");
        const res = await uploadMedia(asset.uri, name, mime);
        uploaded.push({ url: res.url, type: res.type, width: asset.width, height: asset.height });
      }
      setMedia((m) => [...m, ...uploaded]);
    } catch {
      toast.show("Upload failed, try again", "error");
    } finally {
      setUploading(false);
    }
  };

  const useCurrentLocation = async () => {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== "granted") {
      toast.show("Location permission denied", "error");
      return;
    }
    try {
      const loc = await Location.getCurrentPositionAsync({});
      setCoords({ lat: loc.coords.latitude, lng: loc.coords.longitude });
      const geo = await Location.reverseGeocodeAsync({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
      if (geo[0]) {
        setCity(geo[0].city || geo[0].subregion || "");
        setState(geo[0].region || "");
      }
      toast.show("Location set", "success");
    } catch {
      toast.show("Could not get location", "error");
    }
  };

  const canNext = () => {
    if (step === 0) return media.length > 0;
    if (step === 2) return !!catId;
    return true;
  };

  const publish = async () => {
    setPublishing(true);
    try {
      // persist any custom styles so they become searchable/structured
      for (const sname of selectedStyles) {
        await apiFetch("/styles", { method: "POST", body: { name: sname, category_id: catId } }).catch(() => {});
      }
      const serviceName = svcMode === "custom" ? customService.trim() : svc?.name || null;
      const body: any = {
        media,
        caption,
        category_id: catId,
        custom_category: catName === "Other" ? customCategory.trim() || null : null,
        service_id: svcMode === "pick" ? svc?.id || null : null,
        service_name: serviceName,
        style_id: null,
        style_name: selectedStyles[0] || null,
        style_names: selectedStyles,
        attributes: Object.fromEntries(Object.entries(attrs).filter(([, v]) => v)),
        city: city || null,
        state: state || null,
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
        tagged_professional_id: taggedPro?.id || null,
        post_type: postAsPro ? "professional" : "customer",
      };
      const post = await apiFetch<any>("/posts", { method: "POST", body });
      toast.show("Look published! ✨", "success");
      router.replace(`/post/${post.id}`);
    } catch (e: any) {
      toast.show(e.message || "Failed to publish", "error");
    } finally {
      setPublishing(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top + spacing.sm }}>
      {/* Header + progress */}
      <View style={styles.header}>
        <Pressable testID="create-back" onPress={() => (step === 0 ? router.back() : setStep(step - 1))} hitSlop={8}>
          <MaterialCommunityIcons name={step === 0 ? "close" : "chevron-left"} size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>{STEPS[step]}</Text>
        <Text style={styles.stepCount}>{step + 1}/{STEPS.length}</Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${((step + 1) / STEPS.length) * 100}%` }]} />
      </View>

      <KeyboardAwareScrollView contentContainerStyle={styles.content} bottomOffset={90} showsVerticalScrollIndicator={false}>
        {step === 0 && (
          <View>
            <Text style={styles.stepTitle}>Add your look</Text>
            <Text style={type.body}>Choose the photos or videos that show off the look.</Text>
            <View style={styles.mediaGrid}>
              {media.map((m, i) => (
                <View key={i} style={styles.mediaThumb}>
                  <Image source={{ uri: mediaUrl(m.url) }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
                  <Pressable testID={`remove-media-${i}`} onPress={() => setMedia((arr) => arr.filter((_, x) => x !== i))} style={styles.removeMedia}>
                    <MaterialCommunityIcons name="close" size={14} color={colors.white} />
                  </Pressable>
                </View>
              ))}
              <Pressable testID="create-pick-media" onPress={pickMedia} style={styles.addMedia}>
                {uploading ? <Loading /> : <><MaterialCommunityIcons name="camera-plus-outline" size={28} color={colors.brandDeep} /><Text style={styles.addMediaText}>Add</Text></>}
              </Pressable>
            </View>
          </View>
        )}

        {step === 1 && (
          <View>
            <Text style={styles.stepTitle}>Write a caption</Text>
            <TextInput
              testID="create-caption"
              value={caption}
              onChangeText={setCaption}
              placeholder="Birthday hair ❤️"
              placeholderTextColor={colors.faint}
              multiline
              style={styles.captionInput}
            />
            {user?.is_professional && (
              <Pressable testID="post-as-pro" onPress={() => setPostAsPro((p) => !p)} style={styles.toggle}>
                <MaterialCommunityIcons name={postAsPro ? "checkbox-marked" : "checkbox-blank-outline"} size={22} color={colors.brandDeep} />
                <Text style={styles.toggleText}>Post as my professional profile</Text>
              </Pressable>
            )}
          </View>
        )}

        {step === 2 && (
          <View>
            <Text style={styles.stepTitle}>Select a category</Text>
            <View style={styles.chips}>
              {cats.map((c) => (
                <Pressable key={c.id} testID={`create-cat-${c.name}`} onPress={() => { setCatId(c.id); setCatName(c.name); setSvc(null); setSvcMode("pick"); }} style={[styles.optChip, catId === c.id && styles.optChipActive]}>
                  <MaterialCommunityIcons name={c.icon as any} size={18} color={catId === c.id ? colors.onSurfaceInverse : colors.brandDeep} />
                  <Text style={[styles.optChipText, catId === c.id && { color: colors.onSurfaceInverse }]}>{c.name}</Text>
                </Pressable>
              ))}
            </View>
            {catName === "Other" && (
              <View style={{ marginTop: spacing.lg }}>
                <Text style={styles.fieldLabel}>Enter your category</Text>
                <TextInput
                  testID="create-custom-category"
                  value={customCategory}
                  onChangeText={setCustomCategory}
                  placeholder="e.g. Editorial Makeup"
                  placeholderTextColor={colors.faint}
                  style={styles.smallInput}
                />
              </View>
            )}
          </View>
        )}

        {step === 3 && (
          <View>
            <Text style={styles.stepTitle}>Select a service</Text>
            <Text style={type.body}>Optional — what service is this?</Text>
            <View style={styles.chips}>
              {services.map((s) => (
                <Pressable key={s.id} testID={`create-svc-${s.name}`} onPress={() => { setSvcMode("pick"); setSvc(svc?.id === s.id ? null : s); }} style={[styles.optChip, svcMode === "pick" && svc?.id === s.id && styles.optChipActive]}>
                  <Text style={[styles.optChipText, svcMode === "pick" && svc?.id === s.id && { color: colors.onSurfaceInverse }]}>{s.name}</Text>
                </Pressable>
              ))}
              <Pressable testID="create-svc-other" onPress={() => { setSvcMode("custom"); setSvc(null); }} style={[styles.optChip, svcMode === "custom" && styles.optChipActive]}>
                <MaterialCommunityIcons name="plus" size={16} color={svcMode === "custom" ? colors.onSurfaceInverse : colors.brandDeep} />
                <Text style={[styles.optChipText, svcMode === "custom" && { color: colors.onSurfaceInverse }]}>Other / Custom</Text>
              </Pressable>
            </View>
            {svcMode === "custom" && (
              <View style={{ marginTop: spacing.lg }}>
                <Text style={styles.fieldLabel}>Custom service</Text>
                <TextInput
                  testID="create-custom-service"
                  value={customService}
                  onChangeText={setCustomService}
                  placeholder="e.g. Mermaid Knotless Braids"
                  placeholderTextColor={colors.faint}
                  style={styles.smallInput}
                />
              </View>
            )}
          </View>
        )}

        {step === 4 && (
          <View>
            <Text style={styles.stepTitle}>Add styles</Text>
            <Text style={type.body}>Search or create style tags. Add as many as you like.</Text>
            {selectedStyles.length > 0 && (
              <View style={[styles.chips, { marginTop: spacing.md }]}>
                {selectedStyles.map((s) => (
                  <Pressable key={s} testID={`style-tag-${s}`} onPress={() => setSelectedStyles((arr) => arr.filter((x) => x !== s))} style={[styles.optChip, styles.optChipActive]}>
                    <Text style={[styles.optChipText, { color: colors.onSurfaceInverse }]}>{s}</Text>
                    <MaterialCommunityIcons name="close" size={15} color={colors.onSurfaceInverse} />
                  </Pressable>
                ))}
              </View>
            )}
            <TextInput
              testID="create-style-search"
              value={styleQuery}
              onChangeText={setStyleQuery}
              placeholder="Type a style e.g. Boho, Wispy…"
              placeholderTextColor={colors.faint}
              style={[styles.smallInput, { marginTop: spacing.md }]}
              autoCapitalize="words"
            />
            <View style={[styles.chips, { marginTop: spacing.md }]}>
              {styles_
                .filter((s) => !styleQuery || s.name.toLowerCase().includes(styleQuery.toLowerCase()))
                .filter((s) => !selectedStyles.includes(s.name))
                .slice(0, 20)
                .map((s) => (
                  <Pressable key={s.id} testID={`create-style-${s.name}`} onPress={() => { setSelectedStyles((arr) => [...arr, s.name]); setStyleQuery(""); }} style={styles.optChip}>
                    <Text style={styles.optChipText}>{s.name}</Text>
                  </Pressable>
                ))}
              {styleQuery.trim().length > 1 &&
                !styles_.some((s) => s.name.toLowerCase() === styleQuery.trim().toLowerCase()) &&
                !selectedStyles.some((s) => s.toLowerCase() === styleQuery.trim().toLowerCase()) && (
                  <Pressable testID="create-style-add-custom" onPress={() => { setSelectedStyles((arr) => [...arr, styleQuery.trim()]); setStyleQuery(""); }} style={[styles.optChip, { borderColor: colors.brandDeep, borderStyle: "dashed" }]}>
                    <MaterialCommunityIcons name="plus" size={15} color={colors.brandDeep} />
                    <Text style={[styles.optChipText, { color: colors.brandDeep }]}>Create "{styleQuery.trim()}"</Text>
                  </Pressable>
                )}
            </View>
          </View>
        )}

        {step === 5 && (
          <View>
            <Text style={styles.stepTitle}>Add details</Text>
            <Text style={type.body}>All optional. Helps others recreate the look.</Text>
            <View style={styles.hint}>
              <MaterialCommunityIcons name="lightbulb-on-outline" size={16} color={colors.brandDeep} />
              <Text style={styles.hintText}>Filling out these details helps future clients find and recreate this look — and helps pros get discovered.</Text>
            </View>
            {ATTR_FIELDS.map((f) => (
              <View key={f} style={{ marginTop: spacing.md }}>
                <Text style={styles.fieldLabel}>{f}</Text>
                <TextInput
                  testID={`attr-${f}`}
                  value={attrs[f] || ""}
                  onChangeText={(t) => setAttrs((a) => ({ ...a, [f]: t }))}
                  placeholder={`e.g. ${f === "Length" ? "Waist" : f === "Price" ? "$250" : f}`}
                  placeholderTextColor={colors.faint}
                  style={styles.smallInput}
                />
              </View>
            ))}
          </View>
        )}

        {step === 6 && (
          <View>
            <Text style={styles.stepTitle}>Add location</Text>
            <Btn label="Use Current Location" variant="outline" icon="crosshairs-gps" onPress={useCurrentLocation} style={{ marginVertical: spacing.md, height: 46 }} />
            <Text style={styles.fieldLabel}>City</Text>
            <TextInput testID="create-city" value={city} onChangeText={setCity} placeholder="Cincinnati" placeholderTextColor={colors.faint} style={styles.smallInput} />
            <Text style={styles.fieldLabel}>State</Text>
            <TextInput testID="create-state" value={state} onChangeText={setState} placeholder="OH" placeholderTextColor={colors.faint} style={styles.smallInput} />
          </View>
        )}

        {step === 7 && (
          <View>
            <Text style={styles.stepTitle}>Tag a professional</Text>
            <Text style={type.body}>Who did this look? They'll confirm the tag.</Text>
            {taggedPro ? (
              <View style={styles.taggedRow}>
                <MaterialCommunityIcons name="check-decagram" size={18} color={colors.brandDeep} />
                <Text style={styles.taggedText}>@{taggedPro.username}</Text>
                <Pressable testID="remove-tag" onPress={() => setTaggedPro(null)} style={{ marginLeft: "auto" }}>
                  <MaterialCommunityIcons name="close-circle" size={20} color={colors.faint} />
                </Pressable>
              </View>
            ) : (
              <>
                <TextInput testID="tag-search" value={proQuery} onChangeText={setProQuery} placeholder="Search @username or business" placeholderTextColor={colors.faint} autoCapitalize="none" style={[styles.smallInput, { marginTop: spacing.md }]} />
                {proResults.map((p) => (
                  <Pressable key={p.id} testID={`tag-result-${p.id}`} onPress={() => { setTaggedPro(p); setProResults([]); setProQuery(""); }} style={styles.proResult}>
                    <Text style={styles.proResultName}>{p.business_name}</Text>
                    <Text style={styles.proResultHandle}>@{p.username}</Text>
                  </Pressable>
                ))}
              </>
            )}
          </View>
        )}

        {step === 8 && (
          <View>
            <Text style={styles.stepTitle}>Preview</Text>
            {media[0] && <Image source={{ uri: mediaUrl(media[0].url) }} style={styles.previewImg} contentFit="cover" />}
            {caption ? <Text style={[styles.caption]}>{caption}</Text> : null}
            <View style={styles.previewMeta}>
              <PreviewRow label="Category" value={catName === "Other" && customCategory ? customCategory : catName} />
              <PreviewRow label="Service" value={svcMode === "custom" ? customService : svc?.name} />
              <PreviewRow label="Style" value={selectedStyles.join(", ")} />
              <PreviewRow label="Location" value={[city, state].filter(Boolean).join(", ")} />
              <PreviewRow label="Tagged" value={taggedPro ? `@${taggedPro.username}` : undefined} />
            </View>
          </View>
        )}
      </KeyboardAwareScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        {step < STEPS.length - 1 ? (
          <Btn testID="create-next" label={step === 0 && media.length === 0 ? "Add media to continue" : "Next"} onPress={() => canNext() && setStep(step + 1)} disabled={!canNext()} />
        ) : (
          <Btn testID="create-publish" label="Publish Look" variant="secondary" onPress={publish} loading={publishing} />
        )}
      </View>
    </View>
  );
}

function PreviewRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <View style={styles.prevRow}>
      <Text style={styles.prevLabel}>{label}</Text>
      <Text style={styles.prevValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  headerTitle: { fontFamily: font.bold, fontSize: 17, color: colors.onSurface },
  stepCount: { fontFamily: font.semibold, fontSize: 13, color: colors.muted },
  progressTrack: { height: 3, backgroundColor: colors.surfaceTertiary, marginHorizontal: spacing.lg, borderRadius: 2 },
  progressFill: { height: 3, backgroundColor: colors.brandDeep, borderRadius: 2 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  stepTitle: { fontFamily: font.displaySemi, fontSize: 26, color: colors.onSurface, marginBottom: spacing.xs },
  hint: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, backgroundColor: colors.brandTertiary, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.md },
  hintText: { flex: 1, fontFamily: font.medium, fontSize: 12.5, lineHeight: 18, color: colors.brandDeep },
  mediaGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, marginTop: spacing.lg },
  mediaThumb: { width: 100, height: 130, borderRadius: radius.md, overflow: "hidden", backgroundColor: colors.surfaceTertiary },
  removeMedia: { position: "absolute", top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" },
  addMedia: { width: 100, height: 130, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.borderStrong, borderStyle: "dashed", alignItems: "center", justifyContent: "center", gap: 4 },
  addMediaText: { fontFamily: font.semibold, fontSize: 12, color: colors.brandDeep },
  captionInput: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, minHeight: 140, fontFamily: font.medium, fontSize: 16, color: colors.onSurface, marginTop: spacing.lg, textAlignVertical: "top", borderWidth: 1, borderColor: colors.border },
  toggle: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.lg },
  toggleText: { fontFamily: font.semibold, fontSize: 14, color: colors.onSurface },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.lg },
  optChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: spacing.lg, height: 44, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  optChipActive: { backgroundColor: colors.surfaceInverse, borderColor: colors.surfaceInverse },
  optChipText: { fontFamily: font.semibold, fontSize: 14, color: colors.onSurface },
  fieldLabel: { fontFamily: font.semibold, fontSize: 13, color: colors.onSurface, marginBottom: 6 },
  smallInput: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, paddingHorizontal: spacing.lg, height: 48, fontFamily: font.medium, fontSize: 15, color: colors.onSurface, borderWidth: 1, borderColor: colors.border },
  taggedRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.brandTertiary, borderRadius: radius.lg, padding: spacing.lg, marginTop: spacing.lg },
  taggedText: { fontFamily: font.bold, fontSize: 15, color: colors.onSurface },
  proResult: { padding: spacing.md, backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, marginTop: spacing.sm },
  proResultName: { fontFamily: font.bold, fontSize: 14, color: colors.onSurface },
  proResultHandle: { fontFamily: font.regular, fontSize: 12, color: colors.muted },
  previewImg: { width: "100%", aspectRatio: 0.9, borderRadius: radius.lg, backgroundColor: colors.surfaceTertiary, marginTop: spacing.lg },
  caption: { fontFamily: font.regular, fontSize: 15, color: colors.onSurface, marginTop: spacing.md },
  previewMeta: { marginTop: spacing.lg, gap: spacing.sm },
  prevRow: { flexDirection: "row", justifyContent: "space-between" },
  prevLabel: { fontFamily: font.semibold, fontSize: 12, color: colors.muted, letterSpacing: 0.4 },
  prevValue: { fontFamily: font.semibold, fontSize: 14, color: colors.onSurface },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
});
