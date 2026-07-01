"use client";

import { useState, useCallback, useEffect } from "react";
import { I18N, Lang, Dict, fmt } from "@/lib/i18n";

const STORAGE_KEY = "rcm-lang";

export const LANGS: { code: Lang; label: string; flag: string }[] = [
  { code: "en", label: "EN", flag: "🇬🇧" },
  { code: "zh", label: "中", flag: "🇨🇳" },
  { code: "ja", label: "日", flag: "🇯🇵" },
  { code: "ko", label: "한", flag: "🇰🇷" },
];

// Read initial lang synchronously (SSR-safe: returns default on server)
function getInitialLang(): Lang {
  if (typeof window === "undefined") return "en";
  try {
    const saved = localStorage.getItem(STORAGE_KEY) as Lang | null;
    if (saved && ["en", "zh", "ja", "ko"].includes(saved)) return saved;
    const nav = navigator.language?.toLowerCase() ?? "";
    if (nav.startsWith("zh")) return "zh";
    if (nav.startsWith("ja")) return "ja";
    if (nav.startsWith("ko")) return "ko";
  } catch {}
  return "en";
}

export function useLang() {
  // Lazy initial state — runs once on the client first render
  const [lang, setLang] = useState<Lang>(getInitialLang);
  // Track whether the language picker dropdown is open
  const [pickerOpen, setPickerOpen] = useState(false);

  const change = useCallback((l: Lang) => {
    setLang(l);
    setPickerOpen(false);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {}
  }, []);

  const toggle = useCallback(() => {
    // Legacy: cycle through languages
    setLang((cur) => {
      const order: Lang[] = ["en", "zh", "ja", "ko"];
      const next = order[(order.indexOf(cur) + 1) % order.length];
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {}
      return next;
    });
  }, []);

  const t: Dict = I18N[lang];
  const tf = useCallback(
    (key: keyof Dict, vars?: Record<string, string | number>) => {
      const tpl = I18N[lang][key] ?? (I18N.en[key] as string);
      return vars ? fmt(tpl, vars) : tpl;
    },
    [lang]
  );

  // Keep <html lang> attribute in sync for accessibility
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = lang === "zh" ? "zh-CN" : lang;
    }
  }, [lang]);

  // Close picker on outside click / escape
  useEffect(() => {
    if (!pickerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPickerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pickerOpen]);

  return {
    lang,
    change,
    toggle,
    t,
    tf,
    pickerOpen,
    setPickerOpen,
    langs: LANGS,
  };
}
