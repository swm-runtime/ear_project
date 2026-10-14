/**
 * Supabase 접속값 (KAN-208) — 실행 시점 env(`SUPABASE_URL`·`SUPABASE_ANON_KEY`) 우선, 없으면 빌드에 박힌 `NEXT_PUBLIC_*`(한국판 종전 동작).
 * 콘솔 이미지 하나를 한국판·글로벌판(admin-global) 인스턴스가 같이 쓰므로 인스턴스별 DB 는 실행 시점에 읽는다. **서버에서만 부른다** — 브라우저에는 props 로 넘긴다(anon 키는 공개 값).
 */
export interface SupabaseConfig { url: string; anonKey: string }

export function supabaseConfig(): SupabaseConfig {
  return {
    url: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
    anonKey: process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  };
}
