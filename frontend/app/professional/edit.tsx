import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, TextInput } from "react-native";
import { useRouter } from "expo-router";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { spacing, radius, font } from "@/src/theme/tokens";
import { useTheme } from "@/src/hooks/useTheme";
import { apiFetch } from "@/src/lib/api";
import { Btn, IconBtn, Loading } from "@/src/components/ui";
import { useToast } from "@/src/components/Toast";
import { useAuth } from "@/src/context/AuthContext";

type Svc = { id?: string; name: string; price: string; duration: string; category_id?: string };

export default function ProEdit() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { colors } = useTheme();
  const { refresh } = useAuth();
  const [pro, setPro] = useState<any>(null);
  const [business, setBusiness] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [radius_, setRadius] = useState("25");
  const [booking, setBooking] = useState("");
  const [ig, setIg] = useState("");
  const [tiktok, setTiktok] = useState("");
  const [website, setWebsite] = useState("");
  const [services, setServices] = useState<Svc[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch("/professional/me").then((p) => {
      setPro(p);
      setBusiness(p.business_name || "");
      setUsername(p.username || "");
      setBio(p.bio || "");
      setCity(p.city || "");
      setState(p.state || "");
      setRadius(String(p.service_radius || 25));
      setBooking(p.booking_url || "");
      setIg(p.instagram || "");
      setTiktok(p.tiktok || "");
      setWebsite(p.website || "");
      setServices((p.services || []).map((s: any) => ({ id: s.id, name: s.name, price: s.price != null ? String(s.price) : "", duration: s.duration || "", category_id: s.category_id })));
    }).catch(() => {});
  }, []);

  if (!pro) return <View style={{ flex: 1, backgroundColor: colors.surface }}><Loading /></View>;

  const addService = () => setServices((s) => [...s, { name: "", price: "", duration: "", category_id: pro.category_ids?.[0] }]);
  const update = (i: number, k: keyof Svc, v: string) => setServices((s) => s.map((x, idx) => (idx === i ? { ...x, [k]: v } : x)));
  const remove = (i: number) => setServices((s) => s.filter((_, idx) => idx !== i));

  const save = async () => {
    setSaving(true);
    try {
      await apiFetch("/professional/me", {
        method: "PUT",
        body: {
          business_name: business.trim(),
          username: username.trim(),
          bio: bio.trim(),
          city: city.trim(),
          state: state.trim(),
          service_radius: parseInt(radius_) || 25,
          booking_url: booking.trim(),
          instagram: ig.trim(),
          tiktok: tiktok.trim(),
          website: website.trim(),
          services: services.filter((s) => s.name.trim()).map((s) => ({ id: s.id, name: s.name.trim(), price: s.price ? parseFloat(s.price) : null, duration: s.duration || null, category_id: s.category_id })),
        },
      });
      await refresh(); // Update AuthContext with new user data
      toast.show("Profile updated", "success");
      router.back();
    } catch (e: any) { toast.show(e.message || "Failed", "error"); }
    finally { setSaving(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top + spacing.sm }}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <IconBtn icon="chevron-left" onPress={() => router.back()} />
        <Text style={[styles.title, { color: colors.onSurface }]}>Edit Pro Profile</Text>
      </View>
      <KeyboardAwareScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }} bottomOffset={90} showsVerticalScrollIndicator={false}>
        <F label="Business name" value={business} onChange={setBusiness} testID="edit-business" colors={colors} />
        <F label="Username" value={username} onChange={setUsername} autoCap="none" testID="edit-username" colors={colors} />
        <F label="Bio" value={bio} onChange={setBio} multiline testID="edit-bio" colors={colors} />
        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <View style={{ flex: 1 }}><F label="City" value={city} onChange={setCity} testID="edit-city" colors={colors} /></View>
          <View style={{ width: 90 }}><F label="State" value={state} onChange={setState} testID="edit-state" colors={colors} /></View>
        </View>
        <F label="Service radius (mi)" value={radius_} onChange={setRadius} keyboard="numeric" testID="edit-radius" colors={colors} />
        <F label="Booking URL" value={booking} onChange={setBooking} autoCap="none" testID="edit-booking" colors={colors} />
        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <View style={{ flex: 1 }}><F label="Instagram" value={ig} onChange={setIg} autoCap="none" testID="edit-ig" colors={colors} /></View>
          <View style={{ flex: 1 }}><F label="TikTok" value={tiktok} onChange={setTiktok} autoCap="none" testID="edit-tiktok" colors={colors} /></View>
        </View>
        <F label="Website" value={website} onChange={setWebsite} autoCap="none" testID="edit-website" colors={colors} />

        <Text style={[styles.label, { color: colors.onSurface }]}>Services & Pricing</Text>
        {services.map((s, i) => (
          <View key={i} style={[styles.svcCard, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
            <TextInput testID={`edit-svc-name-${i}`} value={s.name} onChangeText={(v) => update(i, "name", v)} placeholder="Service" placeholderTextColor={colors.faint} style={[styles.svcInput, { backgroundColor: colors.surface, color: colors.onSurface }]} />
            <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
              <TextInput testID={`edit-svc-price-${i}`} value={s.price} onChangeText={(v) => update(i, "price", v)} placeholder="Price $" keyboardType="numeric" placeholderTextColor={colors.faint} style={[styles.svcInput, { flex: 1, backgroundColor: colors.surface, color: colors.onSurface }]} />
              <TextInput testID={`edit-svc-dur-${i}`} value={s.duration} onChangeText={(v) => update(i, "duration", v)} placeholder="Duration" placeholderTextColor={colors.faint} style={[styles.svcInput, { flex: 1, backgroundColor: colors.surface, color: colors.onSurface }]} />
              <Pressable onPress={() => remove(i)} style={[styles.svcRemove, { backgroundColor: colors.surface }]}>
                <MaterialCommunityIcons name="trash-can-outline" size={18} color={colors.error} />
              </Pressable>
            </View>
          </View>
        ))}
        <Pressable testID="edit-add-service" onPress={addService} style={styles.addSvc}>
          <MaterialCommunityIcons name="plus" size={18} color={colors.brandDeep} />
          <Text style={[styles.addSvcText, { color: colors.brandDeep }]}>Add service</Text>
        </Pressable>
      </KeyboardAwareScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md, borderTopColor: colors.border, backgroundColor: colors.surface }]}>
        <Btn testID="edit-save" label="Save Changes" onPress={save} loading={saving} />
      </View>
    </View>
  );
}

function F({ label, value, onChange, multiline, keyboard, autoCap, testID, colors }: any) {
  return (
    <View style={{ marginBottom: multiline ? spacing.lg : spacing.md }}>
      <Text style={[styles.label, { color: colors.onSurface }]}>{label}</Text>
      <TextInput testID={testID} value={value} onChangeText={onChange} placeholderTextColor={colors.faint} multiline={multiline} keyboardType={keyboard} autoCapitalize={autoCap} style={[styles.input, { backgroundColor: colors.surfaceSecondary, color: colors.onSurface, borderColor: colors.border }, multiline && { minHeight: 100, height: "auto", textAlignVertical: "top", paddingTop: spacing.md, paddingBottom: spacing.md }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1 },
  title: { fontFamily: font.displaySemi, fontSize: 24 },
  label: { fontFamily: font.semibold, fontSize: 13, marginBottom: 6, marginTop: spacing.sm },
  input: { borderRadius: radius.md, paddingHorizontal: spacing.lg, height: 50, fontFamily: font.medium, fontSize: 15, borderWidth: 1 },
  svcCard: { borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, marginBottom: spacing.sm },
  svcInput: { borderRadius: radius.md, paddingHorizontal: spacing.md, height: 46, fontFamily: font.medium, fontSize: 14 },
  svcRemove: { width: 46, height: 46, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  addSvc: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", marginTop: spacing.sm },
  addSvcText: { fontFamily: font.bold, fontSize: 14 },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1 },
});
