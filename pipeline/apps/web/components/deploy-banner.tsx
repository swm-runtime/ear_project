"use client";
import { useEffect, useState } from "react";

/**
 * 새 배포 안내 띠 (2026-10-26) — 서버 인스턴스 표식(/api/version)을 1분마다·탭이 다시 보일 때 읽어, 페이지를 연 뒤 바뀌었으면 위에 띠를 띄운다.
 * 배포 뒤 옛 탭의 버튼은 서버 액션 ID 가 달라 실패하는데(화면엔 "Failed to fetch"), 왜 안 되는지가 보이지 않았다. 자동 새로고침은 하지 않는다 — 입력 중인 내용이 날아간다.
 */
export function DeployBanner() {
  const [stale, setStale] = useState(false);
  useEffect(() => {
    let first: string | null = null;
    let stop = false;
    const check = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const r = await fetch("/api/version", { cache: "no-store" });
        if (!r.ok) return;
        const { started_at } = (await r.json()) as { started_at?: string };
        if (!started_at || stop) return;
        if (first === null) first = started_at;
        else if (started_at !== first) setStale(true);
      } catch { /* 네트워크 일시 오류는 무시 — 다음 틱에 다시 */ }
    };
    void check();
    const t = setInterval(check, 60_000);
    document.addEventListener("visibilitychange", check);
    return () => { stop = true; clearInterval(t); document.removeEventListener("visibilitychange", check); };
  }, []);
  if (!stale) return null;
  return (
    <div className="sticky top-0 z-50 flex items-center justify-between gap-3 border-b border-amber-300 bg-amber-50 px-4 py-2 text-[12.5px] text-amber-900">
      <span><b>콘솔이 새로 배포됐어요.</b> 이 탭은 옛 화면이라 버튼이 실패할 수 있어요(&quot;Failed to fetch&quot;). 입력 중인 내용을 저장한 뒤 새로고침해 주세요.</span>
      <button className="shrink-0 rounded border border-amber-400 bg-white px-2.5 py-1 font-medium hover:bg-amber-100" onClick={() => location.reload()}>새로고침</button>
    </div>
  );
}
