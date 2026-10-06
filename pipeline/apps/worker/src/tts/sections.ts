import type { ScriptTurn } from "./script.js";
import { displayText, type ScriptSegment } from "./segments.js";

/**
 * 구간 제목 (KAN-137, 2026-10-06 박수헌 결정) — 미니 플레이어 위 "지금 듣는 구간" 표시 재료. 서버 계약은 KAN-144(`content_scripts.sections`).
 *
 * - 구간 = 대본의 단락 제목(`### #1 제목`의 "제목") 그대로. 단락 제목이 없는 구역(인트로·도입·마무리)은 구역 이름 그대로.
 * - 시각은 자막 세그먼트(배포본 기준)에서 그 구간 첫 턴이 시작하는 시각. 첫 구간은 0초 — 앞 징글·무음도 첫 구간(인트로)으로 본다.
 * - 턴↔세그먼트는 순서대로 대조한다. 긴 턴은 세그먼트가 문장 묶음으로 쪼개져 있어(segments.ts splitLong) 1:1 이 아니다.
 *   대조가 한 곳이라도 어긋나면 구간을 내지 않는다 — 틀린 시각보다 없는 편이 낫다(자막과 같은 규칙, spec/06 7장).
 */
export interface ScriptSection { start_sec: number; title: string }

/** 서버 검증 상한(KAN-144: title ≤ 60자, 0~30개) — 제목이 넘으면 말줄임으로 자르고, 개수가 넘으면 구간을 내지 않는다 */
export const SECTION_TITLE_MAX = 60;
export const SECTIONS_MAX = 30;

export function sectionTitle(t: Pick<ScriptTurn, "section" | "topic">): string {
  const raw = (t.topic || t.section || "").trim();
  return raw.length > SECTION_TITLE_MAX ? `${raw.slice(0, SECTION_TITLE_MAX - 1)}…` : raw;
}

const norm = (s: string) => displayText(s).replace(/\s+/g, "");

/** 자막에서 빠진 턴을 몇 개까지 견디는가 — joinChunkSegments 가 길이 0 이 된 세그먼트를 버린다(S261003-002 Y6 실측) */
export const MISSING_TURNS_MAX = 3;

type Turn = Pick<ScriptTurn, "speaker" | "id" | "text" | "section" | "topic">;
const opens = (t: Turn | undefined, s: ScriptSegment | undefined) => !!t && !!s && s.speaker === t.speaker && norm(t.text).startsWith(norm(s.text));

export function buildSections(turns: Turn[], segments: ScriptSegment[]): { sections: ScriptSection[]; reason?: string; missingTurns?: string[] } {
  if (!turns.length || !segments.length) return { sections: [], reason: "턴 또는 자막 세그먼트 없음" };
  // 1) 턴마다 첫 세그먼트의 시작 시각
  const turnStart: number[] = [];
  const missing: string[] = [];
  let cur = 0;
  for (let i = 0; i < turns.length; i++) {
    const t = turns[i];
    const target = norm(t.text);
    const first = segments[cur];
    const label = t.id ?? `${i + 1}번째 턴`;
    if (!opens(t, first)) {
      // 자막에서 빠진 턴: 길이 0 으로 버려졌으니 다음 턴의 세그먼트와 같은 시각에 시작한 것으로 본다 — 세그먼트는 소비하지 않는다
      if (opens(turns[i + 1], first) && missing.length < MISSING_TURNS_MAX) { missing.push(label); turnStart.push(first.start_sec); continue; }
      return { sections: [], reason: `${label} 에서 자막 세그먼트와 대조가 어긋남` };
    }
    turnStart.push(first.start_sec);
    let acc = norm(first.text);
    cur++;
    while (acc.length < target.length && cur < segments.length && segments[cur].speaker === t.speaker && target.startsWith(acc + norm(segments[cur].text))) {
      acc += norm(segments[cur].text);
      cur++;
    }
    if (acc !== target) return { sections: [], reason: `${label} 의 쪼개진 세그먼트를 다 잇지 못함` };
  }
  if (cur !== segments.length) return { sections: [], reason: `대조 뒤 세그먼트 ${segments.length - cur}건이 남음` };
  // 2) 구역·단락이 바뀌는 턴마다 구간 시작
  const sections: ScriptSection[] = [];
  let prevKey: string | null = null;
  turns.forEach((t, i) => {
    const key = `${t.section}\u0000${t.topic ?? ""}`;
    if (key === prevKey) return;
    prevKey = key;
    const title = sectionTitle(t);
    if (!title) return;
    if (sections.length && sections[sections.length - 1].title === title) return; // 같은 이름이 이어지면 하나로
    sections.push({ start_sec: sections.length ? turnStart[i] : 0, title });
  });
  for (let k = 1; k < sections.length; k++) {
    if (!(sections[k].start_sec > sections[k - 1].start_sec)) return { sections: [], reason: `구간 "${sections[k].title}" 시작이 앞 구간보다 늦지 않음` };
  }
  if (sections.length > SECTIONS_MAX) return { sections: [], reason: `구간 ${sections.length}개 — 상한 ${SECTIONS_MAX}개 초과` };
  return missing.length ? { sections, missingTurns: missing } : { sections };
}
