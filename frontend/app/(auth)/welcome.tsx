import React from "react";
import { View, Text, StyleSheet, ImageBackground } from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing, font, type } from "@/src/theme/tokens";
import { Btn } from "@/src/components/ui";

export default function Welcome() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.container}>
      <ImageBackground
        source={{ uri: "https://images.unsplash.com/photo-1522337660859-02fbefca4702?w=1000&q=80" }}
        style={styles.hero}
      >
        <LinearGradient
          colors={["rgba(28,20,16,0.1)", "rgba(28,20,16,0.35)", colors.surface]}
          locations={[0, 0.5, 1]}
          style={StyleSheet.absoluteFill}
        />
      </ImageBackground>

      <View style={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}>
        <Text style={styles.brand}>brook.ie</Text>
        <Text style={styles.tagline}>
          Discover the look. Find the pro.{"\n"}Book the vibe.
        </Text>
        <Text style={[type.body, { textAlign: "center", marginBottom: spacing.xl, maxWidth: 320 }]}>
          The beauty discovery platform that connects inspiration with the professionals who can recreate it.
        </Text>
        <Btn testID="welcome-get-started" label="Get Started" onPress={() => router.push("/(auth)/register")} />
        <Btn
          testID="welcome-login"
          label="I already have an account"
          variant="ghost"
          onPress={() => router.push("/(auth)/login")}
          style={{ marginTop: spacing.sm }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  hero: { flex: 1 },
  content: { paddingHorizontal: spacing.xl, alignItems: "center", paddingTop: spacing.sm },
  brand: { fontFamily: font.display, fontSize: 52, color: colors.onSurface, marginBottom: spacing.xs },
  tagline: {
    fontFamily: font.displaySemi,
    fontSize: 24,
    lineHeight: 30,
    color: colors.onSurface,
    textAlign: "center",
    marginBottom: spacing.md,
  },
});
