import React from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";

import Colors from "@/constants/colors";

type ClayCardProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  color?: string;
  elevated?: boolean;
};

export function ClayCard({
  children,
  style,
  color = Colors.light.card,
  elevated = false,
}: ClayCardProps) {
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: color },
        elevated && styles.elevated,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.10,
    shadowRadius: 16,
    elevation: 6,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.8)",
  },
  elevated: {
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 12,
  },
});
