import { LoginForm } from "./login-form";
import { supabaseConfig } from "@/lib/supabase-config";

/** 로그인 — 접속값은 서버가 실행 시점에 읽어 넘긴다(인스턴스마다 DB 가 다르다, KAN-208) */
export default function LoginPage() {
  return <LoginForm supabase={supabaseConfig()} />;
}
