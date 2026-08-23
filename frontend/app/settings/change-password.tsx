import React, { useState } from "react";
import { View, Text, StyleSheet, TextInput } from "react-native";
import { useRouter } from "expo-router";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { spacing, radius, font } from "@/src/theme/tokens";
import { IconBtn, Btn } from "@/src/components/ui";
import { useTheme } from "@/src/hooks/useTheme";
import { useToast } from "@/src/components/Toast";
import { apiFetch } from "@/src/lib/api";

export default function ChangePassword() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const toast = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.show("Please fill all fields", "error");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.show("New passwords don't match", "error");
      return;
    }
    if (newPassword.length < 8) {
      toast.show("Password must be at least 8 characters", "error");
      return;
    }
    if (!/[A-Z]/.test(newPassword)) {
      toast.show("Password must contain an uppercase letter", "error");
      return;
    }
    if (!/[a-z]/.test(newPassword)) {
      toast.show("Password must contain a lowercase letter", "error");
      return;
    }
    if (!/[0-9]/.test(newPassword)) {
      toast.show("Password must contain a number", "error");
      return;
    }

    setSaving(true);
    try {
      await apiFetch("/auth/change-password", {
        method: "POST",
        body: {
          current_password: currentPassword,
          new_password: newPassword,
        },
      });
      toast.show("Password changed successfully", "success");
      router.back();
    } catch (e: any) {
      toast.show(e.message || "Failed to change password", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, paddingTop: insets.top + spacing.sm }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <IconBtn icon="chevron-left" onPress={() => router.back()} />
        <Text style={[styles.title, { color: colors.onSurface }]}>Change Password</Text>
      </View>

      <KeyboardAwareScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 120 }}
        bottomOffset={90}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.onSurface }]}>Current Password</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, color: colors.onSurface }]}
            value={currentPassword}
            onChangeText={setCurrentPassword}
            secureTextEntry
            placeholderTextColor={colors.faint}
            placeholder="Enter current password"
          />
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.onSurface }]}>New Password</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, color: colors.onSurface }]}
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry
            placeholderTextColor={colors.faint}
            placeholder="Enter new password"
          />
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.onSurface }]}>Confirm New Password</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, color: colors.onSurface }]}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            placeholderTextColor={colors.faint}
            placeholder="Confirm new password"
          />
        </View>

        <Text style={[styles.hint, { color: colors.muted }]}>
          Password must be at least 8 characters with uppercase, lowercase, and a number.
        </Text>
      </KeyboardAwareScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md, borderTopColor: colors.border, backgroundColor: colors.surface }]}>
        <Btn label="Change Password" onPress={handleSave} loading={saving} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
  },
  title: { fontFamily: font.displaySemi, fontSize: 24 },
  field: { marginBottom: spacing.md },
  label: { fontFamily: font.semibold, fontSize: 13, marginBottom: 6 },
  input: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    height: 50,
    fontFamily: font.medium,
    fontSize: 15,
    borderWidth: 1,
  },
  hint: {
    fontFamily: font.regular,
    fontSize: 13,
    marginTop: spacing.sm,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
  },
});
