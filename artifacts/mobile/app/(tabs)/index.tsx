import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system";
import * as Haptics from "expo-haptics";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import * as MediaLibrary from "expo-media-library";
import * as Sharing from "expo-sharing";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ClayCard } from "@/components/ClayCard";
import Colors from "@/constants/colors";
import { useCompression } from "@/context/CompressionContext";

const { width: SCREEN_W } = Dimensions.get("window");

type SelectedPhoto = {
  uri: string;
  width: number;
  height: number;
  fileSize: number;
  fileName: string;
};

type CompressResult = {
  uri: string;
  fileSize: number;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function savingsPercent(original: number, compressed: number): number {
  return Math.round(((original - compressed) / original) * 100);
}

export default function CompressScreen() {
  const insets = useSafeAreaInsets();
  const { addToHistory } = useCompression();

  const [selected, setSelected] = useState<SelectedPhoto | null>(null);
  const [quality, setQuality] = useState(0.75);
  const [compressed, setCompressed] = useState<CompressResult | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const scaleAnim = React.useRef(new Animated.Value(1)).current;

  const animatePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.96,
      useNativeDriver: true,
      speed: 50,
    }).start();
  };
  const animatePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 30,
    }).start();
  };

  const pickImage = async () => {
    await Haptics.selectionAsync();
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: false,
      quality: 1,
    });

    if (!result.canceled && result.assets.length > 0) {
      const asset = result.assets[0];
      let fileSize = asset.fileSize ?? 0;

      if (!fileSize && asset.uri) {
        try {
          const info = await FileSystem.getInfoAsync(asset.uri, { size: true });
          fileSize = info.exists ? (info as any).size ?? 0 : 0;
        } catch (_) {}
      }

      setSelected({
        uri: asset.uri,
        width: asset.width ?? 0,
        height: asset.height ?? 0,
        fileSize,
        fileName: asset.fileName ?? `photo_${Date.now()}.jpg`,
      });
      setCompressed(null);
      setSaveSuccess(false);
    }
  };

  const compress = async () => {
    if (!selected) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsCompressing(true);
    setCompressed(null);
    setSaveSuccess(false);

    try {
      const result = await ImageManipulator.manipulateAsync(
        selected.uri,
        [],
        {
          compress: quality,
          format: ImageManipulator.SaveFormat.JPEG,
        }
      );

      let compressedSize = 0;
      try {
        const info = await FileSystem.getInfoAsync(result.uri, { size: true });
        compressedSize = info.exists ? (info as any).size ?? 0 : 0;
      } catch (_) {}

      setCompressed({ uri: result.uri, fileSize: compressedSize });

      await addToHistory({
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        originalUri: selected.uri,
        compressedUri: result.uri,
        originalSize: selected.fileSize,
        compressedSize,
        quality,
        savedAt: Date.now(),
        fileName: selected.fileName,
      });

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      console.error("Compression error", e);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsCompressing(false);
    }
  };

  const saveToGallery = async () => {
    if (!compressed) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsSaving(true);
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== "granted") {
        setIsSaving(false);
        return;
      }
      await MediaLibrary.saveToLibraryAsync(compressed.uri);
      setSaveSuccess(true);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      console.error("Save error", e);
    } finally {
      setIsSaving(false);
    }
  };

  const share = async () => {
    if (!compressed) return;
    await Haptics.selectionAsync();
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(compressed.uri, {
        mimeType: "image/jpeg",
        dialogTitle: "Sıkıştırılmış fotoğrafı paylaş",
      });
    }
  };

  const qualitySteps = [0.5, 0.65, 0.75, 0.85, 0.95];
  const qualityLabels: Record<number, string> = {
    0.5: "Küçük",
    0.65: "Düşük",
    0.75: "Orta",
    0.85: "Yüksek",
    0.95: "Çok Yüksek",
  };

  const estimatedSize = selected
    ? Math.round(selected.fileSize * quality * 0.8)
    : 0;

  const savings = compressed
    ? savingsPercent(selected?.fileSize ?? 0, compressed.fileSize)
    : selected
    ? savingsPercent(selected.fileSize, estimatedSize)
    : 0;

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : 0;

  return (
    <View style={[styles.container, { backgroundColor: Colors.light.cream }]}>
      <LinearGradient
        colors={["#FFF4F0", "#FFE8F5", "#EEE6FF"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: topInset + 16, paddingBottom: bottomInset + 100 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Fotoğraf Sıkıştırıcı</Text>
          <Text style={styles.headerSubtitle}>
            Kalite kaybetmeden dosya küçültün
          </Text>
        </View>

        {/* Pick Photo Card */}
        <Animated.View style={[{ transform: [{ scale: scaleAnim }] }]}>
          <Pressable
            onPress={pickImage}
            onPressIn={animatePressIn}
            onPressOut={animatePressOut}
          >
            <ClayCard
              style={[
                styles.pickCard,
                { borderStyle: selected ? "solid" : "dashed" },
              ]}
              color={selected ? Colors.light.card : Colors.light.cream}
            >
              {selected ? (
                <View style={styles.imagePreviewContainer}>
                  <Image
                    source={{ uri: selected.uri }}
                    style={styles.previewImage}
                    resizeMode="cover"
                  />
                  <View style={styles.imageOverlay}>
                    <View style={styles.imageBadge}>
                      <Ionicons name="images" size={14} color={Colors.light.coral} />
                      <Text style={styles.imageBadgeText}>
                        {formatBytes(selected.fileSize)}
                      </Text>
                    </View>
                  </View>
                  <Pressable style={styles.changeBtn} onPress={pickImage}>
                    <Ionicons name="sync" size={16} color="#fff" />
                    <Text style={styles.changeBtnText}>Değiştir</Text>
                  </Pressable>
                </View>
              ) : (
                <View style={styles.emptyPick}>
                  <View style={styles.iconCircle}>
                    <Ionicons name="images-outline" size={40} color={Colors.light.coral} />
                  </View>
                  <Text style={styles.emptyTitle}>Fotoğraf Seç</Text>
                  <Text style={styles.emptySubtitle}>
                    Galeriden bir fotoğraf seçmek için dokun
                  </Text>
                </View>
              )}
            </ClayCard>
          </Pressable>
        </Animated.View>

        {selected && (
          <>
            {/* Quality Selector */}
            <ClayCard style={styles.qualityCard}>
              <View style={styles.qualityHeader}>
                <View style={styles.qualityTitleRow}>
                  <Ionicons name="sparkles" size={18} color={Colors.light.lavender} />
                  <Text style={styles.qualityTitle}>Kalite Seviyesi</Text>
                </View>
                <View style={[styles.qualityBadge, { backgroundColor: Colors.light.lavenderLight }]}>
                  <Text style={[styles.qualityBadgeText, { color: "#7B4CCC" }]}>
                    {qualityLabels[quality]}
                  </Text>
                </View>
              </View>

              <View style={styles.qualitySteps}>
                {qualitySteps.map((q) => (
                  <Pressable
                    key={q}
                    onPress={() => {
                      setQuality(q);
                      setCompressed(null);
                      setSaveSuccess(false);
                      Haptics.selectionAsync();
                    }}
                    style={[
                      styles.qualityStep,
                      quality === q && styles.qualityStepActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.qualityStepLabel,
                        quality === q && styles.qualityStepLabelActive,
                      ]}
                    >
                      {qualityLabels[q]}
                    </Text>
                    <View
                      style={[
                        styles.qualityDot,
                        quality === q && { backgroundColor: Colors.light.coral },
                      ]}
                    />
                  </Pressable>
                ))}
              </View>

              <View style={styles.estimateRow}>
                <View style={styles.estimateItem}>
                  <Text style={styles.estimateLabel}>Orijinal</Text>
                  <Text style={styles.estimateValue}>
                    {formatBytes(selected.fileSize)}
                  </Text>
                </View>
                <Ionicons name="arrow-forward" size={16} color={Colors.light.textMuted} />
                <View style={styles.estimateItem}>
                  <Text style={styles.estimateLabel}>
                    {compressed ? "Sıkıştırılmış" : "Tahmini"}
                  </Text>
                  <Text style={[styles.estimateValue, { color: Colors.light.coral }]}>
                    {compressed
                      ? formatBytes(compressed.fileSize)
                      : `~${formatBytes(estimatedSize)}`}
                  </Text>
                </View>
                {savings > 0 && (
                  <View style={[styles.savingsBadge, { backgroundColor: Colors.light.mintLight }]}>
                    <Text style={[styles.savingsText, { color: "#1A8C6A" }]}>
                      -{savings}%
                    </Text>
                  </View>
                )}
              </View>
            </ClayCard>

            {/* Compress Button */}
            <Pressable
              onPress={compress}
              disabled={isCompressing}
              style={({ pressed }) => [{ opacity: pressed || isCompressing ? 0.85 : 1 }]}
            >
              <LinearGradient
                colors={[Colors.light.coral, Colors.light.peach]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.compressBtn}
              >
                {isCompressing ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Ionicons name="flash" size={22} color="#fff" />
                )}
                <Text style={styles.compressBtnText}>
                  {isCompressing ? "Sıkıştırılıyor..." : "Sıkıştır"}
                </Text>
              </LinearGradient>
            </Pressable>

            {/* Result Card */}
            {compressed && (
              <ClayCard
                style={styles.resultCard}
                color={Colors.light.card}
                elevated
              >
                <View style={styles.resultHeader}>
                  <View style={[styles.resultIconCircle, { backgroundColor: Colors.light.mintLight }]}>
                    <Ionicons name="checkmark-circle" size={24} color="#1A8C6A" />
                  </View>
                  <View style={styles.resultTextBlock}>
                    <Text style={styles.resultTitle}>Harika! Sıkıştırıldı</Text>
                    <Text style={styles.resultSubtitle}>
                      %{savings} daha küçük •{" "}
                      {formatBytes(selected.fileSize - compressed.fileSize)} kazanıldı
                    </Text>
                  </View>
                </View>

                <Image
                  source={{ uri: compressed.uri }}
                  style={styles.resultImage}
                  resizeMode="cover"
                />

                <View style={styles.actionRow}>
                  <Pressable
                    onPress={saveToGallery}
                    disabled={isSaving || saveSuccess}
                    style={[
                      styles.actionBtn,
                      {
                        backgroundColor: saveSuccess
                          ? Colors.light.mintLight
                          : Colors.light.lavenderLight,
                        flex: 1,
                      },
                    ]}
                  >
                    {isSaving ? (
                      <ActivityIndicator size="small" color={Colors.light.lavender} />
                    ) : (
                      <Ionicons
                        name={saveSuccess ? "checkmark" : "download-outline"}
                        size={20}
                        color={saveSuccess ? "#1A8C6A" : "#7B4CCC"}
                      />
                    )}
                    <Text
                      style={[
                        styles.actionBtnText,
                        {
                          color: saveSuccess ? "#1A8C6A" : "#7B4CCC",
                        },
                      ]}
                    >
                      {saveSuccess ? "Kaydedildi!" : "Kaydet"}
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={share}
                    style={[
                      styles.actionBtn,
                      {
                        backgroundColor: Colors.light.peachLight,
                        flex: 1,
                      },
                    ]}
                  >
                    <Ionicons name="share-outline" size={20} color="#C77B00" />
                    <Text style={[styles.actionBtnText, { color: "#C77B00" }]}>
                      Paylaş
                    </Text>
                  </Pressable>
                </View>
              </ClayCard>
            )}
          </>
        )}

        {/* Stats hint when no photo */}
        {!selected && (
          <View style={styles.featureRow}>
            {[
              { icon: "flash", color: Colors.light.coral, label: "Hızlı" },
              { icon: "shield-checkmark", color: Colors.light.lavender, label: "Güvenli" },
              { icon: "leaf", color: Colors.light.mint, label: "Kaliteli" },
            ].map((f) => (
              <ClayCard key={f.label} style={styles.featureCard} color={Colors.light.card}>
                <View
                  style={[
                    styles.featureIcon,
                    { backgroundColor: f.color + "22" },
                  ]}
                >
                  <Ionicons name={f.icon as any} size={24} color={f.color} />
                </View>
                <Text style={styles.featureLabel}>{f.label}</Text>
              </ClayCard>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    paddingHorizontal: 20,
    gap: 16,
  },
  header: {
    marginBottom: 4,
  },
  headerTitle: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    color: Colors.light.textPrimary,
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textSecondary,
    marginTop: 4,
  },
  pickCard: {
    borderWidth: 2,
    borderColor: "rgba(201, 168, 255, 0.4)",
    padding: 0,
    overflow: "hidden",
    minHeight: 200,
  },
  emptyPick: {
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
    gap: 12,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.light.coral + "15",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.textPrimary,
  },
  emptySubtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textSecondary,
    textAlign: "center",
  },
  imagePreviewContainer: {
    width: "100%",
    height: 220,
    position: "relative",
  },
  previewImage: {
    width: "100%",
    height: "100%",
  },
  imageOverlay: {
    position: "absolute",
    top: 12,
    left: 12,
  },
  imageBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.92)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  imageBadgeText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.textPrimary,
  },
  changeBtn: {
    position: "absolute",
    bottom: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.light.coral,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    shadowColor: Colors.light.coral,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 4,
  },
  changeBtnText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  qualityCard: {
    gap: 16,
  },
  qualityHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  qualityTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  qualityTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.textPrimary,
  },
  qualityBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  qualityBadgeText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  qualitySteps: {
    flexDirection: "row",
    gap: 8,
  },
  qualityStep: {
    flex: 1,
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 16,
    backgroundColor: Colors.light.creamDark,
  },
  qualityStepActive: {
    backgroundColor: Colors.light.coral + "15",
  },
  qualityStepLabel: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
    color: Colors.light.textSecondary,
    textAlign: "center",
  },
  qualityStepLabelActive: {
    color: Colors.light.coral,
    fontFamily: "Inter_600SemiBold",
  },
  qualityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.light.textMuted,
  },
  estimateRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.light.creamDark,
    borderRadius: 16,
    padding: 14,
    gap: 8,
  },
  estimateItem: {
    alignItems: "center",
    flex: 1,
  },
  estimateLabel: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textSecondary,
  },
  estimateValue: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: Colors.light.textPrimary,
    marginTop: 2,
  },
  savingsBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  savingsText: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  compressBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 18,
    borderRadius: 24,
    shadowColor: Colors.light.coral,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  compressBtnText: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    letterSpacing: 0.3,
  },
  resultCard: {
    gap: 16,
    padding: 16,
  },
  resultHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  resultIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  resultTextBlock: {
    flex: 1,
  },
  resultTitle: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: Colors.light.textPrimary,
  },
  resultSubtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  resultImage: {
    width: "100%",
    height: 180,
    borderRadius: 16,
  },
  actionRow: {
    flexDirection: "row",
    gap: 12,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 18,
  },
  actionBtnText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  featureRow: {
    flexDirection: "row",
    gap: 12,
  },
  featureCard: {
    flex: 1,
    alignItems: "center",
    gap: 10,
    padding: 16,
  },
  featureIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  featureLabel: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.textSecondary,
  },
});
