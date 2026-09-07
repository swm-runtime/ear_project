"use client";
import { useState } from "react";
import { republishEarContent, EarApiError } from "@/lib/ear";
import { markPublished } from "../../actions";
import { earErrMsg } from "../../publish/ear-connect";
import { btnCls } from "@/components/ui";

/**
 * 재발행 — 오디오 교체 (spec/07 5장 · admin-api 4.10). 발행된 에피소드의 TTS 를 다시 돌린 뒤 사람이 청취 확인하고 누른다.
 * 같은 content_id 에 파이프라인 dist.mp3 를 갈아끼우고 content_version 을 올린다 — 사용자 라이브러리·재생 기록은 유지된다.
 * 자동 푸시는 하지 않는다(게이트 2 원칙). 제품 API 호출은 이 브라우저의 관리자 세션으로 한다(/publish 와 동일).
 */
export function RepublishButton({ episodeId, backlogId, contentId, version, publishedAt, lastTtsAt, audioNewer, pending }: {
  episodeId: string; backlogId: string; contentId: string; version: number | null; publishedAt: string | null; lastTtsAt: string | null; audioNewer: boolean; pending: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false }) : "-");

  async function run() {
    if (!confirm(`${episodeId} 의 발행본 오디오를 교체합니다 (제품 콘텐츠 ${contentId.slice(0, 8)}…, v${version ?? "?"} → v${(version ?? 0) + 1}).\n청취 확인을 마쳤나요? 앱 사용자의 저장 위치는 초기화되고 라이브러리는 유지됩니다.`)) return;
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(`/api/publish/${episodeId}?audio=1`);
      if (!res.ok) throw new Error("발행 오디오(dist.mp3)를 읽지 못했어요 — 오디오 탭에서 파일이 있는지 확인");
      const audio = new File([await res.blob()], `${episodeId}.mp3`, { type: "audio/mpeg" });
      const content = await republishEarContent(contentId, { audio });
      await markPublished(backlogId, content.id, content.content_version);
      setMsg(`재발행 완료 — v${content.content_version}`);
    } catch (e) {
      // 백엔드 미구현(404) 은 사용자에게 그대로 알린다 — 티켓 tickets/backend/pending/content-republish-audio.md
      const notReady = e instanceof EarApiError && e.status === 404;
      setMsg(notReady ? "제품 서버에 재발행 API 가 아직 없습니다 (백엔드 구현 대기 — admin-api 4.10)" : earErrMsg(e));
    } finally { setBusy(false); }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button className={btnCls(audioNewer ? "primary" : undefined)} disabled={busy || pending}
        title={`발행 ${fmt(publishedAt)} (v${version ?? "?"}) · 최근 TTS ${fmt(lastTtsAt)}${audioNewer ? " — 발행 이후 재합성됨" : " — 발행본과 같음"}`}
        onClick={() => void run()}>
        {busy ? "재발행 중…" : audioNewer ? "재발행 — 오디오 교체" : "재발행"}
      </button>
      {msg && <span className="text-xs text-ink-soft">{msg}</span>}
    </span>
  );
}
