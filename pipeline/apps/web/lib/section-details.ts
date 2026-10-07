/**
 * 구간의 구역(kind)·요약(summary) 전송 (KAN-152, 2026-10-07) — 서버 KAN-151 이 받는 선택 키.
 *
 * **꺼 둔다** — KAN-151 은 dev 에만 있고 운영(main)에 아직 없다. 운영 서버는 모르는 키를 거부해 `script_file` 이 통째로(자막까지) 빠진다.
 * KAN-151 이 운영에 배포되면 true 로 바꾼다. 꺼져 있으면 구간은 `{ start_sec, title }` 만 나간다(KAN-144 형식).
 */
export const SEND_SECTION_DETAILS = false;

export interface SectionIn { start_sec: number; title: string; kind?: unknown; summary?: unknown }
export interface SectionOut { start_sec: number; title: string; kind?: "intro" | "lead" | "body" | "outro"; summary?: string }

const KINDS = new Set(["intro", "lead", "body", "outro"]);
/** 서버 검증과 같은 상한 — 파이프라인은 20자 이내로 만들지만, 넘친 값으로 파일 전체가 거부되지 않게 서버 한도에서 한 번 더 거른다 */
export const SUMMARY_SERVER_MAX = 40;

/** 보낼 구간 — details 가 꺼져 있으면 kind·summary 를 빼고, 켜져 있어도 서버가 거부할 값(모르는 kind·빈 요약·40자 초과)은 그 키만 뺀다 */
export function sectionsForSend(sections: SectionIn[], details: boolean = SEND_SECTION_DETAILS): SectionOut[] {
  return sections.map((s) => {
    const out: SectionOut = { start_sec: s.start_sec, title: s.title };
    if (!details) return out;
    if (typeof s.kind === "string" && KINDS.has(s.kind)) out.kind = s.kind as SectionOut["kind"];
    if (typeof s.summary === "string" && s.summary.trim() && [...s.summary].length <= SUMMARY_SERVER_MAX) out.summary = s.summary.trim();
    return out;
  });
}
