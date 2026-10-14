"use client";
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseConfig } from "./supabase-config";

/** 브라우저 클라이언트 — 접속값은 서버가 supabaseConfig() 로 읽어 넘긴다(인스턴스마다 DB 가 다르다, KAN-208) */
export function supabaseBrowser(c: SupabaseConfig) {
  return createBrowserClient(c.url, c.anonKey);
}
