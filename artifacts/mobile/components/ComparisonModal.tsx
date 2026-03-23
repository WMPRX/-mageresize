import React, { useRef, useState, useMemo, useEffect } from "react";
import {
  Animated,
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

const SCREEN_W = Dimensions.get("window").width;
const HANDLE_SIZE = 44;
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_SLOP = 50;
const MIN_SCALE = 1;
const MAX_SCALE = 5;

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
  const containerHeightRef = useRef(400);

  const fractionRef = useRef(0.5);
  const startFractionRef = useRef(0.5);
  const didDragRef = useRef(false);
  const [fraction, setFractionState] = useState(0.5);

  const scaleRef = useRef(1);
  const translateXRef = useRef(0);
  const translateYRef = useRef(0);
  const startTxRef = useRef(0);
  const startTyRef = useRef(0);
  const [isZoomed, setIsZoomed] = useState(false);

  const animScale = useRef(new Animated.Value(1)).current;
  const animTx = useRef(new Animated.Value(0)).current;
  const animTy = useRef(new Animated.Value(0)).current;

  const isZoomedRef = useRef(false);

  const isPinchingRef = useRef(false);
  const pinchInitializedRef = useRef(false);
  const initialPinchDistRef = useRef(0);
  const initialScaleRef = useRef(1);
  const initialMidXRef = useRef(0);
  const initialMidYRef = useRef(0);
  const initialTxRef = useRef(0);
  const initialTyRef = useRef(0);

  const lastTapTimeRef = useRef(0);
  const lastTapXRef = useRef(0);
  const lastTapYRef = useRef(0);

  useEffect(() => {
    if (!visible) {
      animScale.stopAnimation();
      animTx.stopAnimation();
      animTy.stopAnimation();
      animScale.setValue(1);
      animTx.setValue(0);
      animTy.setValue(0);
      scaleRef.current = 1;
      translateXRef.current = 0;
      translateYRef.current = 0;
      fractionRef.current = 0.5;
      lastTapTimeRef.current = 0;
      isPinchingRef.current = false;
      pinchInitializedRef.current = false;
      isZoomedRef.current = false;
      setIsZoomed(false);
      setFractionState(0.5);
    }
  }, [visible, animScale, animTx, animTy]);

  const resetZoomAnimated = () => {
    scaleRef.current = 1;
    translateXRef.current = 0;
    translateYRef.current = 0;
    isZoomedRef.current = false;
    setIsZoomed(false);
    Animated.parallel([
      Animated.spring(animScale, {
        toValue: 1,
        useNativeDriver: true,
        tension: 120,
        friction: 8,
      }),
      Animated.spring(animTx, {
        toValue: 0,
        useNativeDriver: true,
        tension: 120,
        friction: 8,
      }),
      Animated.spring(animTy, {
        toValue: 0,
        useNativeDriver: true,
        tension: 120,
        friction: 8,
      }),
    ]).start();
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,

        onPanResponderGrant: () => {
          startFractionRef.current = fractionRef.current;
          startTxRef.current = translateXRef.current;
          startTyRef.current = translateYRef.current;
          didDragRef.current = false;
          isPinchingRef.current = false;
          pinchInitializedRef.current = false;
        },

        onPanResponderMove: (evt, gs) => {
          const touches = evt.nativeEvent.touches;

          if (touches.length >= 2) {
            if (!pinchInitializedRef.current) {
              const t0 = touches[0];
              const t1 = touches[1];
              const dist = Math.hypot(
                t1.pageX - t0.pageX,
                t1.pageY - t0.pageY
              );
              initialPinchDistRef.current = dist < 1 ? 1 : dist;
              initialScaleRef.current = scaleRef.current;
              initialMidXRef.current = (t0.pageX + t1.pageX) / 2;
              initialMidYRef.current = (t0.pageY + t1.pageY) / 2;
              initialTxRef.current = translateXRef.current;
              initialTyRef.current = translateYRef.current;
              pinchInitializedRef.current = true;
              isPinchingRef.current = true;
            }

            const t0 = touches[0];
            const t1 = touches[1];
            const dist = Math.hypot(
              t1.pageX - t0.pageX,
              t1.pageY - t0.pageY
            );
            const newScale = clamp(
              initialScaleRef.current * (dist / initialPinchDistRef.current),
              MIN_SCALE,
              MAX_SCALE
            );

            const midX = (t0.pageX + t1.pageX) / 2;
            const midY = (t0.pageY + t1.pageY) / 2;

            const maxTx = (containerWidthRef.current * (newScale - 1)) / 2;
            const maxTy = (containerHeightRef.current * (newScale - 1)) / 2;

            const newTx = clamp(
              initialTxRef.current + (midX - initialMidXRef.current),
              -maxTx,
              maxTx
            );
            const newTy = clamp(
              initialTyRef.current + (midY - initialMidYRef.current),
              -maxTy,
              maxTy
            );

            scaleRef.current = newScale;
            translateXRef.current = newTx;
            translateYRef.current = newTy;
            animScale.setValue(newScale);
            animTx.setValue(newTx);
            animTy.setValue(newTy);
            if (newScale > 1.01 && !isZoomedRef.current) {
              isZoomedRef.current = true;
              setIsZoomed(true);
            }
            didDragRef.current = true;
          } else {
            if (isPinchingRef.current) return;

            if (Math.abs(gs.dx) > 4 || Math.abs(gs.dy) > 4) {
              didDragRef.current = true;
            }

            if (scaleRef.current > 1.01) {
              const maxTx =
                (containerWidthRef.current * (scaleRef.current - 1)) / 2;
              const maxTy =
                (containerHeightRef.current * (scaleRef.current - 1)) / 2;
              const newTx = clamp(
                startTxRef.current + gs.dx,
                -maxTx,
                maxTx
              );
              const newTy = clamp(
                startTyRef.current + gs.dy,
                -maxTy,
                maxTy
              );
              translateXRef.current = newTx;
              translateYRef.current = newTy;
              animTx.setValue(newTx);
              animTy.setValue(newTy);
            } else {
              const w = containerWidthRef.current;
              const next = clamp(
                startFractionRef.current + gs.dx / w,
                0.02,
                0.98
              );
              fractionRef.current = next;
              setFractionState(next);
            }
          }
        },

        onPanResponderRelease: (_, gs) => {
          isPinchingRef.current = false;
          pinchInitializedRef.current = false;

          if (!didDragRef.current) {
            const now = Date.now();
            const timeDiff = now - lastTapTimeRef.current;
            const dx = Math.abs(gs.x0 - lastTapXRef.current);
            const dy = Math.abs(gs.y0 - lastTapYRef.current);

            if (
              timeDiff < DOUBLE_TAP_MS &&
              dx < DOUBLE_TAP_SLOP &&
              dy < DOUBLE_TAP_SLOP
            ) {
              resetZoomAnimated();
              lastTapTimeRef.current = 0;
            } else {
              lastTapTimeRef.current = now;
              lastTapXRef.current = gs.x0;
              lastTapYRef.current = gs.y0;
              if (scaleRef.current <= 1.01) {
                onClose();
              }
            }
          }
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onClose]
  );

  const handleLayout = (e: {
    nativeEvent: { layout: { width: number; height: number } };
  }) => {
    containerWidthRef.current = e.nativeEvent.layout.width;
    containerHeightRef.current = e.nativeEvent.layout.height;
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
      <Pressable
        style={[
          styles.overlay,
          { paddingTop: insets.top, paddingBottom: insets.bottom },
        ]}
        onPress={onClose}
      >
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

        <View
          style={styles.imageContainer}
          onLayout={handleLayout}
          {...panResponder.panHandlers}
        >
          <Animated.View
            style={[
              styles.transformedContent,
              {
                transform: [
                  { scale: animScale },
                  { translateX: animTx },
                  { translateY: animTy },
                ],
              },
            ]}
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
          </Animated.View>

          <View style={[styles.labelContainer, styles.labelLeft]} pointerEvents="none">
            <Text style={styles.labelText}>Önce</Text>
          </View>

          <View style={[styles.labelContainer, styles.labelRight]} pointerEvents="none">
            <Text style={styles.labelText}>Sonra</Text>
          </View>

          {isZoomed && (
            <View style={styles.scaleBadge} pointerEvents="none">
              <Ionicons name="search" size={10} color={Colors.light.textPrimary} />
              <Text style={styles.scaleBadgeText}>
                {scaleRef.current.toFixed(1)}×
              </Text>
            </View>
          )}

          <View style={styles.hintContainer} pointerEvents="none">
            <Text style={styles.hintText}>
              {isZoomed
                ? "Kaydır · Çift dokun: sıfırla"
                : "← Sürükle → · İki parmak: yakınlaştır"}
            </Text>
          </View>
        </View>

        <View style={styles.footer}>
          <View style={styles.footerPill} />
          <Text style={styles.footerHint}>
            {isZoomed
              ? "Çift dokun: sıfırla · Dışarı dokun: kapat"
              : "Kapatmak için dokun"}
          </Text>
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
  transformedContent: {
    ...StyleSheet.absoluteFillObject,
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
    backgroundColor: "#ffffff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 4,
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
  scaleBadge: {
    position: "absolute",
    bottom: 44,
    right: 12,
    backgroundColor: Colors.light.lavender + "E8",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.55)",
    shadowColor: Colors.light.lavender,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 6,
  },
  scaleBadgeText: {
    color: Colors.light.textPrimary,
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.4,
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
