import Slider from "@react-native-community/slider";
import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system";
import * as Haptics from "expo-haptics";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import * as MediaLibrary from "expo-media-library";
import * as Sharing from "expo-sharing";
import { LinearGradient } from "expo-linear-gradient";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
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

type PhotoResult = {
  photo: SelectedPhoto;
  compressed: CompressResult | null;
  saved: boolean;
};

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "Bilinmiyor";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function savingsPercent(original: number, compressed: number): number {
  if (!original || !compressed) return 0;
  return Math.max(0, Math.round(((original - compressed) / original) * 100));
}

function qualityLabel(q: number): string {
  if (q < 0.65) return "Küçük";
  if (q < 0.75) return "Düşük";
  if (q < 0.82) return "Orta";
  if (q < 0.9) return "Yüksek";
  return "Çok Yüksek";
}

export default function CompressScreen() {
  const insets = useSafeAreaInsets();
  const { addToHistory } = useCompression();

  const [photos, setPhotos] = useState<PhotoResult[]>([]);
  const [quality, setQuality] = useState(0.75);
  const [isCompressing, setIsCompressing] = useState(false);
  const [isSavingAll, setIsSavingAll] = useState(false);
  const [allSaved, setAllSaved] = useState(false);

  const scaleAnim = React.useRef(new Animated.Value(1)).current;

  const animatePressIn = () => {
    Animated.spring(scaleAnim, { toValue: 0.96, useNativeDriver: true, speed: 50 }).start();
  };
  const animatePressOut = () => {
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 30 }).start();
  };

  const pickImages = async () => {
    await Haptics.selectionAsync();
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      quality: 1,
    });

    if (!result.canceled && result.assets.length > 0) {
      const newPhotos: PhotoResult[] = await Promise.all(
        result.assets.map(async (asset) => {
          let fileSize = asset.fileSize ?? 0;
          if (!fileSize && asset.uri) {
            try {
              const info = await FileSystem.getInfoAsync(asset.uri);
              if (info.exists && info.size !== undefined) {
                fileSize = info.size;
              }
            } catch (_) {}
          }
          return {
            photo: {
              uri: asset.uri,
              width: asset.width ?? 0,
              height: asset.height ?? 0,
              fileSize,
              fileName: asset.fileName ?? `photo_${Date.now()}.jpg`,
            },
            compressed: null,
            saved: false,
          };
        })
      );
      setPhotos(newPhotos);
      setAllSaved(false);
    }
  };

  const compressAll = async () => {
    if (photos.length === 0) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsCompressing(true);
    setAllSaved(false);

    const updated: PhotoResult[] = [...photos];
    for (let i = 0; i < photos.length; i++) {
      const p = photos[i];
      try {
        const result = await ImageManipulator.manipulateAsync(
          p.photo.uri,
          [],
          { compress: quality, format: ImageManipulator.SaveFormat.JPEG }
        );

        let compressedSize = 0;
        try {
          const info = await FileSystem.getInfoAsync(result.uri);
          if (info.exists && info.size !== undefined) {
            compressedSize = info.size;
          }
        } catch (_) {}

        updated[i] = { ...p, compressed: { uri: result.uri, fileSize: compressedSize } };

        await addToHistory({
          id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
          originalUri: p.photo.uri,
          compressedUri: result.uri,
          originalSize: p.photo.fileSize,
          compressedSize,
          quality,
          savedAt: Date.now(),
          fileName: p.photo.fileName,
        });
      } catch (e) {
        console.error("Compression error for photo", i, e);
      }
    }
    setPhotos(updated);
    setIsCompressing(false);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const saveAll = async () => {
    if (photos.every((p) => p.compressed === null)) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsSavingAll(true);
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== "granted") {
        setIsSavingAll(false);
        Alert.alert(
          "İzin Gerekli",
          "Fotoğrafları galeriye kaydetmek için lütfen ayarlardan galeri iznini etkinleştirin.",
          [{ text: "Tamam" }]
        );
        return;
      }
      for (const p of photos) {
        if (p.compressed) {
          await MediaLibrary.saveToLibraryAsync(p.compressed.uri);
        }
      }
      setPhotos((prev) => prev.map((p) => ({ ...p, saved: true })));
      setAllSaved(true);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      console.error("Save all error", e);
    } finally {
      setIsSavingAll(false);
    }
  };

  const sharePhoto = async (uri: string) => {
    await Haptics.selectionAsync();
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(uri, {
        mimeType: "image/jpeg",
        dialogTitle: "Sıkıştırılmış fotoğrafı paylaş",
      });
    }
  };

  const hasCompressed = photos.some((p) => p.compressed !== null);
  const allCompressed = photos.length > 0 && photos.every((p) => p.compressed !== null);

  const totalOriginal = photos.reduce((s, p) => s + p.photo.fileSize, 0);
  const totalCompressed = photos.reduce((s, p) => s + (p.compressed?.fileSize ?? 0), 0);
  const overallSavings = hasCompressed ? savingsPercent(totalOriginal, totalCompressed) : 0;

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : 0;

  return (
    <View style={styles.container}>
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
          <Text style={styles.headerSubtitle}>Kalite kaybetmeden dosya küçültün</Text>
        </View>

        {/* Pick Photo Card */}
        <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
          <Pressable onPress={pickImages} onPressIn={animatePressIn} onPressOut={animatePressOut}>
            <ClayCard style={[styles.pickCard, { borderStyle: photos.length > 0 ? "solid" : "dashed" }]}>
              {photos.length > 0 ? (
                <View style={styles.selectedHeader}>
                  <View style={styles.selectedBadge}>
                    <Ionicons name="images" size={14} color={Colors.light.coral} />
                    <Text style={styles.selectedBadgeText}>
                      {photos.length} fotoğraf seçildi
                    </Text>
                  </View>
                  <Pressable onPress={pickImages} style={styles.changeBtn}>
                    <Ionicons name="sync" size={14} color="#fff" />
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
                    Birden fazla fotoğraf seçebilirsiniz
                  </Text>
                </View>
              )}
            </ClayCard>
          </Pressable>
        </Animated.View>

        {/* Photo Grid */}
        {photos.length > 0 && (
          <View style={styles.photoGrid}>
            {photos.map((item, idx) => {
              const savings = item.compressed
                ? savingsPercent(item.photo.fileSize, item.compressed.fileSize)
                : 0;
              return (
                <View key={idx} style={styles.photoGridItem}>
                  <Image
                    source={{ uri: item.compressed?.uri ?? item.photo.uri }}
                    style={styles.gridImage}
                    resizeMode="cover"
                  />
                  {item.compressed && (
                    <View style={styles.gridSavingsBadge}>
                      <Text style={styles.gridSavingsText}>-{savings}%</Text>
                    </View>
                  )}
                  <View style={styles.gridSizeRow}>
                    <Text style={styles.gridSizeText}>
                      {formatBytes(item.compressed?.fileSize ?? item.photo.fileSize)}
                    </Text>
                    {item.compressed && (
                      <Pressable onPress={() => sharePhoto(item.compressed!.uri)} hitSlop={6}>
                        <Ionicons name="share-outline" size={14} color={Colors.light.coral} />
                      </Pressable>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {photos.length > 0 && (
          <>
            {/* Quality Slider Card */}
            <ClayCard style={styles.qualityCard}>
              <View style={styles.qualityHeader}>
                <View style={styles.qualityTitleRow}>
                  <Ionicons name="sparkles" size={18} color={Colors.light.lavender} />
                  <Text style={styles.qualityTitle}>Kalite Seviyesi</Text>
                </View>
                <View style={[styles.qualityBadge, { backgroundColor: Colors.light.lavenderLight }]}>
                  <Text style={[styles.qualityBadgeText, { color: "#7B4CCC" }]}>
                    {qualityLabel(quality)} · %{Math.round(quality * 100)}
                  </Text>
                </View>
              </View>

              <Slider
                style={styles.slider}
                minimumValue={0.6}
                maximumValue={0.95}
                step={0.01}
                value={quality}
                onValueChange={(val) => {
                  setQuality(val);
                }}
                onSlidingComplete={() => Haptics.selectionAsync()}
                minimumTrackTintColor={Colors.light.coral}
                maximumTrackTintColor={Colors.light.creamDark}
                thumbTintColor={Colors.light.coral}
              />

              <View style={styles.sliderLabels}>
                <Text style={styles.sliderLabel}>Küçük · %60</Text>
                <Text style={styles.sliderLabel}>Yüksek · %95</Text>
              </View>

              {/* Size summary */}
              <View style={styles.estimateRow}>
                <View style={styles.estimateItem}>
                  <Text style={styles.estimateLabel}>Toplam Orijinal</Text>
                  <Text style={styles.estimateValue}>{formatBytes(totalOriginal)}</Text>
                </View>
                <Ionicons name="arrow-forward" size={16} color={Colors.light.textMuted} />
                <View style={styles.estimateItem}>
                  <Text style={styles.estimateLabel}>
                    {hasCompressed ? "Sıkıştırılmış" : "Tahmini"}
                  </Text>
                  <Text style={[styles.estimateValue, { color: Colors.light.coral }]}>
                    {hasCompressed
                      ? formatBytes(totalCompressed)
                      : `~${formatBytes(Math.round(totalOriginal * quality * 0.8))}`}
                  </Text>
                </View>
                {overallSavings > 0 && (
                  <View style={[styles.savingsBadge, { backgroundColor: Colors.light.mintLight }]}>
                    <Text style={[styles.savingsText, { color: "#1A8C6A" }]}>
                      -{overallSavings}%
                    </Text>
                  </View>
                )}
              </View>
            </ClayCard>

            {/* Compress Button */}
            <Pressable
              onPress={compressAll}
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
                  {isCompressing
                    ? "Sıkıştırılıyor..."
                    : `${photos.length} Fotoğrafı Sıkıştır`}
                </Text>
              </LinearGradient>
            </Pressable>

            {/* Save All */}
            {allCompressed && (
              <ClayCard style={styles.resultSummary} color={Colors.light.card} elevated>
                <View style={styles.resultSummaryHeader}>
                  <View style={[styles.resultIconCircle, { backgroundColor: Colors.light.mintLight }]}>
                    <Ionicons name="checkmark-circle" size={24} color="#1A8C6A" />
                  </View>
                  <View style={styles.resultTextBlock}>
                    <Text style={styles.resultTitle}>
                      {photos.length} fotoğraf sıkıştırıldı!
                    </Text>
                    <Text style={styles.resultSubtitle}>
                      Toplam %{overallSavings} küçüldü ·{" "}
                      {formatBytes(totalOriginal - totalCompressed)} kazanıldı
                    </Text>
                  </View>
                </View>

                <Pressable
                  onPress={saveAll}
                  disabled={isSavingAll || allSaved}
                  style={[
                    styles.saveAllBtn,
                    {
                      backgroundColor: allSaved
                        ? Colors.light.mintLight
                        : Colors.light.lavenderLight,
                    },
                  ]}
                >
                  {isSavingAll ? (
                    <ActivityIndicator size="small" color={Colors.light.lavender} />
                  ) : (
                    <Ionicons
                      name={allSaved ? "checkmark" : "download-outline"}
                      size={20}
                      color={allSaved ? "#1A8C6A" : "#7B4CCC"}
                    />
                  )}
                  <Text
                    style={[
                      styles.saveAllBtnText,
                      { color: allSaved ? "#1A8C6A" : "#7B4CCC" },
                    ]}
                  >
                    {allSaved ? "Galeriye Kaydedildi!" : "Tümünü Galeriye Kaydet"}
                  </Text>
                </Pressable>
              </ClayCard>
            )}
          </>
        )}

        {/* Feature pills when empty */}
        {photos.length === 0 && (
          <View style={styles.featureRow}>
            {[
              { icon: "flash" as const, color: Colors.light.coral, label: "Hızlı" },
              { icon: "shield-checkmark" as const, color: Colors.light.lavender, label: "Güvenli" },
              { icon: "leaf" as const, color: Colors.light.mint, label: "Kaliteli" },
            ].map((f) => (
              <ClayCard key={f.label} style={styles.featureCard} color={Colors.light.card}>
                <View style={[styles.featureIcon, { backgroundColor: f.color + "22" }]}>
                  <Ionicons name={f.icon} size={24} color={f.color} />
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

const GRID_ITEM_SIZE = (SCREEN_W - 40 - 12 * 2) / 3;

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
    minHeight: 100,
  },
  selectedHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
  },
  selectedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.light.coral + "15",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  selectedBadgeText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.coral,
  },
  changeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.light.coral,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  changeBtnText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  emptyPick: {
    alignItems: "center",
    justifyContent: "center",
    padding: 36,
    gap: 12,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
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
  photoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  photoGridItem: {
    width: GRID_ITEM_SIZE,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: Colors.light.creamDark,
  },
  gridImage: {
    width: "100%",
    height: GRID_ITEM_SIZE,
  },
  gridSavingsBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    backgroundColor: Colors.light.mint,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  gridSavingsText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    color: "#1A8C6A",
  },
  gridSizeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 6,
  },
  gridSizeText: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
    color: Colors.light.textSecondary,
  },
  qualityCard: {
    gap: 12,
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
  slider: {
    width: "100%",
    height: 40,
  },
  sliderLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: -4,
  },
  sliderLabel: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textMuted,
  },
  estimateRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.light.creamDark,
    borderRadius: 16,
    padding: 14,
    gap: 8,
    marginTop: 4,
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
    fontSize: 14,
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
  },
  compressBtnText: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    letterSpacing: 0.3,
  },
  resultSummary: {
    gap: 14,
    padding: 16,
  },
  resultSummaryHeader: {
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
  saveAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 14,
    borderRadius: 18,
  },
  saveAllBtnText: {
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
