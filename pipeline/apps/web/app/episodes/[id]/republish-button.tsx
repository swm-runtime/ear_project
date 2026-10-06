"use client";
import { useState } from "react";
import { republishEarContent, EarApiError } from "@/lib/ear";
import { fetchDistAudio, fetchLosslessAudio } from "@/lib/publish-files";
import { markPublished } from "../../actions";
import { earErrMsg } from "../../publish/ear-connect";
import { btnCls } from "@/components/ui";

/**
 * 재발행 — 오디오·썸네일 교체 (spec/07 5장 · admin-api 4.10). 발행된 에피소드의 산출물을 다시 만든 뒤
 * 사람이 확인하고 누른다. 같은 content_id 에 파일을 갈아끼우고 content_version 을 올린다 —
 * 사용자 라이브러리·재생 기록은 유지된다. 자동 푸시는 하지 않는다(게이트 2 원칙).
 *
 * **발행 이후에 다시 만들어진 것만 보낸다**(KAN-50 5-1). 바뀌지 않은 파일까지 올리면 내용이 같은데도
 * `content_version` 이 오르고, 앱에서는 그것이 "새 버전"으로 읽혀 저장 위치가 초기화된다.
 *
 * **오디오를 바꿀 때는 자막(script-segments.json)을 함께 보낸다** (2026-10-01). 오디오 교체 재발행에 `script_file` 이 없으면 제품이 기존 자막을
 * 지운다(admin-api 4.10 "대본 삭제") — 새 오디오의 TTS 가 만든 자막을 같이 실어야 자막이 유지된다. TTS 가 자막을 못 만든 편은 자막 없이 나간다.
 */
export function RepublishButton({ episodeId, backlogId, contentId, version, publishedAt, lastTtsAt, lastThumbAt, audioNewer, thumbnailNewer, pending }: {
  episodeId: string; backlogId: string; contentId: string; version: number | null; publishedAt: string | null;
  lastTtsAt: string | null; lastThumbAt: string | null; audioNewer: boolean; thumbnailNewer: boolean; pending: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false }) : "-");

  const parts = [audioNewer && "오디오", thumbnailNewer && "썸네일"].filter(Boolean) as string[];

  async function run() {
    if (parts.length === 0) return;
    const what = parts.join("·");
    if (!confirm(`${episodeId} 의 발행본 ${what}${audioNewer ? "(자막 포함)" : ""}을(를) 교체합니다 (제품 콘텐츠 ${contentId.slice(0, 8)}…, v${version ?? "?"} → v${(version ?? 0) + 1}).\n확인을 마쳤나요? 앱 사용자의 저장 위치는 초기화되고 라이브러리는 유지됩니다.`)) return;
    setBusy(true); setMsg(null);
    try {
      // 바뀐 것만 받아 보낸다 — 안 바뀐 파일까지 올리면 같은 내용으로 버전만 오른다
      const fetchPart = async (query: string, name: string, type: string, label: string) => {
        const res = await fetch(`/api/publish/${episodeId}?${query}=1`);
        if (!res.ok) throw new Error(`${label}을(를) 읽지 못했어요 — 해당 탭에서 파일이 있는지 확인`);
        return new File([await res.blob()], name, { type });
      };
      const audio = audioNewer ? (await fetchDistAudio(episodeId)) ?? undefined : undefined;
      if (audioNewer && !audio) throw new Error("발행 오디오(dist.m4a·dist.mp3)를 읽지 못했어요 — 음원 탭에서 파일이 있는지 확인");
      const lossless = audio ? (await fetchLosslessAudio(episodeId)) ?? undefined : undefined; // 무손실(Pro) — 서버 스위치가 꺼져 있으면 없음
      const thumbnail = thumbnailNewer ? await fetchPart("thumbnail", `${episodeId}.png`, "image/png", "썸네일(thumbnail.png)") : undefined;
      // 자막은 새 오디오의 TTS 산출물 — 없으면(정렬 실패 편) 싣지 않는다. 그때 제품은 기존 자막을 지운다(틀린 자막보다 없는 편)
      const scriptRes = audio ? await fetch(`/api/publish/${episodeId}?script=1`) : null;
      const script = scriptRes?.ok ? new File([await scriptRes.text()], "script-segments.json", { type: "application/json" }) : undefined;
      const content = await republishEarContent(contentId, { audio, lossless, thumbnail, script });
      const scriptNote = !audio ? "" : content.script_applied ? " · 자막 교체" : ` · ⚠️ 자막 없음(${script ? content.script_rejected_reason ?? "거부" : "TTS 자막 파일 없음"})`;
      await markPublished(backlogId, content.id, content.content_version, undefined, {
        action: "republish",
        parts: [audioNewer && "audio", thumbnailNewer && "thumbnail", content.script_applied && "script"].filter(Boolean) as string[],
        episodeId,
        note: `발행 이후 다시 만든 ${what} 교체${scriptNote}`,
      });
      setMsg(`재발행 완료 — v${content.content_version}${scriptNote}`);
    } catch (e) {
      // 백엔드 미구현(404) 은 사용자에게 그대로 알린다 — 티켓 tickets/backend/pending/content-republish-audio.md
      const notReady = e instanceof EarApiError && e.status === 404;
      setMsg(notReady ? "제품 서버에 재발행 API 가 아직 없습니다 (백엔드 구현 대기 — admin-api 4.10)" : earErrMsg(e));
    } finally { setBusy(false); }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button className={btnCls(parts.length ? "primary" : undefined)} disabled={busy || pending || parts.length === 0}
        title={`발행 ${fmt(publishedAt)} (v${version ?? "?"}) · 최근 TTS ${fmt(lastTtsAt)} · 최근 썸네일 ${fmt(lastThumbAt)}${parts.length ? ` — 발행 이후 ${parts.join("·")}이(가) 다시 만들어짐` : " — 발행본과 같음"}`}
        onClick={() => void run()}>
        {busy ? "재발행 중…" : parts.length ? `재발행 — ${parts.join("·")} 교체` : "재발행"}
      </button>
      {msg && <span className="text-xs text-ink-soft">{msg}</span>}
    </span>
  );
}
