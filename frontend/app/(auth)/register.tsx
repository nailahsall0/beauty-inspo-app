import React, { useState } from "react";
import { View, Text, StyleSheet, TextInput, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors, spacing, radius, font, type } from "@/src/theme/tokens";
import { Btn } from "@/src/components/ui";
import { useAuth } from "@/src/context/AuthContext";
import { useToast } from "@/src/components/Toast";

export default function Register() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { register } = useAuth();
  const toast = useToast();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!name || !username || !email || password.length < 6) {
      toast.show("Fill all fields (password 6+ chars)", "error");
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

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <KeyboardAwareScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + spacing.xl }]}
        bottomOffset={20}
      >
        <Pressable testID="register-back" onPress={() => router.back()} style={styles.back}>
          <MaterialCommunityIcons name="chevron-left" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Create account</Text>
        <Text style={[type.body, { marginBottom: spacing.lg }]}>Join brook.ie and start discovering.</Text>

        <Text style={styles.label}>Display name</Text>
        <TextInput testID="register-name" value={name} onChangeText={setName} placeholder="Maya Rivera" placeholderTextColor={colors.faint} style={styles.input} />
        <Text style={styles.label}>Username</Text>
        <TextInput testID="register-username" value={username} onChangeText={setUsername} placeholder="maya" autoCapitalize="none" placeholderTextColor={colors.faint} style={styles.input} />
        <Text style={styles.label}>Email</Text>
        <TextInput testID="register-email" value={email} onChangeText={setEmail} placeholder="you@email.com" autoCapitalize="none" keyboardType="email-address" placeholderTextColor={colors.faint} style={styles.input} />
        <Text style={styles.label}>Password</Text>
        <TextInput testID="register-password" value={password} onChangeText={setPassword} placeholder="At least 6 characters" secureTextEntry placeholderTextColor={colors.faint} style={styles.input} />

        <Btn testID="register-submit" label="Continue" onPress={submit} loading={loading} style={{ marginTop: spacing.lg }} />

        <View style={styles.footer}>
          <Text style={type.body}>Already have an account? </Text>
          <Pressable testID="register-to-login" onPress={() => router.replace("/(auth)/login")}>
            <Text style={styles.link}>Sign in</Text>
          </Pressable>
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl },
  back: { marginBottom: spacing.md, marginLeft: -6 },
  title: { fontFamily: font.display, fontSize: 40, color: colors.onSurface, marginBottom: spacing.xs },
  label: { fontFamily: font.semibold, fontSize: 13, color: colors.onSurface, marginBottom: spacing.sm, marginTop: spacing.md },
  input: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    height: 54,
    fontFamily: font.medium,
    fontSize: 15,
    color: colors.onSurface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  footer: { flexDirection: "row", justifyContent: "center", marginTop: spacing.xl },
  link: { fontFamily: font.bold, fontSize: 14, color: colors.brandDeep },
});
