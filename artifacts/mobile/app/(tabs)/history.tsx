import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import * as MediaLibrary from "expo-media-library";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ClayCard } from "@/components/ClayCard";
import Colors from "@/constants/colors";
import { CompressedPhoto, useCompression } from "@/context/CompressionContext";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function savingsPercent(original: number, compressed: number): number {
  if (!original || !compressed) return 0;
  return Math.round(((original - compressed) / original) * 100);
}

type FormatBadgeProps = { format?: string };
const FORMAT_COLORS: Record<string, { bg: string; text: string }> = {
  jpeg: { bg: Colors.light.coral + "20", text: Colors.light.coralDark },
  png: { bg: Colors.light.lavender + "25", text: "#6B32CC" },
  webp: { bg: Colors.light.mint + "30", text: "#1A8C6A" },
};
function FormatBadge({ format }: FormatBadgeProps) {
  if (!format) return null;
  const colors = FORMAT_COLORS[format] ?? { bg: Colors.light.creamDark, text: Colors.light.textMuted };
  return (
    <View style={[styles.formatBadge, { backgroundColor: colors.bg }]}>
      <Text style={[styles.formatBadgeText, { color: colors.text }]}>
        {format.toUpperCase()}
      </Text>
    </View>
  );
}

type ConfirmModalProps = {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
};

function ConfirmModal({ visible, title, message, confirmLabel, onConfirm, onCancel }: ConfirmModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <Pressable style={styles.modalOverlay} onPress={onCancel}>
        <Pressable style={styles.modalCardWrapper} onPress={() => {}}>
          <ClayCard style={styles.modalCard} elevated>
            <Text style={styles.modalTitle}>{title}</Text>
            <Text style={styles.modalMessage}>{message}</Text>
            <View style={styles.modalButtons}>
              <Pressable onPress={onCancel} style={styles.modalCancelBtn}>
                <Text style={styles.modalCancelText}>İptal</Text>
              </Pressable>
              <Pressable onPress={onConfirm} style={styles.modalConfirmBtn}>
                <Text style={styles.modalConfirmText}>{confirmLabel}</Text>
              </Pressable>
            </View>
          </ClayCard>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

type ActionStatus = "idle" | "loading" | "success" | "error";

type HistoryItemProps = {
  item: CompressedPhoto;
  onDelete: (id: string) => void;
  onDownload: (item: CompressedPhoto, setStatus: (s: ActionStatus) => void) => void;
  onRecompress: (item: CompressedPhoto, setStatus: (s: ActionStatus) => void) => void;
};

function HistoryItem({ item, onDelete, onDownload, onRecompress }: HistoryItemProps) {
  const savings = savingsPercent(item.originalSize, item.compressedSize);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [dlStatus, setDlStatus] = useState<ActionStatus>("idle");
  const [rcStatus, setRcStatus] = useState<ActionStatus>("idle");

  const handleDelete = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (Platform.OS === "web") {
      setShowDeleteModal(true);
    } else {
      Alert.alert("Sil", "Bu kaydı geçmişten silmek istiyor musunuz?", [
        { text: "İptal", style: "cancel" },
        { text: "Sil", style: "destructive", onPress: () => onDelete(item.id) },
      ]);
    }
  };

  const dlLabel =
    dlStatus === "loading" ? "İndiriliyor…" :
    dlStatus === "success" ? "Kaydedildi!" :
    dlStatus === "error"   ? "Erişilemiyor" :
    "İndir";

  const rcLabel =
    rcStatus === "loading" ? "Yükleniyor…" :
    rcStatus === "error"   ? "Dosya bulunamadı" :
    "Tekrar Sıkıştır";

  return (
    <>
      <ClayCard style={styles.historyCard}>
        <View style={styles.cardRow}>
          <Image
            source={{ uri: item.compressedUri }}
            style={styles.thumb}
            resizeMode="cover"
          />
          <View style={styles.cardInfo}>
            <View style={styles.cardNameRow}>
              <Text style={styles.cardName} numberOfLines={1}>
                {item.fileName}
              </Text>
              <FormatBadge format={item.format} />
            </View>
            <Text style={styles.cardDate}>{formatDate(item.savedAt)}</Text>

            <View style={styles.sizesRow}>
              <View style={styles.sizeItem}>
                <Text style={styles.sizeLabel}>Önce</Text>
                <Text style={styles.sizeValue}>{formatBytes(item.originalSize)}</Text>
              </View>
              <Ionicons name="arrow-forward" size={12} color={Colors.light.textMuted} />
              <View style={styles.sizeItem}>
                <Text style={styles.sizeLabel}>Sonra</Text>
                <Text style={[styles.sizeValue, { color: Colors.light.coral }]}>
                  {formatBytes(item.compressedSize)}
                </Text>
              </View>
            </View>

            {savings > 0 && (
              <View style={styles.savingPill}>
                <Ionicons name="trending-down" size={12} color="#1A8C6A" />
                <Text style={styles.savingPillText}>%{savings} küçültüldü</Text>
              </View>
            )}
          </View>

          <Pressable
            onPress={handleDelete}
            style={styles.deleteBtn}
            hitSlop={8}
          >
            <Ionicons name="trash-outline" size={18} color={Colors.light.textMuted} />
          </Pressable>
        </View>

        {/* Action row */}
        <View style={styles.actionRow}>
          <Pressable
            onPress={() => dlStatus === "idle" && onDownload(item, (s) => {
              setDlStatus(s);
              if (s === "success" || s === "error") {
                setTimeout(() => setDlStatus("idle"), 2500);
              }
            })}
            style={[
              styles.actionBtn,
              dlStatus === "success" && styles.actionBtnSuccess,
              dlStatus === "error"   && styles.actionBtnError,
            ]}
            disabled={dlStatus === "loading"}
          >
            <Ionicons
              name={dlStatus === "success" ? "checkmark" : dlStatus === "error" ? "alert-circle-outline" : "download-outline"}
              size={14}
              color={
                dlStatus === "success" ? "#1A8C6A" :
                dlStatus === "error"   ? Colors.light.coral :
                Colors.light.lavender
              }
            />
            <Text style={[
              styles.actionBtnText,
              dlStatus === "success" && { color: "#1A8C6A" },
              dlStatus === "error"   && { color: Colors.light.coral },
            ]}>
              {dlLabel}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => rcStatus === "idle" && onRecompress(item, (s) => {
              setRcStatus(s);
              if (s === "error") {
                setTimeout(() => setRcStatus("idle"), 3000);
              }
            })}
            style={[
              styles.actionBtn,
              rcStatus === "error" && styles.actionBtnError,
            ]}
            disabled={rcStatus === "loading"}
          >
            <Ionicons
              name={rcStatus === "error" ? "alert-circle-outline" : "sync-outline"}
              size={14}
              color={rcStatus === "error" ? Colors.light.coral : Colors.light.mint}
            />
            <Text style={[
              styles.actionBtnText,
              { color: rcStatus === "error" ? Colors.light.coral : Colors.light.mint },
            ]}>
              {rcLabel}
            </Text>
          </Pressable>
        </View>
      </ClayCard>

      {Platform.OS === "web" && (
        <ConfirmModal
          visible={showDeleteModal}
          title="Kaydı Sil"
          message="Bu kaydı geçmişten silmek istiyor musunuz?"
          confirmLabel="Sil"
          onConfirm={() => {
            setShowDeleteModal(false);
            onDelete(item.id);
          }}
          onCancel={() => setShowDeleteModal(false)}
        />
      )}
    </>
  );
}

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { history, removeFromHistory, clearHistory, setPendingRecompress } = useCompression();
  const [showClearModal, setShowClearModal] = useState(false);

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : 0;

  const handleClearAll = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    if (Platform.OS === "web") {
      setShowClearModal(true);
    } else {
      Alert.alert("Tümünü Sil", "Tüm geçmişi silmek istiyor musunuz?", [
        { text: "İptal", style: "cancel" },
        { text: "Temizle", style: "destructive", onPress: clearHistory },
      ]);
    }
  };

  const handleDownload = async (item: CompressedPhoto, setStatus: (s: ActionStatus) => void) => {
    await Haptics.selectionAsync();
    setStatus("loading");
    try {
      if (Platform.OS === "web") {
        const resp = await fetch(item.compressedUri);
        if (!resp.ok) throw new Error("stale");
        const blob = await resp.blob();
        const objectUrl = URL.createObjectURL(blob);
        const ext = item.format === "png" ? "png" : item.format === "webp" ? "webp" : "jpg";
        const a = document.createElement("a");
        a.href = objectUrl;
        a.download = `compressed_${item.fileName.replace(/\.[^.]+$/, "")}.${ext}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(objectUrl);
      } else {
        const info = await FileSystem.getInfoAsync(item.compressedUri);
        if (!info.exists) throw new Error("stale");
        const { status } = await MediaLibrary.requestPermissionsAsync();
        if (status !== "granted") {
          Alert.alert("İzin Gerekli", "Galeriye kaydetmek için lütfen galeri iznini etkinleştirin.", [{ text: "Tamam" }]);
          setStatus("idle");
          return;
        }
        await MediaLibrary.saveToLibraryAsync(item.compressedUri);
      }
      setStatus("success");
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (_) {
      setStatus("error");
    }
  };

  const handleRecompress = async (item: CompressedPhoto, setStatus: (s: ActionStatus) => void) => {
    await Haptics.selectionAsync();
    setStatus("loading");
    try {
      if (Platform.OS === "web") {
        const resp = await fetch(item.originalUri);
        if (!resp.ok) throw new Error("stale");
      } else {
        const info = await FileSystem.getInfoAsync(item.originalUri);
        if (!info.exists) throw new Error("stale");
      }
      setPendingRecompress({
        originalUri: item.originalUri,
        format: item.format ?? "jpeg",
        level: item.level ?? "medium",
        fileName: item.fileName,
        originalSize: item.originalSize,
      });
      router.navigate("/");
    } catch (_) {
      setStatus("error");
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={["#FFF4F0", "#FFE8F5", "#EEE6FF"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <View style={[styles.header, { paddingTop: topInset + 16 }]}>
        <View>
          <Text style={styles.headerTitle}>Geçmiş</Text>
          <Text style={styles.headerSubtitle}>
            {history.length} sıkıştırma kaydedildi
          </Text>
        </View>
        {history.length > 0 && (
          <Pressable onPress={handleClearAll} style={styles.clearBtn}>
            <Ionicons name="trash" size={16} color={Colors.light.coral} />
            <Text style={styles.clearBtnText}>Temizle</Text>
          </Pressable>
        )}
      </View>

      {history.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIconCircle}>
            <Ionicons name="time-outline" size={48} color={Colors.light.lavender} />
          </View>
          <Text style={styles.emptyTitle}>Henüz geçmiş yok</Text>
          <Text style={styles.emptySubtitle}>
            Fotoğraf sıkıştırdığınızda burada görünecek
          </Text>
        </View>
      ) : (
        <FlatList
          data={history}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <HistoryItem
              item={item}
              onDelete={removeFromHistory}
              onDownload={handleDownload}
              onRecompress={handleRecompress}
            />
          )}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: bottomInset + 100 },
          ]}
          showsVerticalScrollIndicator={false}
          scrollEnabled={history.length > 0}
        />
      )}

      {Platform.OS === "web" && (
        <ConfirmModal
          visible={showClearModal}
          title="Tümünü Sil"
          message="Tüm geçmiş kayıtları silinecek. Bu işlem geri alınamaz."
          confirmLabel="Temizle"
          onConfirm={() => {
            setShowClearModal(false);
            clearHistory();
          }}
          onCancel={() => setShowClearModal(false)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  headerTitle: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    color: Colors.light.textPrimary,
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  clearBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: Colors.light.coral + "15",
  },
  clearBtnText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.coral,
  },
  list: {
    paddingHorizontal: 20,
    gap: 12,
  },
  historyCard: {
    padding: 14,
    gap: 12,
  },
  cardRow: {
    flexDirection: "row",
    gap: 14,
    alignItems: "flex-start",
  },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: 16,
  },
  cardInfo: {
    flex: 1,
    gap: 4,
  },
  cardNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  cardName: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.textPrimary,
    flexShrink: 1,
  },
  cardDate: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textMuted,
  },
  sizesRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  sizeItem: {
    alignItems: "flex-start",
  },
  sizeLabel: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textMuted,
  },
  sizeValue: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    color: Colors.light.textPrimary,
  },
  savingPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.light.mintLight,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    alignSelf: "flex-start",
    marginTop: 4,
  },
  savingPillText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: "#1A8C6A",
  },
  formatBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  formatBadgeText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.3,
  },
  deleteBtn: {
    padding: 4,
    alignSelf: "flex-start",
  },
  actionRow: {
    flexDirection: "row",
    gap: 8,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 9,
    borderRadius: 14,
    backgroundColor: Colors.light.creamDark,
  },
  actionBtnSuccess: {
    backgroundColor: Colors.light.mintLight,
  },
  actionBtnError: {
    backgroundColor: Colors.light.coral + "18",
  },
  actionBtnText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.lavender,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    paddingHorizontal: 40,
  },
  emptyIconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Colors.light.lavender + "20",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: Colors.light.textPrimary,
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textSecondary,
    textAlign: "center",
    lineHeight: 22,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  modalCardWrapper: {
    width: "100%",
    maxWidth: 360,
  },
  modalCard: {
    gap: 12,
    padding: 24,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: Colors.light.textPrimary,
  },
  modalMessage: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textSecondary,
    lineHeight: 22,
  },
  modalButtons: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 16,
    alignItems: "center",
    backgroundColor: Colors.light.creamDark,
  },
  modalCancelText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.textSecondary,
  },
  modalConfirmBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 16,
    alignItems: "center",
    backgroundColor: Colors.light.coral,
  },
  modalConfirmText: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    color: "#fff",
  },
});
