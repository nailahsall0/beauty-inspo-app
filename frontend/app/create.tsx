import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, Linking } from "react-native";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { spacing, radius, font, type } from "@/src/theme/tokens";
import { apiFetch, uploadMedia, mediaUrl } from "@/src/lib/api";
import { Btn, Loading } from "@/src/components/ui";
import { useAuth } from "@/src/context/AuthContext";
import { useToast } from "@/src/components/Toast";
import { useTheme } from "@/src/hooks/useTheme";

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
  const { colors } = useTheme();

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
  const [proSearching, setProSearching] = useState(false);
  const [taggedPro, setTaggedPro] = useState<any>(null);
  const [postAsPro, setPostAsPro] = useState(!!user?.is_professional);
  const [publishing, setPublishing] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);

  const STEPS = ["Media", "Caption", "Category", "Service", "Style", "Details", "Location", "Tag Pro", "Preview"];

  useEffect(() => {
    apiFetch<Cat[]>("/categories", { auth: false }).then(setCats).catch(() => {});
    apiFetch<Style[]>("/styles", { auth: false }).then(setStyles).catch(() => {});
  }, []);

  // Auto-detect location on mount if permission already granted
  useEffect(() => {
    const autoDetectLocation = async () => {
      const perm = await Location.getForegroundPermissionsAsync();
      if (perm.granted) {
        setLocationLoading(true);
        try {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          setCoords({ lat: loc.coords.latitude, lng: loc.coords.longitude });
          const geo = await Location.reverseGeocodeAsync({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          });
          if (geo[0]) {
            setCity(geo[0].city || geo[0].subregion || "");
            setState(geo[0].region || "");
          }
        } catch {
          // Silent fail - keep profile fallback
        } finally {
          setLocationLoading(false);
        }
      }
    };
    autoDetectLocation();
  }, []);

  useEffect(() => {
    if (catId) apiFetch<Svc[]>(`/services?category_id=${catId}`).then(setServices).catch(() => {});
  }, [catId]);

  useEffect(() => {
    if (proQuery.trim().length < 1) { setProResults([]); setProSearching(false); return; }
    setProSearching(true);
    const t = setTimeout(() => {
      apiFetch(`/professionals/search?q=${encodeURIComponent(proQuery.trim())}`)
        .then((r) => { setProResults(r); setProSearching(false); })
        .catch(() => { setProResults([]); setProSearching(false); });
    }, 150);
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
      videoMaxDuration: 60, // Limit videos to 60 seconds
      videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium, // Compress videos
    });
    if (result.canceled) return;
    setUploading(true);
    try {
      const uploaded: Media[] = [];
      for (const asset of result.assets) {
        // Check video duration (fallback check in case videoMaxDuration didn't work)
        if (asset.type === "video" && asset.duration && asset.duration > 60000) {
          toast.show("Videos must be under 60 seconds", "error");
          continue;
        }
        const name = asset.fileName || `upload.${asset.type === "video" ? "mp4" : "jpg"}`;
        const mime = asset.mimeType || (asset.type === "video" ? "video/mp4" : "image/jpeg");
        const res = await uploadMedia(asset.uri, name, mime);
        uploaded.push({ url: res.url, type: res.type, width: asset.width, height: asset.height });
      }
      setMedia((m) => [...m, ...uploaded]);
    } catch (e: any) {
      const msg = e?.message?.includes("413") ? "Video too large, try a shorter one" : "Upload failed, try again";
      toast.show(msg, "error");
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
        city: coords ? (city || null) : null,
        state: coords ? (state || null) : null,
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
        <Text style={[styles.headerTitle, { color: colors.onSurface }]}>{STEPS[step]}</Text>
        <Text style={[styles.stepCount, { color: colors.muted }]}>{step + 1}/{STEPS.length}</Text>
      </View>
      <View style={[styles.progressTrack, { backgroundColor: colors.surfaceTertiary }]}>
        <View style={[styles.progressFill, { width: `${((step + 1) / STEPS.length) * 100}%`, backgroundColor: colors.brandDeep }]} />
      </View>

      <KeyboardAwareScrollView contentContainerStyle={styles.content} bottomOffset={90} showsVerticalScrollIndicator={false}>
        {step === 0 && (
          <View>
            <Text style={[styles.stepTitle, { color: colors.onSurface }]}>Add your look</Text>
            <Text style={[type.body, { color: colors.onSurfaceSecondary }]}>Choose the photos or videos that show off the look.</Text>
            <View style={styles.mediaGrid}>
              {media.map((m, i) => (
                <View key={i} style={[styles.mediaThumb, { backgroundColor: colors.surfaceTertiary }]}>
                  <Image source={{ uri: mediaUrl(m.url) }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
                  {m.type === "video" && (
                    <View style={styles.videoIndicator}>
                      <MaterialCommunityIcons name="play-circle" size={28} color="#FFFFFF" />
                    </View>
                  )}
                  <Pressable testID={`remove-media-${i}`} onPress={() => setMedia((arr) => arr.filter((_, x) => x !== i))} style={styles.removeMedia}>
                    <MaterialCommunityIcons name="close" size={14} color="#FFFFFF" />
                  </Pressable>
                </View>
              ))}
              <Pressable testID="create-pick-media" onPress={pickMedia} style={[styles.addMedia, { borderColor: colors.borderStrong }]}>
                {uploading ? <Loading /> : <><MaterialCommunityIcons name="camera-plus-outline" size={28} color={colors.brandDeep} /><Text style={[styles.addMediaText, { color: colors.brandDeep }]}>Add</Text></>}
              </Pressable>
            </View>
          </View>
        )}

        {step === 1 && (
          <View>
            <Text style={[styles.stepTitle, { color: colors.onSurface }]}>Write a caption</Text>
            <TextInput
              testID="create-caption"
              value={caption}
              onChangeText={setCaption}
              placeholder="Birthday hair ❤️"
              placeholderTextColor={colors.faint}
              multiline
              style={[styles.captionInput, { backgroundColor: colors.surfaceSecondary, color: colors.onSurface, borderColor: colors.border }]}
            />
            {user?.is_professional && (
              <Pressable testID="post-as-pro" onPress={() => setPostAsPro((p) => !p)} style={styles.toggle}>
                <MaterialCommunityIcons name={postAsPro ? "checkbox-marked" : "checkbox-blank-outline"} size={22} color={colors.brandDeep} />
                <Text style={[styles.toggleText, { color: colors.onSurface }]}>Post as my professional profile</Text>
              </Pressable>
            )}
          </View>
        )}

        {step === 2 && (
          <View>
            <Text style={[styles.stepTitle, { color: colors.onSurface }]}>Select a category</Text>
            <View style={styles.chips}>
              {cats.map((c) => (
                <Pressable key={c.id} testID={`create-cat-${c.name}`} onPress={() => { setCatId(c.id); setCatName(c.name); setSvc(null); setSvcMode("pick"); }} style={[styles.optChip, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }, catId === c.id && { backgroundColor: colors.surfaceInverse, borderColor: colors.surfaceInverse }]}>
                  <MaterialCommunityIcons name={c.icon as any} size={18} color={catId === c.id ? colors.onSurfaceInverse : colors.brandDeep} />
                  <Text style={[styles.optChipText, { color: colors.onSurface }, catId === c.id && { color: colors.onSurfaceInverse }]}>{c.name}</Text>
                </Pressable>
              ))}
            </View>
            {catName === "Other" && (
              <View style={{ marginTop: spacing.lg }}>
                <Text style={[styles.fieldLabel, { color: colors.onSurface }]}>Enter your category</Text>
                <TextInput
                  testID="create-custom-category"
                  value={customCategory}
                  onChangeText={setCustomCategory}
                  placeholder="e.g. Editorial Makeup"
                  placeholderTextColor={colors.faint}
                  style={[styles.smallInput, { backgroundColor: colors.surfaceSecondary, color: colors.onSurface, borderColor: colors.border }]}
                />
              </View>
            )}
          </View>
        )}

        {step === 3 && (
          <View>
            <Text style={[styles.stepTitle, { color: colors.onSurface }]}>Select a service</Text>
            <Text style={[type.body, { color: colors.onSurfaceSecondary }]}>Optional — what service is this?</Text>
            <View style={styles.chips}>
              {services.map((s) => (
                <Pressable key={s.id} testID={`create-svc-${s.name}`} onPress={() => { setSvcMode("pick"); setSvc(svc?.id === s.id ? null : s); }} style={[styles.optChip, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }, svcMode === "pick" && svc?.id === s.id && { backgroundColor: colors.surfaceInverse, borderColor: colors.surfaceInverse }]}>
                  <Text style={[styles.optChipText, { color: colors.onSurface }, svcMode === "pick" && svc?.id === s.id && { color: colors.onSurfaceInverse }]}>{s.name}</Text>
                </Pressable>
              ))}
              <Pressable testID="create-svc-other" onPress={() => { setSvcMode("custom"); setSvc(null); }} style={[styles.optChip, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }, svcMode === "custom" && { backgroundColor: colors.surfaceInverse, borderColor: colors.surfaceInverse }]}>
                <MaterialCommunityIcons name="plus" size={16} color={svcMode === "custom" ? colors.onSurfaceInverse : colors.brandDeep} />
                <Text style={[styles.optChipText, { color: colors.onSurface }, svcMode === "custom" && { color: colors.onSurfaceInverse }]}>Other / Custom</Text>
              </Pressable>
            </View>
            {svcMode === "custom" && (
              <View style={{ marginTop: spacing.lg }}>
                <Text style={[styles.fieldLabel, { color: colors.onSurface }]}>Custom service</Text>
                <TextInput
                  testID="create-custom-service"
                  value={customService}
                  onChangeText={setCustomService}
                  placeholder="e.g. Mermaid Knotless Braids"
                  placeholderTextColor={colors.faint}
                  style={[styles.smallInput, { backgroundColor: colors.surfaceSecondary, color: colors.onSurface, borderColor: colors.border }]}
                />
              </View>
            )}
          </View>
        )}

        {step === 4 && (
          <View>
            <Text style={[styles.stepTitle, { color: colors.onSurface }]}>Add styles</Text>
            <Text style={[type.body, { color: colors.onSurfaceSecondary }]}>Search or create style tags. Add as many as you like.</Text>
            {selectedStyles.length > 0 && (
              <View style={[styles.chips, { marginTop: spacing.md }]}>
                {selectedStyles.map((s) => (
                  <Pressable key={s} testID={`style-tag-${s}`} onPress={() => setSelectedStyles((arr) => arr.filter((x) => x !== s))} style={[styles.optChip, { backgroundColor: colors.surfaceInverse, borderColor: colors.surfaceInverse }]}>
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
              style={[styles.smallInput, { marginTop: spacing.md, backgroundColor: colors.surfaceSecondary, color: colors.onSurface, borderColor: colors.border }]}
              autoCapitalize="words"
            />
            <View style={[styles.chips, { marginTop: spacing.md }]}>
              {styles_
                .filter((s) => !styleQuery || s.name.toLowerCase().includes(styleQuery.toLowerCase()))
                .filter((s) => !selectedStyles.includes(s.name))
                .slice(0, 20)
                .map((s) => (
                  <Pressable key={s.id} testID={`create-style-${s.name}`} onPress={() => { setSelectedStyles((arr) => [...arr, s.name]); setStyleQuery(""); }} style={[styles.optChip, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
                    <Text style={[styles.optChipText, { color: colors.onSurface }]}>{s.name}</Text>
                  </Pressable>
                ))}
              {styleQuery.trim().length > 1 &&
                !styles_.some((s) => s.name.toLowerCase() === styleQuery.trim().toLowerCase()) &&
                !selectedStyles.some((s) => s.toLowerCase() === styleQuery.trim().toLowerCase()) && (
                  <Pressable testID="create-style-add-custom" onPress={() => { setSelectedStyles((arr) => [...arr, styleQuery.trim()]); setStyleQuery(""); }} style={[styles.optChip, { backgroundColor: colors.surfaceSecondary, borderColor: colors.brandDeep, borderStyle: "dashed" }]}>
                    <MaterialCommunityIcons name="plus" size={15} color={colors.brandDeep} />
                    <Text style={[styles.optChipText, { color: colors.brandDeep }]}>Create "{styleQuery.trim()}"</Text>
                  </Pressable>
                )}
            </View>
          </View>
        )}

        {step === 5 && (
          <View>
            <Text style={[styles.stepTitle, { color: colors.onSurface }]}>Add details</Text>
            <Text style={[type.body, { color: colors.onSurfaceSecondary }]}>All optional. Helps others recreate the look.</Text>
            <View style={[styles.hint, { backgroundColor: colors.brandTertiary }]}>
              <MaterialCommunityIcons name="lightbulb-on-outline" size={16} color={colors.brandDeep} />
              <Text style={[styles.hintText, { color: colors.brandDeep }]}>Filling out these details helps future clients find and recreate this look — and helps pros get discovered.</Text>
            </View>
            {ATTR_FIELDS.map((f) => (
              <View key={f} style={{ marginTop: spacing.md }}>
                <Text style={[styles.fieldLabel, { color: colors.onSurface }]}>{f}</Text>
                <TextInput
                  testID={`attr-${f}`}
                  value={attrs[f] || ""}
                  onChangeText={(t) => setAttrs((a) => ({ ...a, [f]: t }))}
                  placeholder={`e.g. ${f === "Length" ? "Waist" : f === "Price" ? "$250" : f}`}
                  placeholderTextColor={colors.faint}
                  style={[styles.smallInput, { backgroundColor: colors.surfaceSecondary, color: colors.onSurface, borderColor: colors.border }]}
                />
              </View>
            ))}
          </View>
        )}

        {step === 6 && (
          <View>
            <Text style={[styles.stepTitle, { color: colors.onSurface }]}>Add location</Text>
            <Text style={[type.body, { color: colors.onSurfaceSecondary }]}>Help people nearby discover your look.</Text>
            <View style={[styles.hint, { backgroundColor: colors.brandTertiary }]}>
              <MaterialCommunityIcons name="map-marker-radius-outline" size={16} color={colors.brandDeep} />
              <Text style={[styles.hintText, { color: colors.brandDeep }]}>Adding your location helps your post appear in the Nearby feed so local beauty lovers and pros can find it.</Text>
            </View>
            {locationLoading ? (
              <View style={[styles.locLoadingRow, { backgroundColor: colors.surfaceSecondary }]}>
                <Loading />
                <Text style={[styles.locLoadingText, { color: colors.muted }]}>Detecting your location...</Text>
              </View>
            ) : coords ? (
              <View style={[styles.locStatusRow, { marginTop: spacing.lg }]}>
                <MaterialCommunityIcons name="check-circle" size={18} color={colors.brandDeep} />
                <Text style={[styles.locStatusText, { color: colors.brandDeep }]}>
                  {city && state ? `${city}, ${state}` : "Location added"}
                </Text>
              </View>
            ) : null}
            <Btn
              label={coords ? "Update Location" : "Use My Location"}
              variant={coords ? "outline" : "primary"}
              icon="crosshairs-gps"
              onPress={useCurrentLocation}
              style={{ marginTop: spacing.lg, height: 46 }}
            />
            {!coords && (
              <Text style={[type.caption, { marginTop: spacing.sm, color: colors.muted, textAlign: "center" }]}>
                Skip if you prefer not to share location
              </Text>
            )}
          </View>
        )}

        {step === 7 && (
          <View>
            <Text style={[styles.stepTitle, { color: colors.onSurface }]}>Tag a professional</Text>
            <Text style={[type.body, { color: colors.onSurfaceSecondary }]}>Who did this look? They'll confirm the tag.</Text>
            {taggedPro ? (
              <View style={[styles.taggedRow, { backgroundColor: colors.brandTertiary }]}>
                <MaterialCommunityIcons name="check-decagram" size={18} color={colors.brandDeep} />
                <Text style={[styles.taggedText, { color: colors.onSurface }]}>@{taggedPro.username}</Text>
                <Pressable testID="remove-tag" onPress={() => setTaggedPro(null)} style={{ marginLeft: "auto" }}>
                  <MaterialCommunityIcons name="close-circle" size={20} color={colors.faint} />
                </Pressable>
              </View>
            ) : (
              <>
                <TextInput testID="tag-search" value={proQuery} onChangeText={setProQuery} placeholder="Search @username or business" placeholderTextColor={colors.faint} autoCapitalize="none" style={[styles.smallInput, { marginTop: spacing.md, backgroundColor: colors.surfaceSecondary, color: colors.onSurface, borderColor: colors.border }]} />
                {proSearching && (
                  <View style={styles.proSearching}>
                    <Loading />
                  </View>
                )}
                {!proSearching && proQuery.trim().length >= 1 && proResults.length === 0 && (
                  <View style={[styles.proNoResults, { backgroundColor: colors.surfaceSecondary }]}>
                    <MaterialCommunityIcons name="account-search-outline" size={22} color={colors.muted} />
                    <Text style={[styles.proNoResultsText, { color: colors.muted }]}>No professionals found</Text>
                  </View>
                )}
                {proResults.map((p) => (
                  <Pressable key={p.id} testID={`tag-result-${p.id}`} onPress={() => { setTaggedPro(p); setProResults([]); setProQuery(""); }} style={[styles.proResult, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
                    <Text style={[styles.proResultName, { color: colors.onSurface }]}>{p.business_name}</Text>
                    <Text style={[styles.proResultHandle, { color: colors.muted }]}>@{p.username}</Text>
                  </Pressable>
                ))}
              </>
            )}
          </View>
        )}

        {step === 8 && (
          <View>
            <Text style={[styles.stepTitle, { color: colors.onSurface }]}>Preview</Text>
            {media[0] && (
              media[0].type === "video" ? (
                <View style={[styles.previewImg, { backgroundColor: colors.surfaceTertiary }]}>
                  <PreviewVideo uri={mediaUrl(media[0].url)!} />
                </View>
              ) : (
                <Image source={{ uri: mediaUrl(media[0].url) }} style={[styles.previewImg, { backgroundColor: colors.surfaceTertiary }]} contentFit="cover" />
              )
            )}
            {caption ? <Text style={[styles.caption, { color: colors.onSurface }]}>{caption}</Text> : null}
            <View style={styles.previewMeta}>
              <PreviewRow label="Category" value={catName === "Other" && customCategory ? customCategory : catName} colors={colors} />
              <PreviewRow label="Service" value={svcMode === "custom" ? customService : svc?.name} colors={colors} />
              <PreviewRow label="Style" value={selectedStyles.join(", ")} colors={colors} />
              <PreviewRow label="Location" value={coords ? [city, state].filter(Boolean).join(", ") || "Added" : undefined} colors={colors} />
              <PreviewRow label="Tagged" value={taggedPro ? `@${taggedPro.username}` : undefined} colors={colors} />
            </View>
          </View>
        )}
      </KeyboardAwareScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md, borderTopColor: colors.border, backgroundColor: colors.surface }]}>
        {step < STEPS.length - 1 ? (
          <Btn testID="create-next" label={step === 0 && media.length === 0 ? "Add media to continue" : "Next"} onPress={() => canNext() && setStep(step + 1)} disabled={!canNext()} />
        ) : (
          <Btn testID="create-publish" label="Publish Look" variant="secondary" onPress={publish} loading={publishing} />
        )}
      </View>
    </View>
  );
}

function PreviewRow({ label, value, colors }: { label: string; value?: string; colors: any }) {
  if (!value) return null;
  return (
    <View style={styles.prevRow}>
      <Text style={[styles.prevLabel, { color: colors.muted }]}>{label}</Text>
      <Text style={[styles.prevValue, { color: colors.onSurface }]}>{value}</Text>
    </View>
  );
}

function PreviewVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });
  return <VideoView player={player} style={{ width: "100%", height: "100%" }} contentFit="cover" nativeControls={false} />;
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  headerTitle: { fontFamily: font.bold, fontSize: 17 },
  stepCount: { fontFamily: font.semibold, fontSize: 13 },
  progressTrack: { height: 3, marginHorizontal: spacing.lg, borderRadius: 2 },
  progressFill: { height: 3, borderRadius: 2 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  stepTitle: { fontFamily: font.displaySemi, fontSize: 26, marginBottom: spacing.xs },
  hint: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.md },
  hintText: { flex: 1, fontFamily: font.medium, fontSize: 12.5, lineHeight: 18 },
  mediaGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, marginTop: spacing.lg },
  mediaThumb: { width: 100, height: 130, borderRadius: radius.md, overflow: "hidden" },
  videoIndicator: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.2)" },
  removeMedia: { position: "absolute", top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" },
  addMedia: { width: 100, height: 130, borderRadius: radius.md, borderWidth: 1.5, borderStyle: "dashed", alignItems: "center", justifyContent: "center", gap: 4 },
  addMediaText: { fontFamily: font.semibold, fontSize: 12 },
  captionInput: { borderRadius: radius.lg, padding: spacing.lg, minHeight: 140, fontFamily: font.medium, fontSize: 16, marginTop: spacing.lg, textAlignVertical: "top", borderWidth: 1 },
  toggle: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.lg },
  toggleText: { fontFamily: font.semibold, fontSize: 14 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.lg },
  optChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: spacing.lg, height: 44, borderRadius: radius.pill, borderWidth: 1 },
  optChipText: { fontFamily: font.semibold, fontSize: 14 },
  fieldLabel: { fontFamily: font.semibold, fontSize: 13, marginBottom: 6 },
  smallInput: { borderRadius: radius.md, paddingHorizontal: spacing.lg, height: 48, fontFamily: font.medium, fontSize: 15, borderWidth: 1 },
  taggedRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, borderRadius: radius.lg, padding: spacing.lg, marginTop: spacing.lg },
  taggedText: { fontFamily: font.bold, fontSize: 15 },
  proResult: { padding: spacing.md, borderRadius: radius.md, borderWidth: 1, marginTop: spacing.sm },
  proResultName: { fontFamily: font.bold, fontSize: 14 },
  proResultHandle: { fontFamily: font.regular, fontSize: 12 },
  proSearching: { marginTop: spacing.md, alignItems: "center", paddingVertical: spacing.md },
  proNoResults: { marginTop: spacing.md, padding: spacing.lg, borderRadius: radius.md, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  proNoResultsText: { fontFamily: font.medium, fontSize: 14 },
  previewImg: { width: "100%", aspectRatio: 0.9, borderRadius: radius.lg, marginTop: spacing.lg, overflow: "hidden" },
  caption: { fontFamily: font.regular, fontSize: 15, marginTop: spacing.md },
  previewMeta: { marginTop: spacing.lg, gap: spacing.sm },
  prevRow: { flexDirection: "row", justifyContent: "space-between" },
  prevLabel: { fontFamily: font.semibold, fontSize: 12, letterSpacing: 0.4 },
  prevValue: { fontFamily: font.semibold, fontSize: 14 },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1 },
  locLoadingRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg, borderRadius: radius.md, marginBottom: spacing.sm },
  locLoadingText: { fontFamily: font.medium, fontSize: 14 },
  locStatusRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm },
  locStatusText: { fontFamily: font.medium, fontSize: 14 },
});
