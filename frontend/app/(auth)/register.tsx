import React, { useState } from "react";
import { View, Text, StyleSheet, TextInput, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { spacing, radius, font, type } from "@/src/theme/tokens";
import { Btn } from "@/src/components/ui";
import { useAuth } from "@/src/context/AuthContext";
import { useToast } from "@/src/components/Toast";
import { useTheme } from "@/src/hooks/useTheme";

export default function Register() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { register } = useAuth();
  const toast = useToast();
  const { colors } = useTheme();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!name || !username || !email) {
      toast.show("Please fill all fields", "error");
      return;
    }
    if (password.length < 8) {
      toast.show("Password must be at least 8 characters", "error");
      return;
    }
    if (!/[A-Z]/.test(password)) {
      toast.show("Password must contain an uppercase letter", "error");
      return;
    }
    if (!/[a-z]/.test(password)) {
      toast.show("Password must contain a lowercase letter", "error");
      return;
    }
    if (!/[0-9]/.test(password)) {
      toast.show("Password must contain a number", "error");
      return;
    }
    setLoading(true);
    try {
      await register(email.trim(), password, name.trim(), username.trim());
      router.replace("/(auth)/interests");
    } catch (e: any) {
      toast.show(e.message || "Registration failed", "error");
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = [styles.input, { backgroundColor: colors.surfaceSecondary, color: colors.onSurface, borderColor: colors.border }];

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <KeyboardAwareScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + spacing.xl }]}
        bottomOffset={20}
      >
        <Pressable testID="register-back" onPress={() => router.back()} style={styles.back}>
          <MaterialCommunityIcons name="chevron-left" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={[styles.title, { color: colors.onSurface }]}>Create account</Text>
        <Text style={[type.body, { marginBottom: spacing.lg, color: colors.onSurfaceSecondary }]}>Join brook.ie and start discovering.</Text>

        <Text style={[styles.label, { color: colors.onSurface }]}>Display name</Text>
        <TextInput testID="register-name" value={name} onChangeText={setName} placeholder="Maya Rivera" placeholderTextColor={colors.faint} style={inputStyle} />
        <Text style={[styles.label, { color: colors.onSurface }]}>Username</Text>
        <TextInput testID="register-username" value={username} onChangeText={setUsername} placeholder="maya" autoCapitalize="none" placeholderTextColor={colors.faint} style={inputStyle} />
        <Text style={[styles.label, { color: colors.onSurface }]}>Email</Text>
        <TextInput testID="register-email" value={email} onChangeText={setEmail} placeholder="you@email.com" autoCapitalize="none" keyboardType="email-address" placeholderTextColor={colors.faint} style={inputStyle} />
        <Text style={[styles.label, { color: colors.onSurface }]}>Password</Text>
        <TextInput testID="register-password" value={password} onChangeText={setPassword} placeholder="Min 8 chars, uppercase, lowercase, number" secureTextEntry placeholderTextColor={colors.faint} style={inputStyle} />

        <Btn testID="register-submit" label="Continue" onPress={submit} loading={loading} style={{ marginTop: spacing.lg }} />

        <View style={styles.footer}>
          <Text style={[type.body, { color: colors.onSurfaceSecondary }]}>Already have an account? </Text>
          <Pressable testID="register-to-login" onPress={() => router.replace("/(auth)/login")}>
            <Text style={[styles.link, { color: colors.brandDeep }]}>Sign in</Text>
          </Pressable>
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl },
  back: { marginBottom: spacing.md, marginLeft: -6 },
  title: { fontFamily: font.display, fontSize: 40, marginBottom: spacing.xs },
  label: { fontFamily: font.semibold, fontSize: 13, marginBottom: spacing.sm, marginTop: spacing.md },
  input: {
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    height: 54,
    fontFamily: font.medium,
    fontSize: 15,
    borderWidth: 1,
  },
  footer: { flexDirection: "row", justifyContent: "center", marginTop: spacing.xl },
  link: { fontFamily: font.bold, fontSize: 14 },
});
