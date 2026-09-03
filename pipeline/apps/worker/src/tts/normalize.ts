/**
 * TTS 입력 정규화 (spec/06 4장·6장) — 표기 이원화: 대본은 가독 표기(AI, 17,000), TTS 입력만 한글 발음.
 * 음차 사전은 이 파일에 없다: 전역 사전(DB prompt_assets skills/tts/pronunciation.json, assets.ts loadTtsDict)과
 * 에피소드 발음 맵(episodes/{id}/pronunciations.json)을 병합해 인자로 받는다 — 겹치면 전역이 이긴다 (spec/06 6장).
 * 치환 후에도 영문·URL 이 남으면 사전 누락이므로 합성을 중단한다 (잔존 검사) — 웹에서 사전·맵 추가 후 재시도.
 */

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
export function normalizeForTts(text: string, dict: Record<string, string>): string {
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
export function residualIssues(text: string): string[] {
  const issues: string[] = [];
  const noTags = text.replace(AUDIO_TAG, "");
  for (const m of noTags.match(/https?:\/\/\S+/g) ?? []) issues.push(`URL 잔존: ${m}`);
  for (const m of noTags.match(/[A-Za-z][A-Za-z0-9.'&-]*(?: [A-Za-z][A-Za-z0-9.'&-]*)*/g) ?? []) issues.push(`영문 잔존(사전 추가 필요): ${m}`);
  if (/\|.*\|/.test(noTags)) issues.push("표 형태 잔존");
  return issues;
}
