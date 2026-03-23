import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system";
import * as Haptics from "expo-haptics";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import * as MediaLibrary from "expo-media-library";
import * as Sharing from "expo-sharing";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useState } from "react";
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
import { ComparisonModal } from "@/components/ComparisonModal";
import Colors from "@/constants/colors";
import { useCompression } from "@/context/CompressionContext";

const { width: SCREEN_W } = Dimensions.get("window");

type Level = "low" | "medium" | "high" | "smart";
type OutputFormat = "jpeg" | "png" | "webp";

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
  format: OutputFormat;
  winnerLabel?: string;
};

type PhotoResult = {
  photo: SelectedPhoto;
  compressed: CompressResult | null;
  saved: boolean;
};

const SMART_COLOR = "#7C4DFF";

const LEVEL_CONFIG: Record<Level, { label: string; desc: string; color: string; bg: string }> = {
  low: {
    label: "Düşük",
    desc: "~%40-55 küçültme",
    color: Colors.light.coral,
    bg: Colors.light.coral + "18",
  },
  medium: {
    label: "Orta",
    desc: "~%25-40 küçültme",
    color: Colors.light.lavender,
    bg: Colors.light.lavender + "22",
  },
  high: {
    label: "Yüksek",
    desc: "~%15-25 küçültme",
    color: Colors.light.mint,
    bg: Colors.light.mint + "28",
  },
  smart: {
    label: "Akıllı",
    desc: "~%20-45 küçültme",
    color: SMART_COLOR,
    bg: SMART_COLOR + "18",
  },
};

const FORMAT_CONFIG: Record<OutputFormat, { label: string; desc: string }> = {
  jpeg: { label: "JPEG", desc: "Fotoğraf" },
  png: { label: "PNG", desc: "Kayıpsız" },
  webp: { label: "WEBP", desc: "Modern" },
};

function getCompressionSettings(level: Exclude<Level, "smart">, format: OutputFormat): {
  saveFormat: ImageManipulator.SaveFormat;
  compress: number;
  actualFormat: OutputFormat;
} {
  if (level === "high") {
    if (format === "png") {
      return { saveFormat: ImageManipulator.SaveFormat.PNG, compress: 0.92, actualFormat: "png" };
    }
    return { saveFormat: ImageManipulator.SaveFormat.WEBP, compress: 0.92, actualFormat: "webp" };
  }
  if (level === "medium") {
    return { saveFormat: ImageManipulator.SaveFormat.WEBP, compress: 0.80, actualFormat: "webp" };
  }
  const fmtMap: Record<OutputFormat, ImageManipulator.SaveFormat> = {
    jpeg: ImageManipulator.SaveFormat.JPEG,
    png: ImageManipulator.SaveFormat.PNG,
    webp: ImageManipulator.SaveFormat.WEBP,
  };
  return { saveFormat: fmtMap[format], compress: 0.60, actualFormat: format };
}

async function smartCompress(
  uri: string,
  width: number,
  originalSize: number
): Promise<{ uri: string; fileSize: number; format: OutputFormat; winnerLabel: string; qualityUsed: number }> {
  const actions: ImageManipulator.Action[] =
    width > 3000 ? [{ resize: { width: 2048 } }] : [];

  const [jpegResult, webpResult] = await Promise.all([
    ImageManipulator.manipulateAsync(uri, actions, {
      compress: 0.88,
      format: ImageManipulator.SaveFormat.JPEG,
    }),
    ImageManipulator.manipulateAsync(uri, actions, {
      compress: 0.88,
      format: ImageManipulator.SaveFormat.WEBP,
    }),
  ]);

  const [jpegSize, webpSize] = await Promise.all([
    getFileSize(jpegResult.uri),
    getFileSize(webpResult.uri),
  ]);

  let winner: { uri: string; fileSize: number; format: OutputFormat };
  if (jpegSize > 0 && webpSize > 0) {
    winner = jpegSize < webpSize
      ? { uri: jpegResult.uri, fileSize: jpegSize, format: "jpeg" }
      : { uri: webpResult.uri, fileSize: webpSize, format: "webp" };
  } else if (jpegSize > 0) {
    winner = { uri: jpegResult.uri, fileSize: jpegSize, format: "jpeg" };
  } else {
    winner = { uri: webpResult.uri, fileSize: webpSize, format: "webp" };
  }

  let qualityUsed = 0.88;
  if (originalSize > 0 && winner.fileSize >= originalSize) {
    const fallback = await ImageManipulator.manipulateAsync(uri, actions, {
      compress: 0.80,
      format: ImageManipulator.SaveFormat.JPEG,
    });
    const fallbackSize = await getFileSize(fallback.uri);
    if (fallbackSize > 0 && fallbackSize < winner.fileSize) {
      winner = { uri: fallback.uri, fileSize: fallbackSize, format: "jpeg" };
      qualityUsed = 0.80;
    }
  }

  const savings = originalSize > 0
    ? Math.max(0, Math.round(((originalSize - winner.fileSize) / originalSize) * 100))
    : 0;
  const winnerLabel = `Kazanan: ${winner.format.toUpperCase()} · %${savings} küçültüldü`;

  return { ...winner, winnerLabel, qualityUsed };
}

const MIME_TYPES: Record<OutputFormat, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

const ESTIMATE_FACTORS: Record<Level, number> = {
  low: 0.45,
  medium: 0.60,
  high: 0.75,
  smart: 0.55,
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

async function getFileSize(uri: string): Promise<number> {
  if (Platform.OS === "web") {
    try {
      const response = await fetch(uri);
      const blob = await response.blob();
      return blob.size;
    } catch (_) {
      return 0;
    }
  }
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists && info.size !== undefined) {
      return info.size;
    }
  } catch (_) {}
  return 0;
}

export default function CompressScreen() {
  const insets = useSafeAreaInsets();
  const { addToHistory, pendingRecompress, setPendingRecompress } = useCompression();

  const [photos, setPhotos] = useState<PhotoResult[]>([]);
  const [level, setLevel] = useState<Level>("medium");
  const [format, setFormat] = useState<OutputFormat>("jpeg");
  const [isCompressing, setIsCompressing] = useState(false);
  const [compressingIdx, setCompressingIdx] = useState<number | null>(null);
  const [selectedComparison, setSelectedComparison] = useState<number | null>(null);
  const [isSavingAll, setIsSavingAll] = useState(false);
  const [allSaved, setAllSaved] = useState(false);

  const scaleAnim = React.useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!pendingRecompress) return;
    const load = async () => {
      const { originalUri, format: pendingFormat, level: pendingLevel, fileName, originalSize } = pendingRecompress;
      const safeFormat: OutputFormat =
        pendingFormat === "png" ? "png" : pendingFormat === "webp" ? "webp" : "jpeg";
      const safeLevel: Level =
        pendingLevel === "low" ? "low"
        : pendingLevel === "high" ? "high"
        : pendingLevel === "smart" ? "smart"
        : "medium";
      setFormat(safeFormat);
      setLevel(safeLevel);
      setPhotos([{
        photo: {
          uri: originalUri,
          width: 0,
          height: 0,
          fileSize: originalSize,
          fileName,
        },
        compressed: null,
        saved: false,
      }]);
      setAllSaved(false);
      setPendingRecompress(null);
    };
    load();
  }, [pendingRecompress]);

  const animatePressIn = () => {
    Animated.spring(scaleAnim, { toValue: 0.96, useNativeDriver: true, speed: 50 }).start();
  };
  const animatePressOut = () => {
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 30 }).start();
  };

  const handleFormatChange = (f: OutputFormat) => {
    setFormat(f);
    if (f === "png") {
      setLevel("high");
    }
    Haptics.selectionAsync();
  };

  const handleLevelChange = (l: Level) => {
    setLevel(l);
    if (l !== "high" && format === "png") {
      setFormat("jpeg");
    }
    Haptics.selectionAsync();
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
            fileSize = await getFileSize(asset.uri);
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

  const addMoreImages = async () => {
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
            fileSize = await getFileSize(asset.uri);
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
      setPhotos((prev) => [...prev, ...newPhotos]);
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
      setCompressingIdx(i);
      try {
        let compressedResult: CompressResult;
        let qualityUsed: number;

        if (level === "smart") {
          const smart = await smartCompress(p.photo.uri, p.photo.width, p.photo.fileSize);
          compressedResult = { uri: smart.uri, fileSize: smart.fileSize, format: smart.format, winnerLabel: smart.winnerLabel };
          qualityUsed = smart.qualityUsed;
        } else {
          const { saveFormat, compress, actualFormat } = getCompressionSettings(level, format);
          const result = await ImageManipulator.manipulateAsync(
            p.photo.uri,
            [],
            { compress, format: saveFormat }
          );
          const compressedSize = await getFileSize(result.uri);
          compressedResult = { uri: result.uri, fileSize: compressedSize, format: actualFormat };
          qualityUsed = compress;
        }

        updated[i] = { ...p, compressed: compressedResult };
        setPhotos([...updated]);

        await addToHistory({
          id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
          originalUri: p.photo.uri,
          compressedUri: compressedResult.uri,
          originalSize: p.photo.fileSize,
          compressedSize: compressedResult.fileSize,
          quality: qualityUsed,
          savedAt: Date.now(),
          fileName: p.photo.fileName,
          format: compressedResult.format,
          level,
        });
      } catch (e) {
        console.error("Compression error for photo", i, e);
      }
    }
    setCompressingIdx(null);
    setIsCompressing(false);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const saveAll = async () => {
    if (photos.every((p) => p.compressed === null)) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsSavingAll(true);
    try {
      if (Platform.OS === "web") {
        for (const p of photos) {
          if (p.compressed) {
            const ext = p.compressed.format === "png" ? "png" : p.compressed.format === "webp" ? "webp" : "jpg";
            const baseName = p.photo.fileName.replace(/\.[^.]+$/, "");
            const a = document.createElement("a");
            a.href = p.compressed.uri;
            a.download = `compressed_${baseName}.${ext}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
          }
        }
      } else {
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

  const sharePhoto = async (uri: string, photoFormat: OutputFormat) => {
    await Haptics.selectionAsync();
    if (Platform.OS === "web") {
      const ext = photoFormat === "png" ? "png" : photoFormat === "webp" ? "webp" : "jpg";
      const a = document.createElement("a");
      a.href = uri;
      a.download = `compressed.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(uri, {
        mimeType: MIME_TYPES[photoFormat],
        dialogTitle: "Sıkıştırılmış fotoğrafı paylaş",
      });
    }
  };

  const hasCompressed = photos.some((p) => p.compressed !== null);
  const allCompressed = photos.length > 0 && photos.every((p) => p.compressed !== null);

  const totalOriginal = photos.reduce((s, p) => s + p.photo.fileSize, 0);
  const totalCompressed = photos.reduce((s, p) => s + (p.compressed?.fileSize ?? 0), 0);
  const overallSavings = hasCompressed ? savingsPercent(totalOriginal, totalCompressed) : 0;
  const estimatedSize = Math.round(totalOriginal * ESTIMATE_FACTORS[level]);

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : 0;

  const willUseFormat: OutputFormat = level === "smart"
    ? "webp"
    : getCompressionSettings(level, format).actualFormat;

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
                  {/* Image area — tap opens comparison for compressed photos */}
                  <Pressable
                    style={styles.gridImageArea}
                    onPress={() => item.compressed && setSelectedComparison(idx)}
                  >
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
                    {isCompressing && compressingIdx === idx && !item.compressed && (
                      <View style={styles.analyzingOverlay}>
                        <Ionicons name="sparkles" size={14} color="#fff" />
                        <Text style={styles.analyzingText}>Analiz ediliyor…</Text>
                      </View>
                    )}
                    {item.compressed?.winnerLabel && (
                      <View style={[styles.gridSavingsBadge, { bottom: "auto", top: 6, left: 6, right: "auto", backgroundColor: SMART_COLOR }]}>
                        <Text style={[styles.gridSavingsText, { fontSize: 9 }]}>
                          {item.compressed.format.toUpperCase()}
                        </Text>
                      </View>
                    )}
                    {item.compressed && (
                      <View style={styles.compareTip} pointerEvents="none">
                        <Ionicons name="eye-outline" size={10} color={Colors.light.coral} />
                      </View>
                    )}
                  </Pressable>

                  {/* Size row with share — outside image Pressable to avoid nesting */}
                  <View style={styles.gridSizeRow}>
                    <Text style={styles.gridSizeText}>
                      {formatBytes(item.compressed?.fileSize ?? item.photo.fileSize)}
                    </Text>
                    {item.compressed && (
                      <Pressable
                        onPress={() => sharePhoto(item.compressed!.uri, item.compressed!.format)}
                        hitSlop={6}
                      >
                        <Ionicons name="share-outline" size={14} color={Colors.light.coral} />
                      </Pressable>
                    )}
                  </View>
                  {item.compressed?.winnerLabel && (
                    <View style={styles.winnerLabelRow}>
                      <Ionicons name="sparkles" size={9} color={SMART_COLOR} />
                      <Text style={styles.winnerLabelText} numberOfLines={1}>
                        {item.compressed.winnerLabel}
                      </Text>
                    </View>
                  )}
                </View>
              );
            })}

            {/* Add more photos tile */}
            <Pressable onPress={addMoreImages} style={styles.addMoreTile}>
              <Ionicons name="add" size={32} color={Colors.light.coral} />
              <Text style={styles.addMoreText}>Ekle</Text>
            </Pressable>
          </View>
        )}

        {photos.length > 0 && (
          <>
            {/* Compression Settings Card */}
            <ClayCard style={styles.settingsCard}>
              {/* Level Selector */}
              <View style={styles.sectionHeader}>
                <Ionicons name="sparkles" size={16} color={Colors.light.lavender} />
                <Text style={styles.sectionTitle}>Sıkıştırma Seviyesi</Text>
              </View>
              <View style={styles.pillRow}>
                {(["low", "medium", "high", "smart"] as Level[]).map((l) => {
                  const cfg = LEVEL_CONFIG[l];
                  const active = level === l;
                  const locked = format === "png" && l !== "high";
                  return (
                    <Pressable
                      key={l}
                      onPress={() => !locked && handleLevelChange(l)}
                      style={[
                        styles.levelPill,
                        active
                          ? { backgroundColor: cfg.color, borderColor: cfg.color }
                          : { backgroundColor: cfg.bg, borderColor: cfg.color + "40" },
                        locked && { opacity: 0.35 },
                      ]}
                    >
                      {l === "smart" && (
                        <Ionicons
                          name="sparkles"
                          size={10}
                          color={active ? "#fff" : cfg.color}
                          style={{ marginBottom: 2 }}
                        />
                      )}
                      <Text style={[
                        styles.levelPillLabel,
                        { color: active ? "#fff" : cfg.color },
                      ]}>
                        {cfg.label}
                      </Text>
                      <Text style={[
                        styles.levelPillDesc,
                        { color: active ? "rgba(255,255,255,0.85)" : cfg.color + "BB" },
                      ]}>
                        {locked ? "PNG ile kilitledi" : cfg.desc}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Format Selector */}
              <View style={[styles.sectionHeader, { marginTop: 16 }]}>
                <Ionicons name="document-outline" size={16} color={Colors.light.coral} />
                <Text style={styles.sectionTitle}>Çıktı Formatı</Text>
              </View>
              <View style={[styles.formatRow, level === "smart" && { opacity: 0.35 }]}>
                {(["jpeg", "png", "webp"] as OutputFormat[]).map((f) => {
                  const cfg = FORMAT_CONFIG[f];
                  const active = format === f;
                  return (
                    <Pressable
                      key={f}
                      onPress={() => level !== "smart" && handleFormatChange(f)}
                      style={[
                        styles.formatPill,
                        active
                          ? { backgroundColor: Colors.light.coral, borderColor: Colors.light.coral }
                          : { backgroundColor: Colors.light.creamDark, borderColor: "transparent" },
                      ]}
                    >
                      <Text style={[
                        styles.formatPillLabel,
                        { color: active ? "#fff" : Colors.light.textPrimary },
                      ]}>
                        {cfg.label}
                      </Text>
                      <Text style={[
                        styles.formatPillDesc,
                        { color: active ? "rgba(255,255,255,0.8)" : Colors.light.textMuted },
                      ]}>
                        {cfg.desc}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Note for smart mode */}
              {level === "smart" && (
                <View style={[styles.infoRow, { backgroundColor: SMART_COLOR + "14", borderRadius: 10, padding: 8 }]}>
                  <Ionicons name="sparkles" size={14} color={SMART_COLOR} />
                  <Text style={[styles.infoText, { color: SMART_COLOR }]}>
                    Akıllı mod her fotoğraf için en küçük formatı seçer
                  </Text>
                </View>
              )}

              {/* Note when medium overrides format */}
              {level === "medium" && format !== "webp" && (
                <View style={styles.infoRow}>
                  <Ionicons name="information-circle-outline" size={14} color={Colors.light.textMuted} />
                  <Text style={styles.infoText}>
                    Orta seviyede WEBP kullanılır (en iyi denge)
                  </Text>
                </View>
              )}

              {/* Warning when High + PNG is selected */}
              {level === "high" && format === "png" && (
                <View style={[styles.infoRow, { backgroundColor: Colors.light.peach + "22", borderRadius: 10, padding: 8 }]}>
                  <Ionicons name="warning-outline" size={14} color={Colors.light.peach} />
                  <Text style={[styles.infoText, { color: Colors.light.peach }]}>
                    PNG kayıpsız formattır — fotoğraflar için boyut artabilir
                  </Text>
                </View>
              )}

              {/* Size Summary */}
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
                      : `~${formatBytes(estimatedSize)}`}
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

              {/* Actual format info */}
              {!hasCompressed && (
                <View style={[styles.outputInfo, level === "smart" && { backgroundColor: SMART_COLOR + "14" }]}>
                  <Text style={[styles.outputInfoText, level === "smart" && { color: SMART_COLOR }]}>
                    {level === "smart"
                      ? "JPEG / WEBP · Her fotoğraf için en iyi seçilir"
                      : `Çıktı: ${willUseFormat.toUpperCase()} · ${level === "high" ? "Yüksek kalite, ~%15-25 küçültme" : level === "medium" ? "WEBP ile akıllı sıkıştırma" : "Maksimum küçültme"}`}
                  </Text>
                </View>
              )}
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
                    {allSaved
                      ? "Kaydedildi!"
                      : Platform.OS === "web"
                      ? "Tümünü İndir"
                      : "Tümünü Galeriye Kaydet"}
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

      {selectedComparison !== null && photos[selectedComparison]?.compressed && (
        <ComparisonModal
          visible
          onClose={() => setSelectedComparison(null)}
          originalUri={photos[selectedComparison].photo.uri}
          compressedUri={photos[selectedComparison].compressed!.uri}
          originalSize={photos[selectedComparison].photo.fileSize}
          compressedSize={photos[selectedComparison].compressed!.fileSize}
        />
      )}
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
  gridImageArea: {
    width: GRID_ITEM_SIZE,
    height: GRID_ITEM_SIZE,
    position: "relative",
  },
  compareTip: {
    position: "absolute",
    bottom: 30,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "rgba(255,255,255,0.85)",
    alignItems: "center",
    justifyContent: "center",
  },
  addMoreTile: {
    width: GRID_ITEM_SIZE,
    height: GRID_ITEM_SIZE + 28,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: Colors.light.coral + "55",
    borderStyle: "dashed",
    backgroundColor: Colors.light.coral + "08",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  addMoreText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.coral,
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
  analyzingOverlay: {
    position: "absolute",
    inset: 0,
    backgroundColor: "rgba(124,77,255,0.55)",
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  analyzingText: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    textAlign: "center",
  },
  winnerLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingBottom: 4,
  },
  winnerLabelText: {
    fontSize: 9,
    fontFamily: "Inter_500Medium",
    color: SMART_COLOR,
    flexShrink: 1,
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
  settingsCard: {
    gap: 8,
    paddingBottom: 16,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.textPrimary,
  },
  pillRow: {
    flexDirection: "row",
    gap: 8,
  },
  levelPill: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 16,
    borderWidth: 1.5,
    gap: 2,
  },
  levelPillLabel: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  levelPillDesc: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  formatRow: {
    flexDirection: "row",
    gap: 8,
  },
  formatPill: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1.5,
    gap: 2,
  },
  formatPillLabel: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  formatPillDesc: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 6,
    paddingHorizontal: 2,
  },
  infoText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textMuted,
    flex: 1,
  },
  estimateRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.light.creamDark,
    borderRadius: 16,
    padding: 14,
    gap: 8,
    marginTop: 12,
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
  outputInfo: {
    backgroundColor: Colors.light.lavender + "18",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 6,
  },
  outputInfoText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "#7B4CCC",
    textAlign: "center",
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
