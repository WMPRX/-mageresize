import React, { useRef, useState, useMemo } from "react";
import {
  Dimensions,
  Image,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";

type Props = {
  visible: boolean;
  onClose: () => void;
  originalUri: string;
  compressedUri: string;
  originalSize: number;
  compressedSize: number;
};

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "?";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

const SCREEN_W = Dimensions.get("window").width;
const HANDLE_SIZE = 44;

export function ComparisonModal({
  visible,
  onClose,
  originalUri,
  compressedUri,
  originalSize,
  compressedSize,
}: Props) {
  const insets = useSafeAreaInsets();

  const containerWidthRef = useRef(SCREEN_W);
  const fractionRef = useRef(0.5);
  const startFractionRef = useRef(0.5);
  const [fraction, setFractionState] = useState(0.5);

  const setFraction = (v: number) => {
    fractionRef.current = v;
    setFractionState(v);
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          startFractionRef.current = fractionRef.current;
        },
        onPanResponderMove: (_, gs) => {
          const w = containerWidthRef.current;
          const next = Math.max(
            0.02,
            Math.min(0.98, startFractionRef.current + gs.dx / w)
          );
          fractionRef.current = next;
          setFractionState(next);
        },
      }),
    []
  );

  const handleLayout = (e: {
    nativeEvent: { layout: { width: number; height: number } };
  }) => {
    containerWidthRef.current = e.nativeEvent.layout.width;
  };

  const savings =
    originalSize > 0
      ? Math.max(
          0,
          Math.round(((originalSize - compressedSize) / originalSize) * 100)
        )
      : 0;

  const sliderPx = fraction * containerWidthRef.current;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent={Platform.OS !== "web"}
    >
      <View
        style={[
          styles.overlay,
          { paddingTop: insets.top, paddingBottom: insets.bottom },
        ]}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.sizeInfo}>
            <Ionicons name="images-outline" size={14} color="#fff" />
            <Text style={styles.sizeText}>{formatBytes(originalSize)}</Text>
            <Ionicons name="arrow-forward" size={12} color={Colors.light.mint} />
            <Text style={[styles.sizeText, { color: Colors.light.mint }]}>
              {formatBytes(compressedSize)}
            </Text>
            {savings > 0 && (
              <View style={styles.savingsBadge}>
                <Text style={styles.savingsText}>-%{savings}</Text>
              </View>
            )}
          </View>
          <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={12}>
            <Ionicons name="close" size={22} color="#fff" />
          </Pressable>
        </View>

        {/* Image comparison area */}
        <View
          style={styles.imageContainer}
          onLayout={handleLayout}
          {...panResponder.panHandlers}
        >
          {/* Bottom layer: compressed (full width) */}
          <Image
            source={{ uri: compressedUri }}
            style={StyleSheet.absoluteFillObject}
            resizeMode="contain"
          />

          {/* Top layer: original (clipped to slider position) */}
          <View
            style={[styles.clipView, { width: sliderPx }]}
            pointerEvents="none"
          >
            <Image
              source={{ uri: originalUri }}
              style={[
                StyleSheet.absoluteFillObject,
                { width: containerWidthRef.current },
              ]}
              resizeMode="contain"
            />
          </View>

          {/* Divider line */}
          <View
            style={[styles.dividerLine, { left: sliderPx - 1 }]}
            pointerEvents="none"
          />

          {/* Handle */}
          <View
            style={[styles.handle, { left: sliderPx - HANDLE_SIZE / 2 }]}
            pointerEvents="none"
          >
            <Ionicons name="chevron-back" size={14} color={Colors.light.coral} />
            <Ionicons name="chevron-forward" size={14} color={Colors.light.coral} />
          </View>

          {/* Before label */}
          <View style={[styles.labelContainer, styles.labelLeft]} pointerEvents="none">
            <Text style={styles.labelText}>Önce</Text>
          </View>

          {/* After label */}
          <View style={[styles.labelContainer, styles.labelRight]} pointerEvents="none">
            <Text style={styles.labelText}>Sonra</Text>
          </View>
        </View>

        {/* Footer */}
        <Pressable style={styles.footer} onPress={onClose}>
          <View style={styles.footerPill} />
          <Text style={styles.footerHint}>Kapatmak için dokun</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    flexDirection: "column",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  sizeInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
    flexWrap: "wrap",
  },
  sizeText: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  savingsBadge: {
    backgroundColor: Colors.light.mint,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  savingsText: {
    color: "#1A8C6A",
    fontSize: 12,
    fontFamily: "Inter_700Bold",
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 12,
  },
  imageContainer: {
    flex: 1,
    overflow: "hidden",
    backgroundColor: "#111",
    position: "relative",
  },
  clipView: {
    position: "absolute",
    top: 0,
    left: 0,
    bottom: 0,
    overflow: "hidden",
  },
  dividerLine: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 4,
    elevation: 6,
  },
  handle: {
    position: "absolute",
    top: "50%" as unknown as number,
    marginTop: -(HANDLE_SIZE / 2),
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
    borderRadius: HANDLE_SIZE / 2,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 10,
  },
  labelContainer: {
    position: "absolute",
    top: 14,
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  labelLeft: {
    left: 14,
  },
  labelRight: {
    right: 14,
  },
  labelText: {
    color: "#fff",
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.4,
  },
  footer: {
    alignItems: "center",
    paddingVertical: 14,
    gap: 6,
  },
  footerPill: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  footerHint: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
});
