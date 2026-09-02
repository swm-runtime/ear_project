"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { EarAuthError, clearTokens, loadTokens, loginWithGoogle, tokenClaims } from "@/lib/ear";
import { Panel } from "@/components/ui";

const GIS_SRC = "https://accounts.google.com/gsi/client";
const CLIENT_ID = process.env.NEXT_PUBLIC_EAR_GOOGLE_CLIENT_ID ?? "";

declare global {
  interface Window { google?: { accounts: { id: { initialize(o: object): void; renderButton(el: HTMLElement, o: object): void } } } }
}

/**
 * 제품 서버 연결 게이트 — 제품 JWT 가 없으면 구글 로그인 카드를, 있으면 children 을 그린다.
 * 파이프라인 로그인(Supabase)과 별개의 두 번째 로그인이다 (lib/ear.ts 머리 주석).
 */
export function EarGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<"checking" | "need-login" | "not-admin" | "ready">("checking");
  const [err, setErr] = useState<string | null>(null);
  const btnHost = useRef<HTMLDivElement>(null);

  const evaluate = useCallback(() => {
    if (!loadTokens()) return setState("need-login");
    setState(tokenClaims().role === "admin" ? "ready" : "not-admin");
  }, []);
  useEffect(() => { queueMicrotask(evaluate); }, [evaluate]); // 동기 setState 회피 (react-hooks/set-state-in-effect)

  useEffect(() => {
    if (state !== "need-login" && state !== "not-admin") return;
    const mount = () => {
      if (!window.google || !btnHost.current || !CLIENT_ID) return;
      window.google.accounts.id.initialize({
        client_id: CLIENT_ID,
        callback: async (resp: { credential?: string }) => {
          if (!resp.credential) return setErr("구글 인증이 취소됐어요");
          try { await loginWithGoogle(resp.credential); setErr(null); evaluate(); }
          catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
        },
        ux_mode: "popup",
      });
      btnHost.current.innerHTML = "";
      window.google.accounts.id.renderButton(btnHost.current, { theme: "outline", size: "large", text: "signin_with", locale: "ko" });
    };
    if (window.google) return mount();
    const s = document.createElement("script");
    s.src = GIS_SRC; s.async = true; s.onload = mount;
    document.head.appendChild(s);
  }, [state, evaluate]);

  if (state === "checking") return null;
  if (state === "ready") return <>{children}</>;

  const claims = tokenClaims();
  return (
    <Panel title="제품 서버 연결" className="mx-auto max-w-xl">
      <div className="space-y-3 text-[13px]">
        {state === "not-admin" ? (
          <>
            <p className="text-rose-700">로그인은 됐지만 이 구글 계정은 제품 관리자(<code>role=admin</code>)가 아니에요.</p>
            <p className="text-ink-soft">
              관리자에게 아래 id 승격을 요청한 뒤 다시 연결하세요:{" "}
              <code className="rounded bg-[#f1f5f9] px-1.5 py-0.5">{claims.sub}</code>
            </p>
            <button className="rounded border border-line px-3 py-1.5 text-xs hover:bg-[#f7f9fb]" onClick={() => { clearTokens(); evaluate(); }}>다른 계정으로</button>
          </>
        ) : (
          <p className="text-ink-soft">
            제품 발행·회수는 제품 서버의 관리자 권한이 필요해요. 파이프라인 로그인과 별개로,
            제품 관리자 구글 계정으로 한 번 더 로그인합니다 (토큰은 이 브라우저에만 저장).
          </p>
        )}
        <div ref={btnHost} />
        {err && <p className="text-rose-600">{err}</p>}
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
  if (e instanceof EarAuthError) return "제품 서버 세션이 만료됐어요 — 다시 연결해 주세요";
  return e instanceof Error ? e.message : String(e);
}
