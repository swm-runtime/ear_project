"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** 서버 컴포넌트 데이터를 주기적으로 새로 고친다 — 작업이 30~60분 걸려 수동 새로고침이 번거롭다 */
export function AutoRefresh({ seconds = 10 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    // 탭이 보일 때만 폴링 — 숨은 탭에서 Supabase 요청을 낭비하지 않는다 (Free 플랜 egress 절약)
    const tick = () => { if (document.visibilityState === "visible") router.refresh(); };
    const t = setInterval(tick, seconds * 1000);
    const onVis = () => { if (document.visibilityState === "visible") router.refresh(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
  }, [router, seconds]);
  return null;
}
