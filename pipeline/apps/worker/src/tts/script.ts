/**
 * 대본 md → TTS 입력 구조 (spec/04 A형 규격: `[윤아] E12 · 본문`, 구역 헤더 `## [본문]` 등).
 * [콜드오픈] 구역은 2026-09-07 폐지됐다 — 구 대본 호환으로 분리만 해 두고(turns 에 섞이지 않게) 합성 단계는 버린다.
 */
export type Speaker = "윤아" | "이음";
export interface ScriptTurn { speaker: Speaker; id: string | null; text: string; section: string; blockStart?: boolean } // blockStart: 헤더(구역·단락) 바로 다음 턴 — 분할 요청 경계 후보(chunkTurns)
export interface ParsedScript {
  meta: string;
  coldOpen: { speaker: Speaker; text: string; sourceTurn: string | null } | null;
  turns: ScriptTurn[]; // 인트로부터 마무리까지 (구 콜드오픈 구역 제외)
  placeholders: string[];
}

const SECTION_RE = /^#{2,}\s*\[([^\]]+)\]\s*(.*)$/;
// 규격은 `[윤아] E1 · 문장`(spec/04)이지만 생성 모델이 `E1.`(마침표)·`E1 [윤아]`(ID 선행) 등으로 이탈한 실측(2026-09-03 T260903-001/003)이 있어
// 변형을 수용한다 — ID 를 못 떼면 "E일." 같은 찌꺼기가 합성 입력에 새고 잔존 검사가 전 구역에서 오탐한다
const TURN_A = /^\[(윤아|이음)\]\s*([EY]\d{1,3})\s*(?:[·.:—-]\s*|\s+)(.+)$/;
const TURN_B = /^([EY]\d{1,3})\s*[·.:]?\s*\[(윤아|이음)\]\s*(.+)$/;
const TURN_PLAIN = /^\[(윤아|이음)\]\s*(.+)$/;

export function parseScriptForTts(md: string): ParsedScript {
  let section = "";
  let coldOpenSource: string | null = null;
  let coldOpen: ParsedScript["coldOpen"] = null;
  const turns: ScriptTurn[] = [];
  const lines = md.split("\n");
  const meta = lines.find((l) => l.trim() && !l.trim().startsWith("#")) ?? "";
  let blockStart = false; // 직전에 헤더(`## [구역]`·`### #n 단락`)가 있었는가 — 다음 턴에 표시하고 지운다
  const push = (t: Omit<ScriptTurn, "blockStart">) => { turns.push(blockStart ? { ...t, blockStart: true } : t); blockStart = false; };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const sec = line.match(SECTION_RE);
    if (sec) {
      section = sec[1].trim();
      if (section === "콜드오픈") coldOpenSource = sec[2].match(/본편\s*(E\d+)/)?.[1] ?? null;
      blockStart = true;
      continue;
    }
    if (/^#{2,}\s/.test(line)) { blockStart = true; continue; } // `### #1 제목` 같은 단락 헤더 — 구역은 바뀌지 않지만 화제가 바뀐다
    let m = line.match(TURN_A);
    if (m) {
      if (section === "콜드오픈") coldOpen = { speaker: m[1] as Speaker, text: m[3].trim(), sourceTurn: coldOpenSource };
      else push({ speaker: m[1] as Speaker, id: m[2], text: m[3].trim(), section });
      continue;
    }
    m = line.match(TURN_B); // `E1 [윤아] 문장` — ID 선행 변형
    if (m) {
      if (section === "콜드오픈") coldOpen = { speaker: m[2] as Speaker, text: m[3].trim(), sourceTurn: coldOpenSource };
      else push({ speaker: m[2] as Speaker, id: m[1], text: m[3].trim(), section });
      continue;
    }
    m = line.match(TURN_PLAIN);
    if (m) {
      if (section === "콜드오픈") coldOpen = { speaker: m[1] as Speaker, text: m[2].trim(), sourceTurn: coldOpenSource };
      else push({ speaker: m[1] as Speaker, id: null, text: m[2].trim(), section });
    }
    // 그 외(메타·주석)는 합성 대상 아님
  }

  const placeholders = turns.flatMap((t) => t.text.match(/\{[^}]{2,}\}/g) ?? []);
  return { meta: meta.trim(), coldOpen, turns, placeholders };
}

/** 분할 경계의 종류 — 단락: 헤더 바로 다음 턴 · 문장: 앞 턴이 서술로 끝남 · 질문 뒤: 앞 턴이 질문으로 끝남(대답과 갈라짐 — 최악) */
export type CutKind = "단락" | "문장" | "질문 뒤";
const CUT_COST: Record<CutKind, number> = { 단락: 0, 문장: 1, "질문 뒤": 5 };
const CHUNK_COST = 4; // 요청 하나(이음새 하나)의 비용 — "질문 뒤" 한 곳을 피하려면 요청을 하나 늘여도 되고, "문장" 몇 곳을 "단락"으로 바꾸려고 늘이지는 않는다

export function cutKind(prev: ScriptTurn, next: ScriptTurn): CutKind {
  if (next.blockStart) return "단락";
  return /[?？][\s"'”’」』)\]]*$/.test(prev.text) ? "질문 뒤" : "문장";
}

/**
 * 턴 → 분할 요청 묶음 (요청당 권장 2,000자 — 문서 기준. 분할은 반드시 턴 경계, spec/06 3장).
 * 요청 사이 이음새는 무음으로 붙이는 유일한 곳이라(모델이 앞 요청을 모른다) **어디서 자르느냐**가 들리는 품질이다 (2026-09-21 박수헌).
 * 글자 수가 찰 때 자르지 않고, maxChars 이하 묶음들 중 [요청 수 × CHUNK_COST + 경계마다 CUT_COST] 최소를 고른다(동적 계획법):
 * 단락 헤더 다음 > 서술 뒤 > 질문 뒤 순으로 선호하고, 요청 수는 질문·대답을 가르는 것을 피할 때만 늘어난다.
 * 한 턴이 maxChars 를 넘으면 그 턴만 단독 요청(종전과 같음). `isolate` 에 있는 턴은 단독 요청으로 뗀다 (현재 사용처 없음).
 */
export function chunkTurns(turns: ScriptTurn[], maxChars = 1800, isolate: Set<string> = new Set()): ScriptTurn[][] {
  const chunks: ScriptTurn[][] = [];
  let run: ScriptTurn[] = [];
  const flushRun = () => { if (run.length) { chunks.push(...chunkRun(run, maxChars)); run = []; } };
  for (const t of turns) {
    if (t.id && isolate.has(t.id)) { flushRun(); chunks.push([t]); continue; }
    run.push(t);
  }
  flushRun();
  return chunks;
}

function chunkRun(run: ScriptTurn[], maxChars: number): ScriptTurn[][] {
  const n = run.length;
  const best: { cost: number; prev: number }[] = [{ cost: 0, prev: -1 }];
  for (let i = 1; i <= n; i++) {
    best[i] = { cost: Infinity, prev: -1 };
    let len = 0;
    for (let j = i - 1; j >= 0; j--) {
      len += run[j].text.length;
      if (len > maxChars && i - j > 1) break;
      const cost = best[j].cost + CHUNK_COST + (j > 0 ? CUT_COST[cutKind(run[j - 1], run[j])] : 0);
      if (cost < best[i].cost) best[i] = { cost, prev: j };
    }
  }
  const out: ScriptTurn[][] = [];
  for (let i = n; i > 0; i = best[i].prev) out.unshift(run.slice(best[i].prev, i));
  return out;
}

/** 묶음 경계의 종류 목록 (실행 기록·청취 확인용) — 첫 묶음 앞은 경계가 아니다 */
export function describeCuts(chunks: ScriptTurn[][]): CutKind[] {
  return chunks.slice(1).map((c, n) => cutKind(chunks[n][chunks[n].length - 1], c[0]));
}
