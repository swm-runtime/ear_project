/**
 * 기획 시리즈 설계안 (spec/11 3장 · 글로벌 명세 6.11, KAN-136) — 관리자가 준 주제·범위로 편 목록 초안을 만든다. 단발 호출, 도구 없음.
 * 사람이 시리즈 화면에서 고친 뒤 [승인](게이트 S)한다. 편수 상한은 없다(2026-10-17 박수헌) — 관리자가 편수를 주면 그 수를 지킨다.
 * 한국판은 한국어, 글로벌판은 영어로 묻는다(모델이 읽는 글은 그 판의 언어 — 글로벌 명세 4.5).
 */

export interface SeriesPlanInput {
  midTopic: string;
  /** 관리자가 준 시리즈 이름안 */
  name: string;
  /** 다룰 범위 설명·메모 */
  scopeNote: string;
  /** 관리자가 정한 편수 — 없으면 범위에서 정한다 */
  episodes?: number | null;
}

export interface SeriesPlanEpisode { no: number; title: string; scope: string; carries: string; only_here: string; minutes: number; /** 짧은 판 시리즈(0041): 이 편이 나온 원본 편 번호 — 소스를 그 편에서 물려받는다. 일반 시리즈는 없다 */ from_no?: number }
export interface SeriesPlanOut { name: string; intro_line: string; episodes: SeriesPlanEpisode[]; notes: string }

export const SERIES_PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["name", "intro_line", "episodes", "notes"],
  properties: {
    name: { type: "string" },
    intro_line: { type: "string" },
    episodes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["no", "title", "scope", "carries", "only_here", "minutes"],
        properties: {
          no: { type: "integer" },
          title: { type: "string" },
          scope: { type: "string" },
          carries: { type: "string" },
          only_here: { type: "string" },
          minutes: { type: "number" },
        },
      },
    },
    notes: { type: "string" },
  },
} as const;

export function buildSeriesPlanPrompt(i: SeriesPlanInput): string {
  const count = i.episodes ? `${i.episodes}편 — 관리자가 정했다. 이 수를 지킨다.` : "정하지 않았다 — 범위를 보고 정한다. 상한은 없다.";
  return `너는 오디오 콘텐츠 서비스 "이어(ear)"의 시리즈 기획자다. 대본은 쓰지 않는다. 관리자가 준 주제와 범위로 여러 편짜리 시리즈의 편 목록을 짠다.

## 입력
- 중분류: ${i.midTopic}
- 시리즈 이름안: ${i.name}
- 다룰 범위·메모:
${i.scopeNote}
- 편수: ${count}

## 규칙
- 편은 각자 완결된 정규 에피소드다. 한 편은 13분 이상이다. 범위가 얇아 13분이 안 되는 편은 이웃 편과 합친다.
- 같은 개념은 한 편에서만 자세히 다룬다. 다른 편에서는 한 문장으로 가리키기만 한다.
- 앞 편이 뒤 편의 바탕이 되게 순서를 잡는다.
- 편 제목은 주제 이름으로 쓴다. 장면·질문·낚시 제목은 쓰지 않는다.
- 교재·시험 범위 같은 자료는 범위 확인용으로만 쓴다. 문장·예시·목차 순서를 옮기지 않는다.
- 시리즈 이름은 짧은 명사구다. 콘텐츠 제목은 "{시리즈 이름} N - {편 제목}"이 된다. 이름안이 좋으면 그대로 쓴다.
- 한 줄 소개는 이 시리즈가 무엇을 다루는지 말하는 한 문장이다. 인트로에서 읽는다.
- scope 와 only_here 에는 개념만 적는다. 기업·캠페인·사건 같은 사례는 "예: ○○" 로만 적고 필수로 못 박지 않는다. 사례는 소스 본문에 있을 때만 쓰고, 없으면 소스에 있는 다른 사례로 바뀐다.

## 출력 — 요청한 JSON만
- episodes: 1화부터 순서대로. no 는 1부터 이어지는 번호다.
  - scope: 이 편이 다룰 개념을 쉼표로 나열한다.
  - carries: 앞 편에서 이어받는 것. 1화는 빈 문자열이다.
  - only_here: 이 편에서만 자세히 다룰 것. 다른 편은 이것을 자세히 다루지 않는다.
  - minutes: 예상 분량(분).
- notes: 합치거나 나눈 편과 그 이유, 범위에서 뺀 것. 없으면 빈 문자열.`;
}

export function buildSeriesPlanPromptEn(i: SeriesPlanInput): string {
  const count = i.episodes ? `${i.episodes} episodes. The admin set this number. Keep it.` : "Not set. Decide from the scope. There is no upper limit.";
  return `You plan series for "ear", an audio service that makes two-person English episodes about Korean culture for listeners new to Korea. You do not write scripts. From the admin's topic and scope, plan the episode list of a multi-episode series.

## Input
- Main topic: ${i.midTopic}
- Working series name: ${i.name}
- Scope and notes:
${i.scopeNote}
- Episode count: ${count}

## Rules
- Each episode is a complete regular episode of at least 5 minutes. Merge an episode whose scope is too thin with a neighbor.
- Each concept is covered in depth in one episode only. Other episodes point to it in one sentence at most.
- Order the episodes so earlier ones are the base for later ones.
- Episode titles name the topic. No scene, question, or clickbait titles.
- Use textbooks or exam outlines only to check scope. Do not copy their sentences, examples, or table-of-contents order.
- The series name is a short noun phrase. Content titles become "{series name} N - {episode title}". Keep the working name if it works.
- The intro line is one sentence that says what the series covers. The host reads it in the intro.
- Write every value in English. Korean words use Revised Romanization.
- scope and only_here hold concepts only. Name companies, campaigns, or events only as "e.g. X" and never as a requirement. A case is used only when a source body covers it; otherwise another case from the sources takes its place.

## Output — only the requested JSON
- episodes: in order from episode 1. no counts up from 1.
  - scope: the concepts this episode covers, separated by commas.
  - carries: what it takes from earlier episodes. Empty for episode 1.
  - only_here: what only this episode covers in depth. Other episodes do not cover it in depth.
  - minutes: estimated length in minutes.
- notes: merged or split episodes and why, and what was left out of scope. Empty if none.`;
}

/** 모델 출력 정리 — 번호를 1부터 다시 매기고 빈 제목을 뺀다. 분량은 양수만 */
export function normalizeSeriesPlan(eps: SeriesPlanEpisode[]): SeriesPlanEpisode[] {
  return eps
    .filter((e) => String(e.title ?? "").trim())
    .map((e, k) => ({ no: k + 1, title: String(e.title).trim(), scope: String(e.scope ?? "").trim(), carries: k === 0 ? "" : String(e.carries ?? "").trim(), only_here: String(e.only_here ?? "").trim(), minutes: Number(e.minutes) > 0 ? Math.round(Number(e.minutes)) : 0 }));
}

// ── 짧은 판 시리즈 설계안 (KAN-296, 0041 — 2026-10-30 박수헌 "편을 나눠 설계안을 다시 짠다") ──────────────────
// 원본 시리즈의 편 하나는 13~24분 분량이라 짧은 판(5~12분·핵심 하나)으로 1:1 줄이면 "이 편에서만 다룰 것"이 빠지고, 다른 편은 그 개념을 다루지 않으니 시리즈에서 사라진다.
// 원본 편을 개념 단위로 1~3편으로 나눠 범위를 지킨다. 새 편은 원본 편 하나에서만 나온다(from_no) — 후보가 그 편의 소스를 물려받기 때문이다.

export const SHORT_SERIES_PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["episodes", "notes"],
  properties: {
    episodes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["no", "from_no", "title", "scope", "carries", "only_here", "minutes"],
        properties: {
          no: { type: "integer" },
          from_no: { type: "integer" },
          title: { type: "string" },
          scope: { type: "string" },
          carries: { type: "string" },
          only_here: { type: "string" },
          minutes: { type: "number" },
        },
      },
    },
    notes: { type: "string" },
  },
} as const;

export interface ShortSeriesPlanInput {
  name: string;
  midTopic: string;
  /** 원본 시리즈 설계안 */
  original: SeriesPlanEpisode[];
  /** 원본 편 번호 → 그 편 소스의 "발행처 — 제목" 목록 */
  sources: Record<number, string[]>;
  /** 짧은 판 분량 범위(분) */
  minMinutes: number;
  maxMinutes: number;
}

export function buildShortSeriesPlanPrompt(i: ShortSeriesPlanInput): string {
  const orig = i.original.map((e) => `### 원본 ${e.no}화 — ${e.title} (${e.minutes}분)
- 범위: ${e.scope}
- 이 편에서만 자세히: ${e.only_here}
- 소스: ${(i.sources[e.no] ?? []).join(" / ") || "없음"}`).join("\n\n");
  return `너는 오디오 콘텐츠 서비스 "이어(ear)"의 시리즈 기획자다. 대본은 쓰지 않는다. 발행된 시리즈를 짧은 편들로 다시 나눈 편 목록을 짠다.

## 입력 — 원본 시리즈 "${i.name}" (중분류 ${i.midTopic}, ${i.original.length}편)
${orig}

## 규칙
- 새 시리즈의 편은 ${i.minMinutes}분 이상 ${i.maxMinutes}분 이하다. 한 편은 핵심 개념 하나를 기제까지 설명한다.
- 원본 편 하나를 개념 단위로 1편 이상 3편 이하로 나눈다. 원본 편의 "이 편에서만 자세히" 개념은 하나도 빠뜨리지 않는다.
- 원본 시리즈가 다룬 범위를 넓히지 않는다. 원본 범위에 없는 개념은 새 편으로 만들지 않는다.
- 새 편은 원본 편 하나에서만 나온다. from_no 에 그 원본 편 번호를 적는다. 두 원본 편의 개념을 한 편에 섞지 않는다.
- 편 순서는 원본 편 순서를 따른다. from_no 는 줄어들지 않는다.
- 같은 개념은 한 편에서만 자세히 다룬다. 다른 편에서는 한 문장으로 가리키기만 한다.
- 범위가 얇아 ${i.minMinutes}분이 안 되는 개념은 같은 원본 편의 이웃 개념과 합친다.
- 편 제목은 주제 이름으로 쓴다. 장면·질문·낚시 제목은 쓰지 않는다.
- scope 와 only_here 에는 개념만 적는다. 사례는 "예: ○○" 로만 적는다.

## 출력 — 요청한 JSON만
- episodes: 1화부터 순서대로. no 는 1부터 이어지는 번호다.
  - from_no: 이 편이 나온 원본 편 번호.
  - scope: 이 편이 다룰 개념을 쉼표로 나열한다. 2개 이상 4개 이하.
  - carries: 앞 편에서 이어받는 것. 1화는 빈 문자열이다.
  - only_here: 이 편에서만 자세히 다룰 개념. 1개 이상 2개 이하.
  - minutes: 예상 분량(분).
- notes: 원본 편마다 몇 편으로 나눴는지와 이유, 합친 것. 없으면 빈 문자열.`;
}

/** 짧은 판 설계안 정리 — 번호를 다시 매기고, from_no 를 원본 범위로 묶고, from_no 가 줄어드는 편을 앞 편 원본에 붙인다. 원본 편 가운데 빠진 번호를 돌려준다 */
export function normalizeShortSeriesPlan(eps: SeriesPlanEpisode[], originalTotal: number, maxMinutes: number): { plan: SeriesPlanEpisode[]; missing: number[] } {
  let last = 1;
  const plan = eps
    .filter((e) => String(e.title ?? "").trim())
    .map((e, k) => {
      let from = Math.round(Number(e.from_no));
      if (!Number.isFinite(from) || from < 1 || from > originalTotal) from = last;
      if (from < last) from = last;
      last = from;
      const min = Number(e.minutes) > 0 ? Math.round(Number(e.minutes)) : maxMinutes;
      return { no: k + 1, from_no: from, title: String(e.title).trim(), scope: String(e.scope ?? "").trim(), carries: k === 0 ? "" : String(e.carries ?? "").trim(), only_here: String(e.only_here ?? "").trim(), minutes: Math.min(min, maxMinutes) };
    });
  const seen = new Set(plan.map((e) => e.from_no));
  const missing = Array.from({ length: originalTotal }, (_, k) => k + 1).filter((n) => !seen.has(n));
  return { plan, missing };
}

/**
 * 짧은 판 시리즈 편 기획 (2026-10-30 박수헌 "재제작도 기획부터 하고 거기에 맞는 자료를 찾는다") — 편 후보는 일반 시리즈 편과 같은 주제 기획(B-②)이 만든다.
 * 원본 편(from_no)의 소스는 버리지 않고 판정에 우선 후보로 함께 넣는다. 아래는 그 기획 작업이 쓰는 값들이다(stages/topic-seed.ts).
 */
export function shortSeriesFromNo(plan: SeriesPlanEpisode[], no: number): number {
  const ep = plan.find((e) => e.no === no);
  if (!ep?.from_no) throw new Error(`짧은 판 시리즈 설계안에 ${no}화의 원본 편 번호(from_no)가 없다`);
  return ep.from_no;
}
/** 짧은 판 시리즈 편의 콘텐츠 제목 — 원본 시리즈 편과 같은 꼴 */
export function shortSeriesEpisodeTitle(name: string, no: number, title: string): string {
  return `${name} ${no} — ${title}`;
}
/** 검색·판정 힌트에 덧붙이는 줄 — 검색은 원본 소스가 다루지 않는 개념을 찾고, 판정은 범위에 맞는 원본 소스를 먼저 쓴다 */
export function shortSeriesSeedHint(origTitle: string, seeds: { title: string; publisher: string }[]): string {
  const list = seeds.map((x) => `${x.publisher} — ${x.title}`).join(" · ");
  return `짧은 판(5~12분) 편이다. 원본 편 "${origTitle}"의 소스 ${seeds.length}건이 판정 후보에 함께 들어간다${list ? `: ${list}` : ""}.\n검색은 이 소스들이 다루지 않는 이 편 범위의 개념을 찾는다.\n판정은 이 편 범위에 맞는 원본 소스를 먼저 쓰고, 범위에 맞지 않는 원본 소스는 뺀다.`;
}

/**
 * 계층 쌓기 층(series.thumb_layers "이름:시작-끝, …")을 짧은 판 시리즈의 새 편 번호로 옮긴다 — 원본 편 범위에 속한 새 편들의 최소~최대 번호.
 * fromNos[k] = 새 (k+1)화의 원본 편 번호. 새 편이 하나도 없는 층은 뺀다. 입력이 비거나 형식이 아니면 null
 */
export function remapLayers(text: string | null | undefined, fromNos: number[]): string | null {
  const parts = String(text ?? "").split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
  const out: string[] = [];
  for (const part of parts) {
    const m = part.match(/^(.+?)\s*[:：]\s*(\d+)\s*[-~–]\s*(\d+)$/);
    if (!m) return null;
    const a = Number(m[2]), b = Number(m[3]);
    const news = fromNos.map((f, k) => (f >= a && f <= b ? k + 1 : 0)).filter(Boolean);
    if (news.length) out.push(`${m[1].trim()}:${Math.min(...news)}-${Math.max(...news)}`);
  }
  return out.length ? out.join(", ") : null;
}

// ── 시리즈 편 대본 (spec/11 5장 · 글로벌 명세 6.11, KAN-136 4단계) ──────────────────

/** 시리즈 편 하나의 대본 맥락 — 워커가 시리즈 행·설계안·앞 편 구성안에서 만든다. 일반 편은 undefined 라 프롬프트가 바뀌지 않는다 */
export interface SeriesDraftContext {
  name: string;
  introLine: string;
  no: number;
  total: number;
  scope: string;
  onlyHere: string;
  carries: string;
  /** 형제 편이 자세히 다룰 것 — 이 편은 구간으로 잡지 않는다 */
  elsewhere: { no: number; title: string; onlyHere: string }[];
  /** 앞 편(2화부터) — 제목 + 구성안의 축·구간 질문. 회상의 유일한 재료. fromPlan 이면 앞 편 구성안 대신 시리즈 설계안의 범위(짧은 판 시리즈 — 편끼리 기다리지 않는다, 2026-10-30) */
  prev: { title: string; axis: string; questions: string[]; fromPlan?: boolean } | null;
  /** 다음 편 제목(마지막 화 제외) — 예고 문장에 워커가 넣는다 */
  nextTitle: string | null;
  /** 인트로 시리즈 줄 — 대주제 줄({대주제 한 줄} · {topic_line}) 자리에 토씨 그대로 */
  introSentence: string;
  /** 클로징 인사의 고정 문장 — 예고(series_next) 또는 맺음(series_finale) */
  closingSentence: string;
  /** 회상 재료를 넣은 claims 행 ID (2화부터) — 도입 첫 해설 턴의 turn_claims 에 들어가야 한다 */
  recapClaimId: string | null;
  /** 규칙 자산 skills/draft/series.md 본문 */
  rules: string;
}

/** 시리즈 템플릿 (settings templates 의 선택 칸, spec/11 5.2). 비어 있으면 아래 기본 문구 */
export interface SeriesTemplates { series_intro_line?: string; series_next?: string; series_finale?: string }
export const SERIES_TEMPLATE_DEFAULTS = {
  ko: { series_intro_line: "{intro_line} 시리즈, {name}의 {nth} 시간입니다.", series_next: "다음 시간에는 '{next_title}'에 대해 이야기합니다.", series_finale: "{name} 시리즈는 여기까지입니다." },
  en: { series_intro_line: "This is episode {n} of our series {name}. {intro_line}", series_next: "Next time, we'll talk about {next_title}.", series_finale: "That brings our series {name} to a close." },
} as const;

const KO_ORD_ONES = ["", "한", "두", "세", "네", "다섯", "여섯", "일곱", "여덟", "아홉"];
const KO_ORD_TENS = ["", "열", "스물", "서른", "마흔", "쉰", "예순", "일흔", "여든", "아흔"];
/** 1 → "첫 번째", 7 → "일곱 번째", 20 → "스무 번째", 21 → "스물한 번째". 100 이상은 숫자로 */
export function koreanOrdinal(n: number): string {
  if (n === 1) return "첫 번째";
  if (n < 1 || n >= 100 || !Number.isInteger(n)) return `${n}번째`;
  const t = Math.floor(n / 10), o = n % 10;
  const tens = t === 2 && o === 0 ? "스무" : KO_ORD_TENS[t];
  return `${tens}${KO_ORD_ONES[o]} 번째`;
}

const fill = (tpl: string, v: Record<string, string>) => tpl.replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m)).replace(/\s+/g, " ").trim();

export function seriesSentences(t: SeriesTemplates | null | undefined, s: { name: string; introLine: string; no: number; total: number; nextTitle: string | null }, en: boolean): { intro: string; closing: string } {
  const d = en ? SERIES_TEMPLATE_DEFAULTS.en : SERIES_TEMPLATE_DEFAULTS.ko;
  // 한국판 기본 문구는 한 줄 소개 뒤에 "시리즈"가 붙으므로 끝 마침표를 뗀다. 영어 기본 문구는 문장 그대로 둔다
  const v = { name: s.name, intro_line: en ? s.introLine.trim() : s.introLine.trim().replace(/[.。]\s*$/, ""), n: String(s.no), nth: koreanOrdinal(s.no), total: String(s.total), next_title: s.nextTitle ?? "" };
  const intro = fill(t?.series_intro_line?.trim() || d.series_intro_line, v);
  const closing = fill(s.nextTitle ? t?.series_next?.trim() || d.series_next : t?.series_finale?.trim() || d.series_finale, v);
  return { intro, closing };
}

/** 설계 단계 블록 — 이 편 범위와 형제 편 범위. 형제 편이 자세히 다룰 것은 구간으로 잡지 않는다 */
export function seriesDesignBlock(s: SeriesDraftContext | undefined, en: boolean): string {
  if (!s) return "";
  const others = s.elsewhere.map((e) => `${e.no}. ${e.title}${e.onlyHere ? ` — ${e.onlyHere}` : ""}`).join("\n");
  return en
    ? `\n\n## Series episode — ${s.name}, episode ${s.no} of ${s.total}
${s.rules}
- This episode covers: ${s.scope}${s.onlyHere ? `\n- Only this episode covers in depth: ${s.onlyHere}` : ""}${s.carries ? `\n- Builds on earlier episodes: ${s.carries}` : ""}
- "Only this episode covers in depth" is a concept boundary. A case named there is used only when a source body covers it; otherwise use a case from the sources and keep the concept scope.
- Other episodes cover these in depth. Do not build a section on them; name one in a sentence at most when needed:
${others}`
    : `\n\n## 시리즈 편 — ${s.name} ${s.total}편 중 ${s.no}화
${s.rules}
- 이 편의 범위: ${s.scope}${s.onlyHere ? `\n- 이 편에서만 자세히 다룰 것: ${s.onlyHere}` : ""}${s.carries ? `\n- 앞 편에서 이어받는 것: ${s.carries}` : ""}
- "이 편에서만 자세히 다룰 것"은 개념 경계다. 거기 적힌 사례는 소스 본문에 있을 때만 쓰고, 없으면 소스에 있는 사례로 대체한다. 개념 범위는 유지한다.
- 다른 편이 자세히 다루는 것. 구간으로 잡지 않고, 필요하면 한 문장으로 부르고 넘어간다:
${others}`;
}

/** 작성 단계 블록 — 회상(2화부터, 도입 첫 해설 턴)·예고/맺음(클로징 인사 첫 슬롯)·형제 편 범위 */
export function seriesWriteBlock(s: SeriesDraftContext | undefined, en: boolean): string {
  if (!s) return "";
  const others = s.elsewhere.map((e) => `${e.no}. ${e.title}`).join(en ? "; " : " · ");
  if (en) return `\n\n## Series episode — ${s.name}, episode ${s.no} of ${s.total}
${s.rules}
- Intro: the {topic_line} slot is exactly: "${s.introSentence}"
${s.prev && s.recapClaimId ? `- Recap: the first explainer turn of the Opening starts with one or two sentences that recall episode ${s.no - 1}, "${s.prev.title}". Use only claim ${s.recapClaimId}. List ${s.recapClaimId} in that turn's turn_claims.\n` : ""}- Sign-off: the last host turn is this exact sentence, then the sign-off line word for word, in one turn: "${s.closingSentence}" + the sign-off line. Do not drop either half.
- Other episodes cover these; do not explain them in depth here: ${others}`;
  return `\n\n## 시리즈 편 — ${s.name} ${s.total}편 중 ${s.no}화
${s.rules}
- 인트로: {대주제 한 줄} 자리는 정확히 이 문장이다: "${s.introSentence}"
${s.prev && s.recapClaimId ? `- 회상: 도입의 첫 해설 턴은 ${s.no - 1}화 "${s.prev.title}"를 떠올리는 한두 문장으로 시작한다. 재료는 claims ${s.recapClaimId} 하나뿐이다. 그 턴의 turn_claims 에 ${s.recapClaimId} 를 넣는다.\n` : ""}- 클로징 인사: 첫 {슬롯}은 이 문장으로 시작한다: "${s.closingSentence}"
- 다른 편이 다루는 것이니 이 편에서 자세히 풀지 않는다: ${others}`;
}

/**
 * 짧은 판 시리즈의 회상 재료 — 앞 편의 구성안 대신 시리즈 설계안의 그 편 범위 (2026-10-30 박수헌 "2번으로").
 * 앞 편을 기다리는 이유가 회상 한 문장뿐이라, 설계안에서 가져오면 편들이 동시에 초안을 잡는다(db.ts seriesPrevReady 가 짧은 판 시리즈는 기다리지 않는다)
 */
export function planRecap(prevEp: Pick<SeriesPlanEpisode, "title" | "scope" | "only_here">): { title: string; axis: string; questions: string[]; fromPlan: true } {
  const axis = (prevEp.only_here || prevEp.scope || prevEp.title).trim();
  const questions = prevEp.scope && prevEp.scope.trim() !== axis ? [prevEp.scope.trim()] : [];
  return { title: prevEp.title, axis, questions, fromPlan: true };
}

/** 회상 재료 — claims 행 문장과 sources.md 절. 앞 편 구성안의 축·구간 질문만 싣는다(QA 독립성: 다른 편의 대본·리포트는 넣지 않는다). 짧은 판 시리즈는 설계안의 범위(planRecap) */
export function seriesRecapMaterial(s: Pick<SeriesDraftContext, "name" | "no" | "prev">, en: boolean): { claim: string; section: string } | null {
  if (!s.prev) return null;
  const q = s.prev.questions.map((x) => `- ${x}`).join("\n");
  return en
    ? { claim: `Episode ${s.no - 1} of the series, "${s.prev.title}", explained: ${s.prev.axis}`, section: `## Series link — episode ${s.no - 1} (pipeline record of the previous episode's outline, not a source)\n- Series: ${s.name}\n- Title: ${s.prev.title}\n- Axis: ${s.prev.axis}\n- Section questions:\n${q}` }
    : { claim: `시리즈 ${s.no - 1}화 "${s.prev.title}"는 이것을 다뤘다: ${s.prev.axis}`, section: `## 시리즈 연결 재료 — ${s.no - 1}화 (앞 편 ${s.prev.fromPlan ? "시리즈 설계안" : "구성안"}의 파이프라인 기록, 소스 아님)\n- 시리즈: ${s.name}\n- 제목: ${s.prev.title}\n- 축: ${s.prev.axis}\n- 구간 질문:\n${q}` };
}

// ── 시리즈 범위 검사 (spec/11 6장 "L1 겹침 항목", 2026-10-17) ──────────────────────
// L1 지시 준수 층(spec/09 6.2)은 아직 코드가 없다 — 시리즈 편에만 도는 단발 검사로 둔다. 위반은 L0 수정 회차로 고치고,
// 한도 뒤 남으면 실패가 아니라 QA 로 넘긴다(표지가 RATIO_RULE_MARKS 에 있다 — 말맛과 같은 취급, 사실 위반이 아니다)

export const SERIES_SCOPE_MARK = { ko: "시리즈 범위:", en: "Series scope:" } as const;

export interface SeriesOverlapFinding { turn: string; concept: string; episode: number; quote: string }
export const SERIES_OVERLAP_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["findings"],
  properties: {
    findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["turn", "concept", "episode", "quote"],
        properties: { turn: { type: "string" }, concept: { type: "string" }, episode: { type: "integer" }, quote: { type: "string" } },
      },
    },
  },
} as const;

export function buildSeriesOverlapPrompt(i: { name: string; no: number; scope: string; onlyHere: string; elsewhere: { no: number; title: string; onlyHere: string }[]; scriptMd: string }, en: boolean): string {
  const list = i.elsewhere.filter((e) => e.onlyHere || e.title).map((e) => `- ${e.no}${en ? `. ${e.title}` : `화 ${e.title}`}${e.onlyHere ? `: ${e.onlyHere}` : ""}`).join("\n");
  return en
    ? `You check the scope of one episode script in a series. You do not edit the script.
This is episode ${i.no} of the series "${i.name}". Its own scope: ${i.scope}${i.onlyHere ? `; in depth only here: ${i.onlyHere}` : ""}.
Other episodes cover these in depth:
${list}

Find places where the script explains one of those concepts in depth.
- In depth means a whole turn spent on that concept, or three or more sentences in a row on its definition, how it works, or its cases.
- Naming it in one or two sentences, or pointing to another episode, is not a finding.
- An explanation that belongs to this episode's own scope is not a finding.
- Report only clear cases. If there are none, findings is empty.
- turn is the turn ID (E3). episode is the number of the episode that covers the concept. quote is a short exact quote from the script.

## Script
${i.scriptMd}`
    : `너는 시리즈 편 대본의 범위를 검사한다. 대본은 고치지 않는다.
이 편은 시리즈 "${i.name}"의 ${i.no}화다. 이 편의 범위: ${i.scope}${i.onlyHere ? ` · 이 편에서만 자세히: ${i.onlyHere}` : ""}.
다른 편이 자세히 다루는 개념:
${list}

대본에서 이 개념들을 자세히 푸는 곳을 찾는다.
- 자세히 푼다는 것은 한 턴 전체를 그 개념에 쓰거나, 그 개념의 정의·작동 방식·사례를 세 문장 이상 이어서 설명하는 것이다.
- 한두 문장으로 이름을 부르거나 다른 편으로 넘기는 것은 위반이 아니다.
- 이 편의 범위에 속하는 설명은 위반이 아니다.
- 확실한 곳만 적는다. 없으면 findings 는 빈 배열이다.
- turn 은 턴 ID(E3), episode 는 그 개념을 다루는 편 번호, quote 는 대본에서 그대로 옮긴 짧은 인용이다.

## 대본
${i.scriptMd}`;
}

/** 검사 결과 → L0 위반 메시지(지목한 턴을 수정 호출이 고친다). 표지로 시작해 한도 뒤엔 QA 로 넘어간다 */
export function seriesOverlapMessages(findings: SeriesOverlapFinding[], en: boolean): string[] {
  const mark = en ? SERIES_SCOPE_MARK.en : SERIES_SCOPE_MARK.ko;
  return findings.map((f) => en
    ? `${mark} ${f.turn} explains "${f.concept}" in depth, which episode ${f.episode} covers ("${f.quote.slice(0, 80)}") — cut it to one sentence that names it, and use the turn for this episode's own scope`
    : `${mark} ${f.turn}가 ${f.episode}화에서 자세히 다룰 "${f.concept}"를 풀어 설명한다("${f.quote.slice(0, 80)}") — 한 문장으로 이름만 부르고, 그 자리를 이 편의 범위로 채운다`);
}
