"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { EarAuthError, clearTokens, connectEar, loadTokens, tokenClaims } from "@/lib/ear";
import { Panel } from "@/components/ui";

/**
 * 제품 서버 연결 게이트 — 제품 JWT가 없으면 Supabase 세션으로 **자동 SSO 연결**한다
 * (lib/ear.ts 머리 주석). 별도 로그인 UI가 없다: 실패했을 때만 안내 카드를 그린다.
 */
export function EarGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<"connecting" | "ready" | "error">("connecting");
  const [err, setErr] = useState<string | null>(null);
  const attempted = useRef(false);

  const connect = useCallback(async () => {
    setState("connecting");
    setErr(null);
    try {
      // 남은 토큰이 관리자면 그대로 쓰고, 아니면(만료·비관리자·없음) 새로 교환한다
      if (!(loadTokens() && tokenClaims().role === "admin")) {
        clearTokens();
        await connectEar();
      }
      setState("ready");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setState("error");
    }
  }, []);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;
    void connect();
  }, [connect]);

  if (state === "ready") return <>{children}</>;
  if (state === "connecting") return <p className="text-[13px] text-ink-soft">제품 서버 연결 중…</p>;

  return (
    <Panel title="제품 서버 연결 실패" className="mx-auto max-w-xl">
      <div className="space-y-3 text-[13px]">
        <p className="text-rose-700">{err}</p>
        <p className="text-ink-soft">
          파이프라인 계정과 <strong>같은 이메일</strong>의 제품 계정(<code>role=admin</code>)이
          있어야 해요. 없다면 관리자에게 승격을 요청한 뒤 [다시 연결]을 누르세요.
        </p>
        <button
          className="rounded border border-line px-3 py-1.5 text-xs hover:bg-[#f7f9fb]"
          onClick={() => void connect()}
        >
          다시 연결
        </button>
      </div>
    </Panel>
  );
}

/** 상단 우측 — 연결된 제품 계정 표시 + 해제 */
export function EarSession({ onChange }: { onChange?: () => void }) {
  const [, force] = useState(0);
  const claims = typeof window === "undefined" ? {} : tokenClaims();
  if (!claims.sub) return null;
  return (
    <span className="flex items-center gap-2 text-xs text-ink-soft">
      제품 계정 연결됨 · {claims.role}
      <button className="rounded border border-line px-2 py-1 hover:bg-[#f7f9fb]"
        onClick={() => { clearTokens(); force((n) => n + 1); onChange?.(); }}>해제</button>
    </span>
  );
}

export function earErrMsg(e: unknown): string {
  if (e instanceof EarAuthError) return "제품 서버 세션이 만료됐어요 — 새로고침하면 다시 연결됩니다";
  return e instanceof Error ? e.message : String(e);
}
