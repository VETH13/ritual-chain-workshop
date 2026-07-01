"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { Session, XProfile } from "@/lib/auth";

const STORAGE_KEY = "rcm-x-session";

export function useXAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load session from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: Session = JSON.parse(raw);
        setSession(parsed);
      }
    } catch {}
  }, []);

  const login = useCallback(async (handle: string): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch("/api/x-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle }),
      });
      const data = await resp.json();
      if (!resp.ok || !data.session) {
        setError(data.error || "Login failed");
        return false;
      }
      setSession(data.session);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data.session));
      return true;
    } catch (e: any) {
      setError(e?.message ?? "Login failed");
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    setSession(null);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return { session, loading, error, login, logout };
}
