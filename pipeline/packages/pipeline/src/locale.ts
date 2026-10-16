/**
 * 파이프라인 인스턴스 로케일 (글로벌판 명세 docs/ai/global/PIPELINE.md 4.2·4.3, KAN-201).
 * 코드는 하나이고 인스턴스(한국판·글로벌판)가 env 로 갈린다 — `PIPELINE_LOCALE` 미설정 = `ko`(한국판, 종전 동작 그대로).
 * 콘솔(apps/web/lib/locale.ts)도 같은 env 규칙을 따른다. 브라우저 코드는 env 를 읽지 못하므로 서버가 읽어 props 로 넘긴다.
 */
import { AsyncLocalStorage } from "node:async_hooks";

export type PipelineLocale = "ko" | "en";

export function pipelineLocale(): PipelineLocale {
  const v = (process.env.PIPELINE_LOCALE ?? "").trim();
  if (v === "" || v === "ko") return "ko";
  if (v === "en") return "en";
  throw new Error(`PIPELINE_LOCALE 은 ko 또는 en 이다 (받은 값: ${v})`);
}

const KO_SPEAKERS = ["윤아", "이음"] as const;

/**
 * 글로벌판 출연진 (글로벌 명세 6.7 · 10장 #4, 2026-10-17 박수헌 결정) — 해설자(한국 내부자) 남녀 · 진행자(외부자) 남녀 4명을
 * 남녀가 섞인 고정 2인조 두 팀으로 묶고, 대표 주제마다 한 팀이 맡는다. 이름·보이스는 사용자 결정, 팀·주제 배정은 제안안을 그대로 썼다("팀 구성은 크게 상관없다").
 * 보이스 ID 는 ElevenLabs 라이브러리 보이스다(비밀 아님). 콘솔(apps/web/lib/locale.ts GLOBAL_CAST_NAMES)이 같은 이름을 쓴다 — 바꾸면 둘 다.
 */
export interface CastMember { name: string; voice: string }
export interface CastTeam { explainer: CastMember; host: CastMember; topics: readonly string[] }
export const GLOBAL_TEAMS: readonly CastTeam[] = [
  { explainer: { name: "Yuna", voice: "MClEFoImJXBTgLwdLI5n" }, host: { name: "Owen", voice: "gPPH6SLdL8XSX6GNJ40G" },
    topics: ["Korean Language", "Korean Culture", "Korean History & Society", "K-Beauty & Fashion"] },
  { explainer: { name: "Minsoo", voice: "DMyrgzQFny3JI1Y1paM5" }, host: { name: "Grace", voice: "kdmDKE6EkgrWrrykO9Qt" },
    topics: ["K-Food", "K-Pop", "K-Drama & Film", "Travel in Korea"] },
];

/** 대표 주제의 2인조("해설,진행" 순). 한국판은 윤아·이음 그대로. 표에 없는 주제는 첫 팀 */
export function speakersForTopic(topic: string | null | undefined): readonly [string, string] {
  if (pipelineLocale() === "ko") return KO_SPEAKERS;
  const t = GLOBAL_TEAMS.find((x) => topic && x.topics.includes(topic)) ?? GLOBAL_TEAMS[0];
  return [t.explainer.name, t.host.name];
}
/** 글로벌판 보이스 ID — 출연진 표에 없는 이름이면 null(호출 쪽이 env 보이스로 대신한다) */
export function castVoiceOf(name: string): string | null {
  for (const t of GLOBAL_TEAMS) for (const m of [t.explainer, t.host]) if (m.name === name) return m.voice;
  return null;
}

// 작업 하나가 도는 동안의 2인조 — 워커가 작업을 집을 때 그 편의 대표 주제로 정한다(apps/worker index.ts withJobSpeakers). 프롬프트·L0·TTS·패키지가 같은 값을 읽는다
const speakerStore = new AsyncLocalStorage<readonly [string, string]>();
export function withSpeakers<T>(pair: readonly [string, string], fn: () => T): T {
  return speakerStore.run(pair, fn);
}

function envSpeakers(): readonly [string, string] | null {
  const v = (process.env.PIPELINE_SPEAKERS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!v.length) return null;
  if (v.length !== 2 || v[0] === v[1]) throw new Error("PIPELINE_SPEAKERS 에는 서로 다른 진행자 이름 두 개를 '해설,진행' 순으로 적는다");
  if (v.some((n) => /[[\]|·\\]/.test(n))) throw new Error("PIPELINE_SPEAKERS 의 이름에 [ ] | · \\ 를 쓸 수 없다 — 대본 줄 문법의 화자 라벨이다");
  return [v[0], v[1]];
}

/**
 * 진행자 이름 두 개("해설,진행" 순). ko 는 윤아·이음 고정.
 * en 은 지금 도는 작업의 2인조(withSpeakers) → 없으면 `PIPELINE_SPEAKERS`(2026-10-17 이전 편의 임시 이름 HostA·HostB) → 없으면 첫 팀.
 */
export function speakerNames(): readonly [string, string] {
  if (pipelineLocale() === "ko") return KO_SPEAKERS;
  return speakerStore.getStore() ?? envSpeakers() ?? speakersForTopic(null);
}

/** 대본에 나올 수 있는 화자 이름 전부 — 파서·화자 라벨 정규식용. en 은 출연진 4명 + PIPELINE_SPEAKERS(옛 편) */
export function allSpeakerNames(): readonly string[] {
  if (pipelineLocale() === "ko") return KO_SPEAKERS;
  const names = GLOBAL_TEAMS.flatMap((t) => [t.explainer.name, t.host.name]);
  for (const n of envSpeakers() ?? []) if (!names.includes(n)) names.push(n);
  return names;
}

/** 같은 2인조의 다른 한 명 — en 은 그 이름이 속한 팀에서 찾는다 */
export function otherSpeaker(name: string): string {
  if (pipelineLocale() === "en") {
    const t = GLOBAL_TEAMS.find((x) => x.explainer.name === name || x.host.name === name);
    if (t) return t.explainer.name === name ? t.host.name : t.explainer.name;
  }
  const [a, b] = speakerNames();
  return name === a ? b : a;
}

const escaped = () => allSpeakerNames().map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
/** 대본 줄 문법의 화자 라벨 정규식 조각 — 캡처 그룹 하나: `(윤아|이음)` */
export function speakerGroup(): string {
  return `(${escaped()})`;
}
/** 같은 조각의 비캡처판 — `(?:윤아|이음)` (그룹 번호를 바꾸면 안 되는 자리) */
export function speakerAlt(): string {
  return `(?:${escaped()})`;
}

/** 에피소드 ID 머리글자 — 한국판 T, 글로벌판 G (사람이 Slack·로그에서 두 트랙을 구분하기 위한 것. 버킷이 달라 충돌 방지용은 아니다) */
export function episodeIdLetter(): "T" | "G" {
  return pipelineLocale() === "en" ? "G" : "T";
}

/** 대본 4구역 이름 — 줄 문법 `## [인트로]` 의 괄호 안 (spec/04 4장 · 글로벌 명세 6.4). 앱 카드 구분(intro·lead·body·outro)도 이 이름으로 가른다 */
export interface ScriptZones { intro: string; lead: string; body: string; outro: string }
const KO_ZONES: ScriptZones = { intro: "인트로", lead: "도입", body: "본문", outro: "마무리" };
const EN_ZONES: ScriptZones = { intro: "Intro", lead: "Opening", body: "Body", outro: "Closing" };
export function scriptZones(): ScriptZones {
  return pipelineLocale() === "en" ? EN_ZONES : KO_ZONES;
}

/**
 * 구성안(outline.md) 표기 — L0 가 대본과 대조하는 머리. 한국판은 설계 프롬프트가 쓰는 그대로("구간 #1", "예상 분량: 15분").
 * 글로벌판은 영어 설계 프롬프트가 이 표기로 쓰게 한다(KAN-203 — 영어 규칙 설계 때 프롬프트에 넣는다)
 */
export function outlineMarks(): { section: RegExp; estimate: RegExp } {
  return pipelineLocale() === "en"
    ? { section: /^Section #(\d+)/gm, estimate: /^Estimated length:\s*(\d+(?:\.\d+)?)\s*min/im }
    : { section: /^구간 #(\d+)/gm, estimate: /^예상 분량:\s*(\d+(?:\.\d+)?)\s*분/m };
}
