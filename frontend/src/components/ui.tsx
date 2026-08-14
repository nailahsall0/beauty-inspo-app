import React from "react";
import {
  Text,
  View,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
  StyleProp,
} from "react-native";
import { Image } from "expo-image";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { colors, spacing, radius, type, font } from "@/src/theme/tokens";
import { mediaUrl } from "@/src/lib/api";

export function Btn({
  label,
  onPress,
  variant = "primary",
  loading,
  disabled,
  icon,
  style,
  testID,
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "outline" | "dark" | "ghost";
  loading?: boolean;
  disabled?: boolean;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const bg = {
    primary: colors.brand,
    secondary: colors.pink,
    outline: "transparent",
    dark: colors.surfaceInverse,
    ghost: "transparent",
  }[variant];
  const fg = variant === "dark" ? colors.onSurfaceInverse : colors.onSurface;
  const border = variant === "outline" ? { borderWidth: 1.5, borderColor: colors.borderStrong } : {};
  return (
    <Pressable
      testID={testID}
      onPress={() => {
        if (disabled || loading) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        onPress();
      }}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        border,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.btnRow}>
          {icon && <MaterialCommunityIcons name={icon} size={18} color={fg} style={{ marginRight: 8 }} />}
          <Text style={[styles.btnText, { color: fg }]}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

export function IconBtn({
  icon,
  onPress,
  size = 22,
  color = colors.onSurface,
  bg = colors.surfaceSecondary,
  testID,
  active,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  onPress: () => void;
  size?: number;
  color?: string;
  bg?: string;
  testID?: string;
  active?: boolean;
}) {
  return (
    <Pressable
      testID={testID}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress();
      }}
      style={({ pressed }) => [
        styles.iconBtn,
        { backgroundColor: active ? colors.brand : bg, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <MaterialCommunityIcons name={icon} size={size} color={color} />
    </Pressable>
  );
}

export function Avatar({
  uri,
  name,
  size = 44,
  ring,
}: {
  uri?: string | null;
  name?: string;
  size?: number;
  ring?: boolean;
}) {
  const resolved = mediaUrl(uri);
  const initials = (name || "?").trim().slice(0, 1).toUpperCase();
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: colors.brandTertiary,
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        },
        ring && { borderWidth: 2, borderColor: colors.brand },
      ]}
    >
      {resolved ? (
        <Image source={{ uri: resolved }} style={{ width: "100%", height: "100%" }} contentFit="cover" transition={200} />
      ) : (
        <Text style={{ fontFamily: font.bold, fontSize: size * 0.4, color: colors.brandDeep }}>{initials}</Text>
      )}
    </View>
  );
}

export function VerifiedBadge({ status, size = 15 }: { status?: string; size?: number }) {
  if (status !== "VERIFIED") return null;
  return <MaterialCommunityIcons name="check-decagram" size={size} color={colors.brandDeep} style={{ marginLeft: 4 }} />;
}

export function Pill({
  label,
  active,
  onPress,
  icon,
  testID,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      onPress={() => {
        if (onPress) {
          Haptics.selectionAsync().catch(() => {});
          onPress();
        }
      }}
      style={[
        styles.pill,
        { backgroundColor: active ? colors.surfaceInverse : colors.surfaceSecondary, borderColor: active ? colors.surfaceInverse : colors.border },
      ]}
    >
      {icon && (
        <MaterialCommunityIcons
          name={icon}
          size={15}
          color={active ? colors.onSurfaceInverse : colors.onSurfaceSecondary}
          style={{ marginRight: 6 }}
        />
      )}
      <Text style={[styles.pillText, { color: active ? colors.onSurfaceInverse : colors.onSurfaceSecondary }]}>{label}</Text>
    </Pressable>
  );
}

export function Tag({ label }: { label: string }) {
  return (
    <View style={styles.tag}>
      <Text style={styles.tagText}>{label}</Text>
    </View>
  );
}

export function EmptyState({
  icon = "image-multiple-outline",
  title,
  subtitle,
  action,
}: {
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <MaterialCommunityIcons name={icon} size={34} color={colors.brandDeep} />
      </View>
      <Text style={[type.title, { textAlign: "center", marginBottom: spacing.xs }]}>{title}</Text>
      {subtitle ? <Text style={[type.body, { textAlign: "center", maxWidth: 280 }]}>{subtitle}</Text> : null}
      {action ? <View style={{ marginTop: spacing.lg }}>{action}</View> : null}
    </View>
  );
}

export function Loading({ label }: { label?: string }) {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.brandDeep} size="large" />
      {label ? <Text style={[type.small, { marginTop: spacing.md }]}>{label}</Text> : null}
    </View>
  );
}

export function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  btn: {
    height: 52,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
  },
  btnRow: { flexDirection: "row", alignItems: "center" },
  btnText: { fontFamily: font.bold, fontSize: 15 },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  pill: {
    height: 40,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  pillText: { fontFamily: font.semibold, fontSize: 13 },
  tag: {
    backgroundColor: colors.brandTertiary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
  },
  tagText: { fontFamily: font.semibold, fontSize: 12, color: colors.brandDeep },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xxl, minHeight: 300 },
  emptyIcon: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
  },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xxl, minHeight: 300 },
  divider: { height: 1, backgroundColor: colors.divider, marginVertical: spacing.md },
});
