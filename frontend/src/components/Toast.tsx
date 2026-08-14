import React, { createContext, useContext, useState, useCallback, useRef } from "react";
import { Text, StyleSheet, Animated, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors, spacing, radius, font } from "@/src/theme/tokens";

type ToastKind = "success" | "error" | "info";
type ToastValue = { show: (msg: string, kind?: ToastKind) => void };
const Ctx = createContext<ToastValue>({ show: () => {} });

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [msg, setMsg] = useState("");
  const [kind, setKind] = useState<ToastKind>("info");
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<any>(null);

  const show = useCallback(
    (m: string, k: ToastKind = "info") => {
      setMsg(m);
      setKind(k);
      Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }).start();
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }).start();
      }, 2600);
    },
    [opacity]
  );

  const icon = kind === "success" ? "check-circle" : kind === "error" ? "alert-circle" : "information";
  const iconColor = kind === "success" ? colors.success : kind === "error" ? colors.error : colors.brandDeep;

  return (
    <Ctx.Provider value={{ show }}>
      {children}
      <Animated.View pointerEvents="none" style={[styles.wrap, { opacity }]}>
        <View style={styles.toast}>
          <MaterialCommunityIcons name={icon as any} size={20} color={iconColor} />
          <Text style={styles.text} numberOfLines={2}>
            {msg}
          </Text>
        </View>
      </Animated.View>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: 60,
    left: spacing.lg,
    right: spacing.lg,
    alignItems: "center",
    zIndex: 9999,
  },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceInverse,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    maxWidth: 420,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  text: { color: colors.onSurfaceInverse, fontFamily: font.medium, fontSize: 13, marginLeft: spacing.sm, flexShrink: 1 },
});
