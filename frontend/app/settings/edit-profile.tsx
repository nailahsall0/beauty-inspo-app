import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, TextInput } from "react-native";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors, spacing, radius, font } from "@/src/theme/tokens";
import { apiFetch, uploadMedia } from "@/src/lib/api";
import { Avatar, Btn, IconBtn } from "@/src/components/ui";
import { useAuth } from "@/src/context/AuthContext";
import { useToast } from "@/src/components/Toast";

export default function EditProfile() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, refresh } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(user?.display_name || "");
  const [username, setUsername] = useState(user?.username || "");
  const [bio, setBio] = useState(user?.bio || "");
  const [city, setCity] = useState(user?.city || "");
  const [state, setState] = useState(user?.state || "");
  const [avatar, setAvatar] = useState(user?.avatar_url || "");
  const [saving, setSaving] = useState(false);

  const pickAvatar = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== "granted") { toast.show("Photo access needed", "error"); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.6 });
    if (res.canceled) return;
    try {
      const asset = res.assets[0];
      const up = await uploadMedia(asset.uri, asset.fileName || "avatar.jpg", asset.mimeType || "image/jpeg");
      setAvatar(up.url);
    } catch { toast.show("Upload failed", "error"); }
  };

  const save = async () => {
    setSaving(true);
    try {
      await apiFetch("/users/me", { method: "PUT", body: { display_name: name.trim(), username: username.trim(), bio, city, state, avatar_url: avatar } });
      await refresh();
      toast.show("Profile saved", "success");
      router.back();
    } catch (e: any) { toast.show(e.message || "Failed", "error"); }
    finally { setSaving(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top + spacing.sm }}>
      <View style={styles.header}>
        <IconBtn icon="chevron-left" onPress={() => router.back()} />
        <Text style={styles.title}>Edit Profile</Text>
      </View>
      <KeyboardAwareScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }} bottomOffset={90} showsVerticalScrollIndicator={false}>
        <Pressable testID="edit-avatar" onPress={pickAvatar} style={styles.avatarWrap}>
          <Avatar uri={avatar} name={name} size={96} ring />
          <View style={styles.avatarEdit}>
            <MaterialCommunityIcons name="camera" size={16} color={colors.onSurfaceInverse} />
          </View>
        </Pressable>

        <F label="Display name" value={name} onChange={setName} testID="edit-name" />
        <F label="Username" value={username} onChange={setUsername} autoCap="none" testID="edit-username" />
        <F label="Bio" value={bio} onChange={setBio} multiline testID="edit-bio" />
        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <View style={{ flex: 1 }}><F label="City" value={city} onChange={setCity} testID="edit-city" /></View>
          <View style={{ width: 90 }}><F label="State" value={state} onChange={setState} testID="edit-state" /></View>
        </View>
      </KeyboardAwareScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <Btn testID="edit-profile-save" label="Save Changes" onPress={save} loading={saving} />
      </View>
    </View>
  );
}

function F({ label, value, onChange, multiline, autoCap, testID }: any) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput testID={testID} value={value} onChangeText={onChange} placeholderTextColor={colors.faint} multiline={multiline} autoCapitalize={autoCap} style={[styles.input, multiline && { minHeight: 90, textAlignVertical: "top", paddingTop: spacing.md }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { fontFamily: font.displaySemi, fontSize: 24, color: colors.onSurface },
  avatarWrap: { alignSelf: "center", marginBottom: spacing.xl },
  avatarEdit: { position: "absolute", bottom: 0, right: 0, width: 30, height: 30, borderRadius: 15, backgroundColor: colors.brandDeep, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.surface },
  label: { fontFamily: font.semibold, fontSize: 13, color: colors.onSurface, marginBottom: 6 },
  input: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, paddingHorizontal: spacing.lg, height: 50, fontFamily: font.medium, fontSize: 15, color: colors.onSurface, borderWidth: 1, borderColor: colors.border },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
});
