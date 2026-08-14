import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Tabs } from "expo-router";
import { useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { colors, spacing, font } from "@/src/theme/tokens";

const TABS = [
  { name: "index", label: "Home", icon: "home-variant", iconOutline: "home-variant-outline" },
  { name: "discover", label: "Discover", icon: "compass", iconOutline: "compass-outline" },
  { name: "create", label: "", icon: "plus", iconOutline: "plus" },
  { name: "saved", label: "Saved", icon: "bookmark", iconOutline: "bookmark-outline" },
  { name: "profile", label: "Profile", icon: "account", iconOutline: "account-outline" },
] as const;

function TabBar({ state, navigation }: any) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom + spacing.sm }]}>
      {TABS.map((tab, i) => {
        const isCreate = tab.name === "create";
        // route indexes: real routes are index, discover, saved, profile (create is modal-triggered)
        const routeName = state.routes[state.index]?.name;
        const focused = routeName === tab.name;

        if (isCreate) {
          return (
            <Pressable
              key={tab.name}
              testID="tab-create"
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                router.push("/create");
              }}
              style={styles.createWrap}
            >
              <View style={styles.createBtn}>
                <MaterialCommunityIcons name="plus" size={30} color={colors.onSurfaceInverse} />
              </View>
            </Pressable>
          );
        }

        return (
          <Pressable
            key={tab.name}
            testID={`tab-${tab.name}`}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              navigation.navigate(tab.name);
            }}
            style={styles.tab}
          >
            <MaterialCommunityIcons
              name={(focused ? tab.icon : tab.iconOutline) as any}
              size={25}
              color={focused ? colors.onSurface : colors.faint}
            />
            <Text style={[styles.label, { color: focused ? colors.onSurface : colors.faint }]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <TabBar {...props} />}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="discover" />
      <Tabs.Screen name="saved" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    alignItems: "flex-start",
  },
  tab: { flex: 1, alignItems: "center", justifyContent: "center", gap: 3, paddingTop: 2 },
  label: { fontFamily: font.medium, fontSize: 10.5 },
  createWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  createBtn: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.brandDeep,
    alignItems: "center",
    justifyContent: "center",
    marginTop: -18,
    shadowColor: colors.brandDeep,
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
});
