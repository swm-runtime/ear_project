import { getText } from "@/lib/storage";
import { sectionsForSend, type SectionIn } from "@/lib/section-details";

/**
 * 발행·재발행 때 보내는 `script_file` 본문 (admin-api 4.6) — 신규 발행 화면·에피소드 재발행·구형 일괄 재발행·[자막 반영]이 모두 이걸 거친다.
 *
 * - 지금: 자막 세그먼트 배열(`script-segments.json`) 그대로.
 * - 구간 제목(KAN-137)을 켜면: `{ segments, sections }` 객체 — 서버 계약은 KAN-144(`content_scripts.sections`).
 *   2026-10-06 켬 — KAN-144(백엔드 #1150)가 운영 v1.2.0 으로 배포된 뒤. 객체를 받지 못하는 서버(그 이전 판)는 파일을 통째로 거부해 자막까지 빠진다.
 * - 구간의 구역·요약(KAN-152): `lib/section-details.ts` 스위치 — 켜기 전에는 `{ start_sec, title }` 만 나간다.
 */
export const SEND_SCRIPT_SECTIONS = true;

type Section = SectionIn;

/** 구간 파일(`script-sections.json`) — 없거나 비었거나 형식이 틀리면 [] (구간 없이 보낸다) */
export async function readScriptSections(episodeId: string): Promise<Section[]> {
  const text = await getText(`episodes/${episodeId}/script-sections.json`);
  if (!text) return [];
  try {
    const v = JSON.parse(text) as unknown;
    return Array.isArray(v) ? v.filter((s): s is Section => typeof s?.start_sec === "number" && typeof s?.title === "string" && !!s.title) : [];
  } catch { return []; }
}

export async function readScriptFileBody(episodeId: string): Promise<string | null> {
  const segmentsText = await getText(`episodes/${episodeId}/script-segments.json`);
  if (!segmentsText || !SEND_SCRIPT_SECTIONS) return segmentsText;
  const sections = await readScriptSections(episodeId);
  let segments: { end_sec: number }[];
  try { segments = JSON.parse(segmentsText); } catch { return segmentsText; }
  // 안전장치: 구간이 자막 끝보다 늦게 시작하면 다른 렌더의 구간이다 — 구간 없이 자막만 보낸다
  const end = segments[segments.length - 1]?.end_sec ?? 0;
  if (!sections.length || sections[sections.length - 1].start_sec >= end) return segmentsText;
  return JSON.stringify({ segments, sections: sectionsForSend(sections) });
}
