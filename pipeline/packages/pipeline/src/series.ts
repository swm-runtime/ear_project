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

export interface SeriesPlanEpisode { no: number; title: string; scope: string; carries: string; only_here: string; minutes: number }
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
  /** 앞 편(2화부터) — 제목 + 구성안의 축·구간 질문. 회상의 유일한 재료 */
  prev: { title: string; axis: string; questions: string[] } | null;
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
- Other episodes cover these in depth. Do not build a section on them; name one in a sentence at most when needed:
${others}`
    : `\n\n## 시리즈 편 — ${s.name} ${s.total}편 중 ${s.no}화
${s.rules}
- 이 편의 범위: ${s.scope}${s.onlyHere ? `\n- 이 편에서만 자세히 다룰 것: ${s.onlyHere}` : ""}${s.carries ? `\n- 앞 편에서 이어받는 것: ${s.carries}` : ""}
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
${s.prev && s.recapClaimId ? `- Recap: the first explainer turn of the Opening starts with one or two sentences that recall episode ${s.no - 1}, "${s.prev.title}". Use only claim ${s.recapClaimId}. List ${s.recapClaimId} in that turn's turn_claims.\n` : ""}- Sign-off: the first {slot} of the sign-off begins with this exact sentence: "${s.closingSentence}"
- Other episodes cover these; do not explain them in depth here: ${others}`;
  return `\n\n## 시리즈 편 — ${s.name} ${s.total}편 중 ${s.no}화
${s.rules}
- 인트로: {대주제 한 줄} 자리는 정확히 이 문장이다: "${s.introSentence}"
${s.prev && s.recapClaimId ? `- 회상: 도입의 첫 해설 턴은 ${s.no - 1}화 "${s.prev.title}"를 떠올리는 한두 문장으로 시작한다. 재료는 claims ${s.recapClaimId} 하나뿐이다. 그 턴의 turn_claims 에 ${s.recapClaimId} 를 넣는다.\n` : ""}- 클로징 인사: 첫 {슬롯}은 이 문장으로 시작한다: "${s.closingSentence}"
- 다른 편이 다루는 것이니 이 편에서 자세히 풀지 않는다: ${others}`;
}

/** 회상 재료 — claims 행 문장과 sources.md 절. 앞 편 구성안의 축·구간 질문만 싣는다(QA 독립성: 다른 편의 대본·리포트는 넣지 않는다) */
export function seriesRecapMaterial(s: Pick<SeriesDraftContext, "name" | "no" | "prev">, en: boolean): { claim: string; section: string } | null {
  if (!s.prev) return null;
  const q = s.prev.questions.map((x) => `- ${x}`).join("\n");
  return en
    ? { claim: `Episode ${s.no - 1} of the series, "${s.prev.title}", explained: ${s.prev.axis}`, section: `## Series link — episode ${s.no - 1} (pipeline record of the previous episode's outline, not a source)\n- Series: ${s.name}\n- Title: ${s.prev.title}\n- Axis: ${s.prev.axis}\n- Section questions:\n${q}` }
    : { claim: `시리즈 ${s.no - 1}화 "${s.prev.title}"는 이것을 다뤘다: ${s.prev.axis}`, section: `## 시리즈 연결 재료 — ${s.no - 1}화 (앞 편 구성안의 파이프라인 기록, 소스 아님)\n- 시리즈: ${s.name}\n- 제목: ${s.prev.title}\n- 축: ${s.prev.axis}\n- 구간 질문:\n${q}` };
}
