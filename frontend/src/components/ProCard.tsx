import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors, spacing, radius, font } from "@/src/theme/tokens";
import { Avatar, VerifiedBadge } from "@/src/components/ui";

export type Pro = {
  id: string;
  username: string;
  business_name: string;
  avatar_url?: string | null;
  bio?: string;
  city?: string | null;
  state?: string | null;
  verification_status?: string;
  starting_price?: number | null;
  distance?: number | null;
};

export function ProRow({ pro, reasons }: { pro: Pro; reasons?: Record<string, any> }) {
  const router = useRouter();
  const specialty =
    reasons?.service_match === true
      ? "Exact match"
      : reasons?.style_match
      ? "Style match"
      : (pro.bio || "").split(".")[0];
  return (
    <Pressable
      testID={`pro-row-${pro.id}`}
      onPress={() => router.push(`/professional/${pro.id}`)}
      style={styles.row}
    >
      <Avatar uri={pro.avatar_url} name={pro.business_name} size={54} />
      <View style={{ flex: 1, marginLeft: spacing.md }}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {pro.business_name}
          </Text>
          <VerifiedBadge status={pro.verification_status} />
        </View>
        <Text style={styles.specialty} numberOfLines={1}>
          {specialty || `@${pro.username}`}
        </Text>
        <View style={styles.metaRow}>
          {pro.distance != null && (
            <View style={styles.metaItem}>
              <MaterialCommunityIcons name="map-marker-outline" size={13} color={colors.muted} />
              <Text style={styles.metaText}>{pro.distance} mi</Text>
            </View>
          )}
          {pro.starting_price != null && (
            <Text style={styles.price}>From ${pro.starting_price}</Text>
          )}
        </View>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={22} color={colors.faint} />
    </Pressable>
  );
}

export function ProCardCompact({ pro }: { pro: Pro }) {
  const router = useRouter();
  return (
    <Pressable
      testID={`pro-card-${pro.id}`}
      onPress={() => router.push(`/professional/${pro.id}`)}
      style={styles.card}
    >
      <Avatar uri={pro.avatar_url} name={pro.business_name} size={64} ring />
      <View style={styles.cardNameRow}>
        <Text style={styles.cardName} numberOfLines={1}>
          {pro.business_name}
        </Text>
        <VerifiedBadge status={pro.verification_status} size={13} />
      </View>
      <Text style={styles.cardCity} numberOfLines={1}>
        {pro.city || `@${pro.username}`}
      </Text>
      {pro.starting_price != null && <Text style={styles.cardPrice}>From ${pro.starting_price}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  nameRow: { flexDirection: "row", alignItems: "center" },
  name: { fontFamily: font.bold, fontSize: 15, color: colors.onSurface, flexShrink: 1 },
  specialty: { fontFamily: font.regular, fontSize: 12.5, color: colors.muted, marginTop: 1 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: 5 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 3 },
  metaText: { fontFamily: font.medium, fontSize: 12, color: colors.muted },
  price: { fontFamily: font.bold, fontSize: 12.5, color: colors.brandDeep },
  card: {
    width: 128,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.md,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardNameRow: { flexDirection: "row", alignItems: "center", marginTop: spacing.sm },
  cardName: { fontFamily: font.semibold, fontSize: 13, color: colors.onSurface, textAlign: "center" },
  cardCity: { fontFamily: font.regular, fontSize: 11, color: colors.muted, marginTop: 1 },
  cardPrice: { fontFamily: font.bold, fontSize: 12, color: colors.brandDeep, marginTop: 4 },
});
