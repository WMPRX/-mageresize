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
  const didDragRef = useRef(false);
  const [fraction, setFractionState] = useState(0.5);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          startFractionRef.current = fractionRef.current;
          didDragRef.current = false;
        },
        onPanResponderMove: (_, gs) => {
          if (Math.abs(gs.dx) > 4) {
            didDragRef.current = true;
          }
          const w = containerWidthRef.current;
          const next = Math.max(
            0.02,
            Math.min(0.98, startFractionRef.current + gs.dx / w)
          );
          fractionRef.current = next;
          setFractionState(next);
        },
        onPanResponderRelease: () => {
          if (!didDragRef.current) {
            onClose();
          }
        },
      }),
    [onClose]
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
      {/* Outer Pressable dismisses modal on tap anywhere on the backdrop */}
      <Pressable
        style={[
          styles.overlay,
          { paddingTop: insets.top, paddingBottom: insets.bottom },
        ]}
        onPress={onClose}
      >
        {/* Header card — inner View so tap here bubbles up to outer Pressable */}
        <View style={styles.headerCard}>
          <View style={styles.sizeInfo}>
            <Ionicons name="images-outline" size={14} color={Colors.light.textPrimary} />
            <Text style={styles.sizeOriginal}>{formatBytes(originalSize)}</Text>
            <Ionicons name="arrow-forward" size={12} color={Colors.light.coral} />
            <Text style={styles.sizeCompressed}>{formatBytes(compressedSize)}</Text>
            {savings > 0 && (
              <View style={styles.savingsBadge}>
                <Text style={styles.savingsText}>-%{savings}</Text>
              </View>
            )}
          </View>
          <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={12}>
            <Ionicons name="close" size={20} color={Colors.light.textPrimary} />
          </Pressable>
        </View>

        {/* Image comparison — PanResponder claims all touches; tap (no drag) also closes */}
        <View
          style={styles.imageContainer}
          onLayout={handleLayout}
          {...panResponder.panHandlers}
        >
          <Image
            source={{ uri: compressedUri }}
            style={StyleSheet.absoluteFillObject}
            resizeMode="contain"
          />

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

          <View
            style={[styles.dividerLine, { left: sliderPx - 1 }]}
            pointerEvents="none"
          />

          <View
            style={[styles.handleWrapper, { left: sliderPx - HANDLE_SIZE / 2 }]}
            pointerEvents="none"
          >
            <View style={styles.handle}>
              <Ionicons name="chevron-back" size={14} color={Colors.light.coral} />
              <Ionicons name="chevron-forward" size={14} color={Colors.light.coral} />
            </View>
          </View>

          <View style={[styles.labelContainer, styles.labelLeft]} pointerEvents="none">
            <Text style={styles.labelText}>Önce</Text>
          </View>

          <View style={[styles.labelContainer, styles.labelRight]} pointerEvents="none">
            <Text style={styles.labelText}>Sonra</Text>
          </View>

          <View style={styles.hintContainer} pointerEvents="none">
            <Text style={styles.hintText}>← Sürükle →</Text>
          </View>
        </View>

        {/* Footer — tap on footer also triggers outer Pressable (onClose) */}
        <View style={styles.footer}>
          <View style={styles.footerPill} />
          <Text style={styles.footerHint}>Kapatmak için dokun</Text>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(30,20,40,0.88)",
    flexDirection: "column",
  },
  headerCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 12,
    backgroundColor: Colors.light.cream,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: Colors.light.coral,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 8,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.8)",
  },
  sizeInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
    flexWrap: "wrap",
  },
  sizeOriginal: {
    color: Colors.light.textSecondary,
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  sizeCompressed: {
    color: Colors.light.coral,
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  savingsBadge: {
    backgroundColor: Colors.light.mintLight,
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
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.light.creamDark,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 10,
    borderWidth: 1,
    borderColor: "rgba(255,107,107,0.2)",
  },
  imageContainer: {
    flex: 1,
    overflow: "hidden",
    backgroundColor: "#0D0D14",
    borderTopWidth: 1.5,
    borderBottomWidth: 1.5,
    borderColor: Colors.light.coral + "40",
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
    backgroundColor: Colors.light.coral,
    shadowColor: Colors.light.coral,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
    elevation: 6,
  },
  handleWrapper: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: HANDLE_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  handle: {
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
    borderRadius: HANDLE_SIZE / 2,
    backgroundColor: Colors.light.cream,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    shadowColor: Colors.light.coral,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 12,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.9)",
  },
  labelContainer: {
    position: "absolute",
    top: 14,
    backgroundColor: Colors.light.cream + "EE",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,107,107,0.25)",
  },
  labelLeft: {
    left: 14,
  },
  labelRight: {
    right: 14,
  },
  labelText: {
    color: Colors.light.textPrimary,
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.3,
  },
  hintContainer: {
    position: "absolute",
    bottom: 14,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  hintText: {
    color: "rgba(255,255,255,0.35)",
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.5,
  },
  footer: {
    alignItems: "center",
    paddingVertical: 14,
    gap: 6,
    backgroundColor: Colors.light.cream + "15",
  },
  footerPill: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.light.coral + "55",
  },
  footerHint: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    letterSpacing: 0.3,
  },
});
