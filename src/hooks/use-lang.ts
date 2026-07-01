"use client";

import { useState, useCallback, useEffect } from "react";
import { I18N, Lang, Dict, fmt } from "@/lib/i18n";

const STORAGE_KEY = "rcm-lang";

// Read initial lang synchronously (SSR-safe: returns default on server)
function getInitialLang(): Lang {
  if (typeof window === "undefined") return "en";
  try {
    const saved = localStorage.getItem(STORAGE_KEY) as Lang | null;
    if (saved === "en" || saved === "zh") return saved;
    if (navigator.language?.toLowerCase().startsWith("zh")) return "zh";
  } catch {}
  return "en";
}

export function useLang() {
  // Lazy initial state — runs once on the client first render
  const [lang, setLang] = useState<Lang>(getInitialLang);

  const change = useCallback((l: Lang) => {
    setLang(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {}
  }, []);

  const toggle = useCallback(() => {
    setLang((cur) => {
      const next: Lang = cur === "en" ? "zh" : "en";
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
      document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
    }
  }, [lang]);

  return { lang, change, toggle, t, tf };
}
