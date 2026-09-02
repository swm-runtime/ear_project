/**
 * TTS 입력 정규화 (spec/06 4장·6장) — 표기 이원화: 대본은 가독 표기(AI, 17,000), TTS 입력만 한글 발음.
 * 이 파일의 사전이 곧 표준 음차 사전이다 — 어색한 합성이 나오면 여기를 고쳐 다음 에피소드부터 재사용한다.
 * 치환 후에도 영문·URL 이 남으면 사전 누락이므로 합성을 중단하고 항목을 추가한다 (잔존 검사).
 */

/** 표준 음차 사전 — 대본에 등장 이력이 있는 항목부터. 긴 항목을 먼저 치환한다(부분 겹침 방지) */
export const PRONUNCIATION: Record<string, string> = {
  // 기술·서비스
  "HuggingFace": "허깅페이스",
  "GitHub": "깃허브",
  "ChatGPT": "챗지피티",
  "OpenAI": "오픈에이아이",
  "AI": "에이아이",
  "IT": "아이티",
  "UX": "유엑스",
  "UI": "유아이",
  "API": "에이피아이",
  "CEO": "씨이오",
  "TV": "티비",
  "PC": "피씨",
  "SNS": "에스엔에스",
  "DNA": "디엔에이",
  "GPS": "지피에스",
  // 기관·매체 (대본 등장 이력)
  "UC Berkeley": "유씨 버클리",
  "Othering & Belonging Institute": "아더링 앤 빌롱잉 인스티튜트",
  "Greater Good Science Center": "그레이터 굿 사이언스 센터",
  "Greater Good": "그레이터 굿",
  "Gallup": "갤럽",
  "Stanford": "스탠퍼드",
  "University of Chicago": "시카고 대학교",
  "US Chamber of Connection": "유에스 체임버 오브 커넥션",
  "Welcome Committee": "웰컴 커미티",
  "The Science of Happiness": "더 사이언스 오브 해피니스",
  "JSTOR Daily": "제이스토어 데일리",
  // 인명 (대본 등장 이력)
  "john a. powell": "존 파월",
  "powell": "파월",
  "Stuart Muszynski": "스튜어트 무진스키",
  "Jamil Zaki": "자밀 자키",
  "Carl Weems": "칼 윔스",
  "Weems": "윔스",
  "Nicholas Epley": "니컬러스 에플리",
  "Epley": "에플리",
  "Aaron Hurst": "에런 허스트",
  "Hurst": "허스트",
  "Hansen": "핸슨",
  "Dacher Keltner": "대커 켈트너",
  "Chris": "크리스",
  "Rachel": "레이철",
  // 인사말 (골드·조사에서 등장)
  "happy spring": "해피 스프링",
  "Hi": "하이",
};

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

/** 대본 텍스트 한 덩이 → TTS 입력. 오디오 태그·말줄임표는 보존한다 */
export function normalizeForTts(text: string): string {
  // 1) 오디오 태그 보호
  const tags: string[] = [];
  let t = text.replace(AUDIO_TAG, (m) => { tags.push(m); return `⟦${encIdx(tags.length - 1)}⟧`; }); // ⟦⟧: 사전·숫자·공백 단계가 건드리지 않는 전용 괄호
  // 2) 음차 사전 (긴 항목 우선, 단어 경계 — 영문은 앞뒤가 영숫자가 아닐 때만)
  for (const [k, v] of Object.entries(PRONUNCIATION).sort((a, b) => b[0].length - a[0].length)) {
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
