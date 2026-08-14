import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors, spacing, radius, font, type } from "@/src/theme/tokens";
import { apiFetch } from "@/src/lib/api";
import { Loading, IconBtn, Btn } from "@/src/components/ui";
import { useToast } from "@/src/components/Toast";

export default function ProDashboard() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [pro, setPro] = useState<any>(null);

  const load = useCallback(async () => {
    try { setPro(await apiFetch("/professional/me")); } catch {}
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!pro) return <View style={{ flex: 1, backgroundColor: colors.surface }}><Loading /></View>;

  const requestVerify = async () => {
    try {
      await apiFetch("/professional/verification/request", { method: "POST" });
      toast.show("Verification requested", "success");
      load();
    } catch (e: any) { toast.show(e.message || "Failed", "error"); }
  };

  const links = [
    { label: "View Public Profile", icon: "account-eye-outline", onPress: () => router.push(`/professional/${pro.id}`) },
    { label: "Analytics", icon: "chart-line", onPress: () => router.push("/professional/analytics") },
    { label: "Edit Profile & Services", icon: "pencil-outline", onPress: () => router.push("/professional/edit") },
  ];

  const vStatus = pro.verification_status;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top + spacing.sm }}>
      <View style={styles.header}>
        <IconBtn icon="chevron-left" onPress={() => router.back()} />
        <Text style={styles.title}>Pro Studio</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xxl }}>
        <Text style={styles.business}>{pro.business_name}</Text>
        <Text style={type.body}>@{pro.username}</Text>

        {/* Verification */}
        <View style={styles.verifyCard}>
          <MaterialCommunityIcons
            name={vStatus === "VERIFIED" ? "check-decagram" : vStatus === "PENDING" ? "clock-outline" : "shield-alert-outline"}
            size={24}
            color={vStatus === "VERIFIED" ? colors.brandDeep : colors.muted}
          />
          <View style={{ flex: 1, marginLeft: spacing.md }}>
            <Text style={styles.verifyTitle}>
              {vStatus === "VERIFIED" ? "Verified Professional" : vStatus === "PENDING" ? "Verification Pending" : vStatus === "REJECTED" ? "Verification Rejected" : "Not Verified"}
            </Text>
            <Text style={type.small}>
              {vStatus === "VERIFIED" ? "You have the verified badge." : "Get verified to build trust."}
            </Text>
          </View>
          {(vStatus === "NOT_VERIFIED" || vStatus === "REJECTED") && (
            <Pressable testID="request-verify" onPress={requestVerify} style={styles.verifyBtn}>
              <Text style={styles.verifyBtnText}>Request</Text>
            </Pressable>
          )}
        </View>

        {links.map((l) => (
          <Pressable key={l.label} testID={`dashboard-${l.label}`} onPress={l.onPress} style={styles.link}>
            <MaterialCommunityIcons name={l.icon as any} size={22} color={colors.onSurface} />
            <Text style={styles.linkText}>{l.label}</Text>
            <MaterialCommunityIcons name="chevron-right" size={22} color={colors.faint} style={{ marginLeft: "auto" }} />
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { fontFamily: font.displaySemi, fontSize: 24, color: colors.onSurface },
  business: { fontFamily: font.displaySemi, fontSize: 28, color: colors.onSurface },
  verifyCard: { flexDirection: "row", alignItems: "center", backgroundColor: colors.brandTertiary, borderRadius: radius.lg, padding: spacing.lg, marginVertical: spacing.lg },
  verifyTitle: { fontFamily: font.bold, fontSize: 15, color: colors.onSurface },
  verifyBtn: { backgroundColor: colors.surfaceInverse, borderRadius: radius.pill, paddingHorizontal: spacing.lg, paddingVertical: 8 },
  verifyBtnText: { fontFamily: font.bold, fontSize: 13, color: colors.onSurfaceInverse },
  link: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md },
  linkText: { fontFamily: font.semibold, fontSize: 15, color: colors.onSurface },
});
