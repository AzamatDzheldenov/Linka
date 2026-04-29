"use client";

import {
  ReactNode,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type TextSizeMode = "small" | "normal" | "large";

type AppearanceContextValue = {
  textSize: TextSizeMode;
  compactMode: boolean;
  setTextSize: (textSize: TextSizeMode) => void;
  setCompactMode: (compactMode: boolean) => void;
};

const TEXT_SIZE_STORAGE_KEY = "linka.appearance.textSize";
const COMPACT_MODE_STORAGE_KEY = "linka.appearance.compactMode";
const AppearanceContext = createContext<AppearanceContextValue | null>(null);

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [textSize, setTextSizeState] = useState<TextSizeMode>("normal");
  const [compactMode, setCompactModeState] = useState(false);

  useEffect(() => {
    const storedTextSize = window.localStorage.getItem(TEXT_SIZE_STORAGE_KEY);
    const nextTextSize =
      storedTextSize === "small" ||
      storedTextSize === "normal" ||
      storedTextSize === "large"
        ? storedTextSize
        : "normal";
    const nextCompactMode =
      window.localStorage.getItem(COMPACT_MODE_STORAGE_KEY) === "true";

    setTextSizeState(nextTextSize);
    setCompactModeState(nextCompactMode);
    applyAppearance(nextTextSize, nextCompactMode);
  }, []);

  const value = useMemo<AppearanceContextValue>(() => {
    function setTextSize(nextTextSize: TextSizeMode) {
      window.localStorage.setItem(TEXT_SIZE_STORAGE_KEY, nextTextSize);
      setTextSizeState(nextTextSize);
      applyAppearance(nextTextSize, compactMode);
    }

    function setCompactMode(nextCompactMode: boolean) {
      window.localStorage.setItem(COMPACT_MODE_STORAGE_KEY, String(nextCompactMode));
      setCompactModeState(nextCompactMode);
      applyAppearance(textSize, nextCompactMode);
    }

    return {
      compactMode,
      setCompactMode,
      setTextSize,
      textSize,
    };
  }, [compactMode, textSize]);

  return (
    <AppearanceContext.Provider value={value}>
      {children}
    </AppearanceContext.Provider>
  );
}

export function useAppearance() {
  const context = useContext(AppearanceContext);

  if (!context) {
    throw new Error("useAppearance must be used inside AppearanceProvider");
  }

  return context;
}

function applyAppearance(textSize: TextSizeMode, compactMode: boolean) {
  const root = document.documentElement;
  root.dataset.textSize = textSize;
  root.dataset.compact = compactMode ? "true" : "false";
}
