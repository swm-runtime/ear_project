import { mergePublications, type Publication } from "@ear/pipeline/publication";
import { supabaseServer } from "./supabase-server";

/** 상수 + 콘솔에서 만든 간행물(`publications` 테이블, 0036 · 2026-10-27). 테이블이 없으면(마이그레이션 전) 상수만 */
export async function loadPublications(): Promise<Publication[]> {
  try {
    const sb = await supabaseServer();
    const { data, error } = await sb.from("publications").select("key,locale,name,style,hint").order("created_at");
    if (error) return mergePublications([]);
    return mergePublications((data ?? []).map((r) => ({ key: r.key as string, locale: r.locale as Publication["locale"], name: r.name as string, style: r.style as Publication["style"], hint: (r.hint as string | null) ?? "" })));
  } catch { return mergePublications([]); }
}
