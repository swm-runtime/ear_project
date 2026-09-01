"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signIn(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMsg(null);
    const { error } = await supabaseBrowser().auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return setMsg(error.message);
    router.replace(params.get("next") || "/"); router.refresh();
  }
  async function magicLink() {
    setBusy(true); setMsg(null);
    const { error } = await supabaseBrowser().auth.signInWithOtp({ email, options: { emailRedirectTo: `${location.origin}/` } });
    setBusy(false);
    setMsg(error ? error.message : "로그인 링크를 이메일로 보냈습니다.");
  }
  return (
    <div className="mx-auto mt-24 max-w-sm rounded-lg border border-line bg-panel p-7 shadow-[0_2px_10px_rgba(38,49,61,0.06)]">
      <div className="mb-5 flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded bg-brand text-sm font-bold text-white">ear</span>
        <div>
          <h1 className="text-[15px] font-semibold leading-tight">ear 파이프라인</h1>
          <p className="text-xs text-ink-soft">팀 계정으로 로그인 (초대된 이메일만)</p>
        </div>
      </div>
      <form onSubmit={signIn} className="space-y-3">
        <input className="w-full rounded border border-line px-3 py-2 text-[13px] outline-none focus:border-brand" type="email" placeholder="이메일" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input className="w-full rounded border border-line px-3 py-2 text-[13px] outline-none focus:border-brand" type="password" placeholder="비밀번호" value={password} onChange={(e) => setPassword(e.target.value)} />
        <button className="w-full rounded bg-brand px-3 py-2 text-[13px] font-medium text-white transition hover:bg-brand-ink disabled:opacity-50" disabled={busy}>로그인</button>
      </form>
      <button className="mt-2 w-full rounded border border-line px-3 py-2 text-[13px] text-ink transition hover:bg-[#f7f9fb] disabled:opacity-50" onClick={magicLink} disabled={busy || !email}>비밀번호 없이 이메일 링크로 로그인</button>
      {msg && <p className="mt-3 text-[13px] text-rose-600">{msg}</p>}
    </div>
  );
}
