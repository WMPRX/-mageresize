import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

export type CompressedPhoto = {
  id: string;
  originalUri: string;
  compressedUri: string;
  originalSize: number;
  compressedSize: number;
  quality: number;
  savedAt: number;
  fileName: string;
  format?: string;
  level?: string;
};

type CompressionContextType = {
  history: CompressedPhoto[];
  addToHistory: (photo: CompressedPhoto) => Promise<void>;
  removeFromHistory: (id: string) => Promise<void>;
  clearHistory: () => Promise<void>;
};

const CompressionContext = createContext<CompressionContextType | null>(null);

const STORAGE_KEY = "@photo_compression_history";

export function CompressionProvider({ children }: { children: React.ReactNode }) {
  const [history, setHistory] = useState<CompressedPhoto[]>([]);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        setHistory(JSON.parse(stored));
      }
    } catch (e) {
      console.error("Failed to load history", e);
    }
  };

  const saveHistory = async (items: CompressedPhoto[]) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch (e) {
      console.error("Failed to save history", e);
    }
  };

  const addToHistory = useCallback(async (photo: CompressedPhoto) => {
    setHistory((prev) => {
      const next = [photo, ...prev].slice(0, 50);
      saveHistory(next);
      return next;
    });
  }, []);

  const removeFromHistory = useCallback(async (id: string) => {
    setHistory((prev) => {
      const next = prev.filter((p) => p.id !== id);
      saveHistory(next);
      return next;
    });
  }, []);

  const clearHistory = useCallback(async () => {
    setHistory([]);
    await AsyncStorage.removeItem(STORAGE_KEY);
  }, []);

  return (
    <CompressionContext.Provider
      value={{ history, addToHistory, removeFromHistory, clearHistory }}
    >
      {children}
    </CompressionContext.Provider>
  );
}

export function useCompression() {
  const ctx = useContext(CompressionContext);
  if (!ctx) throw new Error("useCompression must be used within CompressionProvider");
  return ctx;
}
