/**
 * TTS 입력 정규화 (spec/06 4장·6장) — 표기 이원화: 대본은 가독 표기(AI, 17,000), TTS 입력만 한글 발음.
 * 음차 사전은 이 파일에 없다: 전역 사전(DB prompt_assets skills/tts/pronunciation.json, assets.ts loadTtsDict)과
 * 에피소드 발음 맵(episodes/{id}/pronunciations.json)을 병합해 인자로 받는다 — 겹치면 전역이 이긴다 (spec/06 6장).
 * 치환 후에도 영문·URL 이 남으면 사전 누락이므로 합성을 중단한다 (잔존 검사) — 웹에서 사전·맵 추가 후 재시도.
 * 글로벌판(PIPELINE_LOCALE=en, 글로벌 명세 6.7·KAN-203)은 사전이 "한국어 로마자 표기 → 영어 TTS 가 맞게 읽는 철자"이고, 숫자·기호는 ElevenLabs 가 영어로 읽게 둔다.
 * 영문 잔존 검사 대신 발음 누락 검사(missingPronunciations)로 멈춘다.
 */
import { pipelineLocale, type PipelineLocale } from "@ear/pipeline";

/** ElevenLabs 오디오 태그 (spec/06 5장) — 정규화·잔존 검사에서 건드리지 않는다 */
const AUDIO_TAG = /\[(curious|surprised|sighs|exhales|laughs|whispers|excited|chuckles)\]/g;

// 태그 보호 플레이스홀더 — 인덱스를 문자(A~Z, 26진)로 인코딩한다: 숫자면 4단계 숫자 변환에 먹힌다
const encIdx = (i: number) => i.toString(26).split("").map((c) => String.fromCharCode(65 + parseInt(c, 26))).join("");
const decIdx = (k: string) => parseInt(k.split("").map((c) => (c.charCodeAt(0) - 65).toString(26)).join(""), 26);

const SINO = ["", "일", "이", "삼", "사", "오", "육", "칠", "팔", "구"];
const UNIT4 = ["", "십", "백", "천"];
const UNIT_BIG = ["", "만", "억", "조"];

/** 정수 → 한자어 수사 ("천삼백" — 만 단위 앞의 "일"은 관례대로 생략: 1300 → 천삼백, 17000 → 만 칠천) */
export function sinoKorean(n: number): string {
  if (!Number.isFinite(n) || n < 0) return String(n);
  if (n === 0) return "영";
  const groups: number[] = [];
  let x = Math.floor(n);
  while (x > 0) { groups.push(x % 10000); x = Math.floor(x / 10000); }
  const parts: string[] = [];
  for (let g = groups.length - 1; g >= 0; g--) {
    const v = groups[g];
    if (!v) continue;
    let s = "";
    for (let p = 3; p >= 0; p--) {
      const d = Math.floor(v / 10 ** p) % 10;
      if (!d) continue;
      s += (d === 1 && p > 0 ? "" : SINO[d]) + UNIT4[p];
    }
    if (g > 0 && v === 1) s = ""; // 1만 → 만, 1억 → 억
    parts.push(s + UNIT_BIG[g]);
  }
  return parts.join(" ");
}

/** 숫자 표기 → 읽기 ("17,000" → "만 칠천" · "3.5" → "삼 점 오") */
function numberToKorean(raw: string): string {
  const clean = raw.replace(/,/g, "");
  const [intPart, decPart] = clean.split(".");
  let out = sinoKorean(Number(intPart));
  if (decPart) out += " 점 " + [...decPart].map((d) => (d === "0" ? "영" : SINO[Number(d)])).join(" ");
  return out;
}

/** 대본 텍스트 한 덩이 → TTS 입력. dict = 병합 음차 사전 (전역 + 에피소드 맵). 오디오 태그·말줄임표는 보존한다 */
export function normalizeForTts(text: string, dict: Record<string, string>, locale: PipelineLocale = pipelineLocale()): string {
  if (locale === "en") return normalizeEn(text, dict);
  // 1) 오디오 태그 보호
  const tags: string[] = [];
  let t = text.replace(AUDIO_TAG, (m) => { tags.push(m); return `⟦${encIdx(tags.length - 1)}⟧`; }); // ⟦⟧: 사전·숫자·공백 단계가 건드리지 않는 전용 괄호
  // 2) 음차 사전 (긴 항목 우선, 단어 경계 — 영문은 앞뒤가 영숫자가 아닐 때만)
  for (const [k, v] of Object.entries(dict).sort((a, b) => b[0].length - a[0].length)) {
    const esc = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    t = t.replace(new RegExp(`(?<![A-Za-z0-9])${esc}(?![A-Za-z0-9])`, "g"), v);
  }
  // 3) 단위·기호
  t = t.replace(/%/g, "퍼센트").replace(/&/g, " 앤 ").replace(/\+/g, " 플러스 ");
  // 4) 숫자 (연도 포함 — "2026년" → "이천이십육년". 소수·콤마 지원)
  t = t.replace(/\d[\d,]*(?:\.\d+)?/g, (m) => numberToKorean(m));
  // 5) 공백 정리 + 태그 복원
  t = t.replace(/[ \t]{2,}/g, " ").trim();
  t = t.replace(/⟦([A-Z]+)⟧/g, (_, k: string) => tags[decIdx(k)] ?? "");
  return t;
}

/** 잔존 검사 (spec/06 4장) — 치환 후 남은 영문·URL·표. 남았다는 것은 사전 누락 = 합성 중단 사유 */
export function residualIssues(text: string, locale: PipelineLocale = pipelineLocale()): string[] {
  const issues: string[] = [];
  const noTags = text.replace(AUDIO_TAG, "");
  for (const m of noTags.match(/https?:\/\/\S+/g) ?? []) issues.push(`URL 잔존: ${m}`);
  if (locale === "en") { if (/\|.*\|/.test(noTags)) issues.push("표 형태 잔존"); return issues; } // 영어 대본은 영문이 본문이다 — 표기 누락은 발음 누락 검사가 본다
  for (const m of noTags.match(/[A-Za-z][A-Za-z0-9.'&-]*(?: [A-Za-z][A-Za-z0-9.'&-]*)*/g) ?? []) issues.push(`영문 잔존(사전 추가 필요): ${m}`);
  if (/\|.*\|/.test(noTags)) issues.push("표 형태 잔존");
  return issues;
}

/**
 * 글로벌판 정규화 — 발음 사전 치환(한 번에, 대소문자 무시) · 원화 금액 · 공백. 오디오 태그는 보존한다.
 * 한 번에 치환하는 이유: 영어 철자 힌트("tteok-bok-ki")가 다시 다른 표제어에 걸리지 않게(한국판은 값이 한글이라 겹칠 일이 없다)
 */
function normalizeEn(text: string, dict: Record<string, string>): string {
  const tags: string[] = [];
  let t = text.replace(AUDIO_TAG, (m) => { tags.push(m); return `⟦${encIdx(tags.length - 1)}⟧`; });
  const hints = new Map(Object.entries(dict).filter(([k, v]) => k.trim() && v.trim()).map(([k, v]) => [k.toLowerCase(), v]));
  if (hints.size) {
    const alt = [...hints.keys()].sort((a, b) => b.length - a.length).map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
    t = t.replace(new RegExp(`(?<![A-Za-z0-9⟦])(?:${alt})(?![A-Za-z0-9⟧])`, "gi"), (m) => hints.get(m.toLowerCase()) ?? m);
  }
  // 원화 (글로벌 명세 6.4 표기: 원화 금액은 KRW 로만 쓴다) — "KRW 5,000"·"₩5,000" → "5,000 won", 금액 없는 "KRW" → "Korean won"
  t = t.replace(/(?:\bKRW|₩)\s?(\d+(?:,\d{3})*(?:\.\d+)?(?:\s(?:thousand|million|billion|trillion)\b)?)/g, "$1 won").replace(/\bKRW\b/g, "Korean won");
  t = t.replace(/[ \t]{2,}/g, " ").trim();
  return t.replace(/⟦([A-Z]+)⟧/g, (_, k: string) => tags[decIdx(k)] ?? "");
}

/** 병합 사전 (spec/06 6장) — 겹치면 전역이 이긴다. 글로벌판은 표기 대소문자를 무시하고(Hanbok = hanbok) 힌트가 빈 항목을 뺀다 */
export function mergeTtsDict(epMap: Record<string, string>, globalDict: Record<string, string>, locale: PipelineLocale = pipelineLocale()): Record<string, string> {
  if (locale !== "en") return { ...epMap, ...globalDict };
  const out = new Map<string, [string, string]>();
  for (const src of [epMap, globalDict]) for (const [k, v] of Object.entries(src)) if (k.trim() && v.trim()) out.set(k.toLowerCase(), [k, v]);
  return Object.fromEntries(out.values());
}

/**
 * 발음 누락 (글로벌 명세 6.7) — 설계 단계가 대본의 한국어 단어를 에피소드 발음 맵에 전부 등재하고, 힌트를 못 단 단어는 값을 빈 문자열로 둔다.
 * 그중 전역 사전에도 힌트가 없는 표제어를 돌려준다(대소문자 무시) — 하나라도 있으면 합성하지 않는다. 대본에서 미등재 단어를 정규식으로 찾지 않는다(로마자 한국어는 영어와 구분되지 않는다)
 */
export function missingPronunciations(epMap: Record<string, string>, globalDict: Record<string, string>): string[] {
  const known = new Set(Object.entries(globalDict).filter(([, v]) => v.trim()).map(([k]) => k.toLowerCase()));
  return Object.entries(epMap).filter(([k, v]) => !v.trim() && !known.has(k.toLowerCase())).map(([k]) => k);
}
