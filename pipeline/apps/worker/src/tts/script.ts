import { cfg } from "../config.js";

/**
 * 대본 md → TTS 입력 구조 (spec/04 A형 규격: `[윤아] E12 · 본문`, 구역 헤더 `## [콜드오픈]` 등).
 * 콜드오픈은 구역만 따로 표시한다 — 별도 합성 금지(spec/06 7장): 발췌 원본 턴(E몇)의 오디오에서 만든다.
 */
export type Speaker = "윤아" | "이음";
export interface ScriptTurn { speaker: Speaker; id: string | null; text: string; section: string }
export interface ParsedScript {
  meta: string;
  coldOpen: { speaker: Speaker; text: string; sourceTurn: string | null } | null;
  turns: ScriptTurn[]; // 인트로부터 마무리까지 (콜드오픈 제외)
  placeholders: string[];
}

const SECTION_RE = /^#{2,}\s*\[([^\]]+)\]\s*(.*)$/;
const TURN_A = /^\[(윤아|이음)\]\s*([EY]\d+)\s*·\s*(.+)$/;
const TURN_PLAIN = /^\[(윤아|이음)\]\s*(.+)$/;

export function parseScriptForTts(md: string): ParsedScript {
  let section = "";
  let coldOpenSource: string | null = null;
  let coldOpen: ParsedScript["coldOpen"] = null;
  const turns: ScriptTurn[] = [];
  const lines = md.split("\n");
  const meta = lines.find((l) => l.trim() && !l.trim().startsWith("#")) ?? "";

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const sec = line.match(SECTION_RE);
    if (sec) {
      section = sec[1].trim();
      if (section === "콜드오픈") coldOpenSource = sec[2].match(/본편\s*(E\d+)/)?.[1] ?? null;
      continue;
    }
    let m = line.match(TURN_A);
    if (m) {
      if (section !== "콜드오픈") turns.push({ speaker: m[1] as Speaker, id: m[2], text: m[3].trim(), section });
      continue;
    }
    m = line.match(TURN_PLAIN);
    if (m) {
      if (section === "콜드오픈") coldOpen = { speaker: m[1] as Speaker, text: m[2].trim(), sourceTurn: coldOpenSource };
      else turns.push({ speaker: m[1] as Speaker, id: null, text: m[2].trim(), section });
    }
    // 그 외(메타·주석)는 합성 대상 아님
  }

  const placeholders = turns.flatMap((t) => t.text.match(/\{[^}]{2,}\}/g) ?? []);
  return { meta: meta.trim(), coldOpen, turns, placeholders };
}

export function voiceOf(speaker: Speaker): string {
  return speaker === "윤아" ? cfg.ttsVoiceYuna : cfg.ttsVoiceEum;
}

/**
 * 턴 → 분할 요청 묶음 (요청당 권장 2,000자 — 문서 기준. 분할은 반드시 턴 경계, spec/06 3장).
 * `isolate` 에 있는 턴(콜드오픈 발췌 원본)은 단독 요청으로 뗀다 — 그 요청의 오디오가 콜드오픈 재료가 된다.
 */
export function chunkTurns(turns: ScriptTurn[], maxChars = 1800, isolate: Set<string> = new Set()): ScriptTurn[][] {
  const chunks: ScriptTurn[][] = [];
  let cur: ScriptTurn[] = [];
  let len = 0;
  const flush = () => { if (cur.length) { chunks.push(cur); cur = []; len = 0; } };
  for (const t of turns) {
    if (t.id && isolate.has(t.id)) { flush(); chunks.push([t]); continue; }
    if (len + t.text.length > maxChars) flush();
    cur.push(t); len += t.text.length;
  }
  flush();
  return chunks;
}
