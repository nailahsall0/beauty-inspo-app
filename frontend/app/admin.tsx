import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors, spacing, radius, font, type } from "@/src/theme/tokens";
import { apiFetch } from "@/src/lib/api";
import { Loading, IconBtn, Btn, Avatar, VerifiedBadge } from "@/src/components/ui";
import { useToast } from "@/src/components/Toast";

const TABS = ["Overview", "Verify", "Reports", "Catalog"];

export default function Admin() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [tab, setTab] = useState(0);
  const [stats, setStats] = useState<any>(null);
  const [verifications, setVerifications] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [newCat, setNewCat] = useState("");
  const [newStyle, setNewStyle] = useState("");

  const load = useCallback(async () => {
    try {
      const [s, v, r] = await Promise.all([
        apiFetch("/admin/stats"),
        apiFetch<any[]>("/admin/verifications"),
        apiFetch<any[]>("/admin/reports"),
      ]);
      setStats(s); setVerifications(v); setReports(r);
    } catch (e: any) { toast.show(e.message || "Admin only", "error"); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const verify = async (id: string, status: string) => {
    try { await apiFetch(`/admin/professional/${id}/verify?status=${status}`, { method: "POST" }); toast.show(`Marked ${status}`, "success"); load(); } catch {}
  };
  const resolve = async (id: string) => {
    try { await apiFetch(`/admin/reports/${id}/resolve?action=dismissed`, { method: "POST" }); toast.show("Resolved", "success"); load(); } catch {}
  };
  const addCat = async () => {
    if (!newCat.trim()) return;
    try { await apiFetch("/admin/categories", { method: "POST", body: { name: newCat.trim() } }); setNewCat(""); toast.show("Category added", "success"); } catch (e: any) { toast.show(e.message, "error"); }
  };
  const addStyle = async () => {
    if (!newStyle.trim()) return;
    try { await apiFetch("/admin/styles", { method: "POST", body: { name: newStyle.trim() } }); setNewStyle(""); toast.show("Style added", "success"); } catch (e: any) { toast.show(e.message, "error"); }
  };

  if (!stats) return <View style={{ flex: 1, backgroundColor: colors.surface }}><Loading /></View>;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top + spacing.sm }}>
      <View style={styles.header}>
        <IconBtn icon="chevron-left" onPress={() => router.back()} />
        <Text style={styles.title}>Admin</Text>
      </View>
      <View style={styles.tabs}>
        {TABS.map((t, i) => (
          <Pressable key={t} testID={`admin-tab-${t}`} onPress={() => setTab(i)} style={styles.tab}>
            <Text style={[styles.tabText, tab === i && styles.tabActive]}>{t}</Text>
            {tab === i && <View style={styles.underline} />}
          </Pressable>
        ))}
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xxl }} showsVerticalScrollIndicator={false}>
        {tab === 0 && (
          <View style={styles.grid}>
            {[
              { l: "Users", v: stats.users, i: "account-group" },
              { l: "Professionals", v: stats.professionals, i: "star-circle" },
              { l: "Posts", v: stats.posts, i: "image-multiple" },
              { l: "Open Reports", v: stats.reports, i: "flag" },
              { l: "Pending Verify", v: stats.pending_verifications, i: "shield-check" },
            ].map((c) => (
              <View key={c.l} style={styles.statCard}>
                <MaterialCommunityIcons name={c.i as any} size={20} color={colors.brandDeep} />
                <Text style={styles.statValue}>{c.v}</Text>
                <Text style={styles.statLabel}>{c.l}</Text>
              </View>
            ))}
          </View>
        )}

        {tab === 1 && (
          verifications.length === 0 ? <Text style={type.body}>No professionals awaiting verification.</Text> :
          verifications.map((v) => (
            <View key={v.id} style={styles.card}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Avatar uri={v.avatar_url} name={v.business_name} size={40} />
                <View style={{ flex: 1, marginLeft: spacing.md }}>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Text style={styles.cardTitle}>{v.business_name}</Text>
                    <VerifiedBadge status={v.verification_status} />
                  </View>
                  <Text style={type.small}>@{v.username} · {v.verification_status}</Text>
                </View>
              </View>
              <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
                <Btn testID={`reject-${v.id}`} label="Reject" variant="outline" onPress={() => verify(v.id, "REJECTED")} style={{ flex: 1, height: 40 }} />
                <Btn testID={`verify-${v.id}`} label="Verify" onPress={() => verify(v.id, "VERIFIED")} style={{ flex: 1, height: 40 }} />
              </View>
            </View>
          ))
        )}

        {tab === 2 && (
          reports.length === 0 ? <Text style={type.body}>No reports.</Text> :
          reports.map((r) => (
            <View key={r.id} style={styles.card}>
              <Text style={styles.cardTitle}>{r.reason}</Text>
              <Text style={type.small}>{r.target_type} · {r.status}</Text>
              {r.details ? <Text style={[type.body, { marginTop: 4 }]}>{r.details}</Text> : null}
              {r.status === "open" && <Btn testID={`resolve-${r.id}`} label="Dismiss" variant="outline" onPress={() => resolve(r.id)} style={{ marginTop: spacing.md, height: 40 }} />}
            </View>
          ))
        )}

        {tab === 3 && (
          <View style={{ gap: spacing.lg }}>
            <View>
              <Text style={styles.label}>Add Category</Text>
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <TextInput testID="admin-new-cat" value={newCat} onChangeText={setNewCat} placeholder="Category name" placeholderTextColor={colors.faint} style={styles.input} />
                <Btn testID="admin-add-cat" label="Add" onPress={addCat} style={{ height: 48, paddingHorizontal: spacing.lg }} />
              </View>
            </View>
            <View>
              <Text style={styles.label}>Add Style</Text>
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <TextInput testID="admin-new-style" value={newStyle} onChangeText={setNewStyle} placeholder="Style name" placeholderTextColor={colors.faint} style={styles.input} />
                <Btn testID="admin-add-style" label="Add" onPress={addStyle} style={{ height: 48, paddingHorizontal: spacing.lg }} />
              </View>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  title: { fontFamily: font.displaySemi, fontSize: 24, color: colors.onSurface },
  tabs: { flexDirection: "row", gap: spacing.lg, paddingHorizontal: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  tab: { alignItems: "center", paddingBottom: spacing.md },
  tabText: { fontFamily: font.semibold, fontSize: 14, color: colors.faint },
  tabActive: { color: colors.onSurface },
  underline: { height: 2.5, width: 20, backgroundColor: colors.brandDeep, borderRadius: 2, marginTop: 6, position: "absolute", bottom: -1 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  statCard: { width: "47.5%", backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, gap: 4 },
  statValue: { fontFamily: font.bold, fontSize: 26, color: colors.onSurface, marginTop: spacing.sm },
  statLabel: { fontFamily: font.medium, fontSize: 12.5, color: colors.muted },
  card: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md },
  cardTitle: { fontFamily: font.bold, fontSize: 15, color: colors.onSurface },
  label: { fontFamily: font.semibold, fontSize: 13, color: colors.onSurface, marginBottom: 6 },
  input: { flex: 1, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, paddingHorizontal: spacing.lg, height: 48, fontFamily: font.medium, fontSize: 15, color: colors.onSurface, borderWidth: 1, borderColor: colors.border },
});
