import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { colors, spacing, radius, font, type } from "@/src/theme/tokens";
import { Btn } from "@/src/components/ui";
import { apiFetch } from "@/src/lib/api";
import { useAuth } from "@/src/context/AuthContext";
import { useToast } from "@/src/components/Toast";

type Cat = { id: string; name: string; icon: string };

export default function Interests() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { refresh } = useAuth();
  const toast = useToast();
  const [cats, setCats] = useState<Cat[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiFetch<Cat[]>("/categories", { auth: false }).then(setCats).catch(() => {});
  }, []);

  const toggle = (name: string) => {
    Haptics.selectionAsync().catch(() => {});
    setSelected((s) => (s.includes(name) ? s.filter((x) => x !== name) : [...s, name]));
  };

  const submit = async () => {
    if (selected.length === 0) {
      toast.show("Pick at least one interest", "error");
      return;
    }
    setLoading(true);
    try {
      await apiFetch("/users/me", { method: "PUT", body: { interests: selected } });
      await refresh();
      router.replace("/(tabs)");
    } catch (e: any) {
      toast.show(e.message || "Something went wrong", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top + spacing.xxl }}>
      <View style={styles.header}>
        <Text style={styles.title}>What are you into?</Text>
        <Text style={[type.body, { marginTop: spacing.xs }]}>
          Select the beauty categories you love. We'll tailor your feed.
        </Text>
      </View>
      <ScrollView contentContainerStyle={styles.grid} showsVerticalScrollIndicator={false}>
        {cats.map((c) => {
          const active = selected.includes(c.name);
          return (
            <Pressable
              key={c.id}
              testID={`interest-${c.name}`}
              onPress={() => toggle(c.name)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <MaterialCommunityIcons
                name={c.icon as any}
                size={22}
                color={active ? colors.onSurfaceInverse : colors.brandDeep}
              />
              <Text style={[styles.chipText, active && { color: colors.onSurfaceInverse }]}>{c.name}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.lg }]}>
        <Btn testID="interests-continue" label={`Continue${selected.length ? ` (${selected.length})` : ""}`} onPress={submit} loading={loading} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.xl, marginBottom: spacing.lg },
  title: { fontFamily: font.display, fontSize: 36, color: colors.onSurface },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl },
  chip: {
    width: "47%",
    height: 96,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  chipActive: { backgroundColor: colors.surfaceInverse, borderColor: colors.surfaceInverse },
  chipText: { fontFamily: font.semibold, fontSize: 15, color: colors.onSurface },
  footer: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
});
