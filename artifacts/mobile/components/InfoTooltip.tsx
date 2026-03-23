import React, { useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

type InfoTooltipProps = {
  icon?: React.ComponentProps<typeof Ionicons>["name"];
  iconColor?: string;
  label: string;
  content: string;
  headerStyle?: ViewStyle;
};

export function InfoTooltip({
  icon,
  iconColor,
  label,
  content,
  headerStyle,
}: InfoTooltipProps) {
  const [open, setOpen] = useState(false);

  return (
    <View>
      <View style={[styles.headerRow, headerStyle]}>
        {icon && (
          <Ionicons
            name={icon}
            size={16}
            color={iconColor ?? Colors.light.lavender}
          />
        )}
        <Text style={styles.label}>{label}</Text>
        <Pressable
          onPress={() => setOpen((v) => !v)}
          style={styles.iconBtn}
          hitSlop={8}
        >
          <Ionicons
            name={open ? "close-circle-outline" : "help-circle-outline"}
            size={18}
            color={Colors.light.lavender}
          />
        </Pressable>
      </View>

      {open && (
        <View style={styles.card}>
          <Text style={styles.cardText}>{content}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  label: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.textPrimary,
  },
  iconBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.light.lavender + "20",
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    backgroundColor: Colors.light.cream,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Colors.light.lavender + "55",
    padding: 12,
    marginBottom: 8,
    shadowColor: Colors.light.lavender,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.14,
    shadowRadius: 8,
    elevation: 4,
  },
  cardText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textSecondary,
    lineHeight: 18,
  },
});
