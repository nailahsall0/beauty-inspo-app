import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, TextInput } from "react-native";
import { useRouter } from "expo-router";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors, spacing, radius, font, type } from "@/src/theme/tokens";
import { apiFetch } from "@/src/lib/api";
import { Btn, IconBtn } from "@/src/components/ui";
import { useAuth } from "@/src/context/AuthContext";
import { useToast } from "@/src/components/Toast";

type Cat = { id: string; name: string; icon: string };
type Svc = { id: string; name: string; price: string; duration: string };

export default function ProOnboard() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { refresh, user } = useAuth();
  const toast = useToast();
  const [cats, setCats] = useState<Cat[]>([]);
  const [business, setBusiness] = useState("");
  const [username, setUsername] = useState(user?.username || "");
  const [bio, setBio] = useState("");
  const [selectedCats, setSelectedCats] = useState<string[]>([]);
  const [city, setCity] = useState(user?.city || "");
  const [state, setState] = useState(user?.state || "");
  const [radius_, setRadius] = useState("25");
  const [booking, setBooking] = useState("");
  const [ig, setIg] = useState("");
  const [tiktok, setTiktok] = useState("");
  const [services, setServices] = useState<Svc[]>([{ id: "1", name: "", price: "", duration: "" }]);
  const [saving, setSaving] = useState(false);

  useEffect(() => { apiFetch<Cat[]>("/categories", { auth: false }).then(setCats).catch(() => {}); }, []);

  const toggleCat = (id: string) => setSelectedCats((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const addService = () => setServices((s) => [...s, { id: Date.now().toString(), name: "", price: "", duration: "" }]);
  const updateService = (i: number, k: keyof Svc, v: string) => setServices((s) => s.map((x, idx) => (idx === i ? { ...x, [k]: v } : x)));
  const removeService = (i: number) => setServices((s) => s.filter((_, idx) => idx !== i));

  const submit = async () => {
    if (!business.trim() || !username.trim()) { toast.show("Business name & username required", "error"); return; }
    if (selectedCats.length === 0) { toast.show("Pick at least one category", "error"); return; }
    setSaving(true);
    try {
      await apiFetch("/professional/onboard", {
        method: "POST",
        body: {
          business_name: business.trim(),
          username: username.trim(),
          bio: bio.trim(),
          category_ids: selectedCats,
          city: city.trim() || null,
          state: state.trim() || null,
          service_radius: parseInt(radius_) || 25,
          booking_url: booking.trim() || null,
          instagram: ig.trim() || null,
          tiktok: tiktok.trim() || null,
          services: services.filter((s) => s.name.trim()).map((s) => ({ name: s.name.trim(), price: s.price ? parseFloat(s.price) : null, duration: s.duration || null, category_id: selectedCats[0] })),
        },
      });
      await refresh();
      toast.show("Professional profile created! 🎉", "success");
      router.replace("/professional/dashboard");
    } catch (e: any) {
      toast.show(e.message || "Failed", "error");
    } finally { setSaving(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top + spacing.sm }}>
      <View style={styles.header}>
        <IconBtn icon="chevron-left" onPress={() => router.back()} />
        <Text style={styles.title}>Become a Pro</Text>
      </View>
      <KeyboardAwareScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }} bottomOffset={90} showsVerticalScrollIndicator={false}>
        <Text style={[type.body, { marginBottom: spacing.lg }]}>Set up your professional profile so customers can discover and book you.</Text>

        <Field label="Business / Professional name" value={business} onChange={setBusiness} placeholder="Braids by Kay" testID="onboard-business" />
        <Field label="Username" value={username} onChange={setUsername} placeholder="braidsbykay" testID="onboard-username" autoCap="none" />
        <Field label="Bio" value={bio} onChange={setBio} placeholder="Boho + Knotless Specialist" multiline testID="onboard-bio" />

        <Text style={styles.label}>Beauty categories</Text>
        <View style={styles.chips}>
          {cats.map((c) => (
            <Pressable key={c.id} testID={`onboard-cat-${c.name}`} onPress={() => toggleCat(c.id)} style={[styles.chip, selectedCats.includes(c.id) && styles.chipActive]}>
              <Text style={[styles.chipText, selectedCats.includes(c.id) && { color: colors.onSurfaceInverse }]}>{c.name}</Text>
            </Pressable>
          ))}
        </View>

        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <View style={{ flex: 1 }}><Field label="City" value={city} onChange={setCity} placeholder="Cincinnati" testID="onboard-city" /></View>
          <View style={{ width: 90 }}><Field label="State" value={state} onChange={setState} placeholder="OH" testID="onboard-state" /></View>
        </View>
        <Field label="Service radius (miles)" value={radius_} onChange={setRadius} placeholder="25" keyboard="numeric" testID="onboard-radius" />

        <Text style={styles.label}>Services & Pricing</Text>
        {services.map((s, i) => (
          <View key={s.id} style={styles.serviceCard}>
            <TextInput testID={`service-name-${i}`} value={s.name} onChangeText={(v) => updateService(i, "name", v)} placeholder="Service name (e.g. Boho Knotless)" placeholderTextColor={colors.faint} style={styles.svcInput} />
            <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
              <TextInput testID={`service-price-${i}`} value={s.price} onChangeText={(v) => updateService(i, "price", v)} placeholder="Price $" keyboardType="numeric" placeholderTextColor={colors.faint} style={[styles.svcInput, { flex: 1 }]} />
              <TextInput testID={`service-dur-${i}`} value={s.duration} onChangeText={(v) => updateService(i, "duration", v)} placeholder="Duration" placeholderTextColor={colors.faint} style={[styles.svcInput, { flex: 1 }]} />
              {services.length > 1 && (
                <Pressable onPress={() => removeService(i)} style={styles.svcRemove}>
                  <MaterialCommunityIcons name="trash-can-outline" size={18} color={colors.error} />
                </Pressable>
              )}
            </View>
          </View>
        ))}
        <Pressable testID="add-service" onPress={addService} style={styles.addSvc}>
          <MaterialCommunityIcons name="plus" size={18} color={colors.brandDeep} />
          <Text style={styles.addSvcText}>Add another service</Text>
        </Pressable>

        <Field label="Booking URL" value={booking} onChange={setBooking} placeholder="https://calendly.com/you" autoCap="none" testID="onboard-booking" />
        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <View style={{ flex: 1 }}><Field label="Instagram" value={ig} onChange={setIg} placeholder="handle" autoCap="none" testID="onboard-ig" /></View>
          <View style={{ flex: 1 }}><Field label="TikTok" value={tiktok} onChange={setTiktok} placeholder="handle" autoCap="none" testID="onboard-tiktok" /></View>
        </View>
      </KeyboardAwareScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <Btn testID="onboard-submit" label="Create Professional Profile" onPress={submit} loading={saving} />
      </View>
    </View>
  );
}

function Field({ label, value, onChange, placeholder, multiline, keyboard, autoCap, testID }: any) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.faint}
        multiline={multiline}
        keyboardType={keyboard}
        autoCapitalize={autoCap}
        style={[styles.input, multiline && { minHeight: 90, textAlignVertical: "top", paddingTop: spacing.md }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { fontFamily: font.displaySemi, fontSize: 24, color: colors.onSurface },
  label: { fontFamily: font.semibold, fontSize: 13, color: colors.onSurface, marginBottom: 6, marginTop: spacing.sm },
  input: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, paddingHorizontal: spacing.lg, height: 50, fontFamily: font.medium, fontSize: 15, color: colors.onSurface, borderWidth: 1, borderColor: colors.border },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.md },
  chip: { paddingHorizontal: spacing.lg, height: 42, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  chipActive: { backgroundColor: colors.surfaceInverse, borderColor: colors.surfaceInverse },
  chipText: { fontFamily: font.semibold, fontSize: 14, color: colors.onSurface },
  serviceCard: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm },
  svcInput: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, paddingHorizontal: spacing.md, height: 46, fontFamily: font.medium, fontSize: 14, color: colors.onSurface },
  svcRemove: { width: 46, height: 46, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  addSvc: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", marginTop: spacing.sm, marginBottom: spacing.md },
  addSvcText: { fontFamily: font.bold, fontSize: 14, color: colors.brandDeep },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
});
