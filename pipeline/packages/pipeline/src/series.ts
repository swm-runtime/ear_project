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
