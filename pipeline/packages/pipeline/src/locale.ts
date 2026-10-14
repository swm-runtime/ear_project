/**
 * 파이프라인 인스턴스 로케일 (글로벌판 명세 docs/ai/global/PIPELINE.md 4.2·4.3, KAN-201).
 * 코드는 하나이고 인스턴스(한국판·글로벌판)가 env 로 갈린다 — `PIPELINE_LOCALE` 미설정 = `ko`(한국판, 종전 동작 그대로).
 * 콘솔(apps/web/lib/locale.ts)도 같은 env 규칙을 따른다. 브라우저 코드는 env 를 읽지 못하므로 서버가 읽어 props 로 넘긴다.
 */

export type PipelineLocale = "ko" | "en";

export function pipelineLocale(): PipelineLocale {
  const v = (process.env.PIPELINE_LOCALE ?? "").trim();
  if (v === "" || v === "ko") return "ko";
  if (v === "en") return "en";
  throw new Error(`PIPELINE_LOCALE 은 ko 또는 en 이다 (받은 값: ${v})`);
}

const KO_SPEAKERS = ["윤아", "이음"] as const;

/**
 * 진행자 이름 두 개. ko 는 윤아·이음 고정.
 * en 은 `PIPELINE_SPEAKERS="해설,진행"` 으로 받는다 — 글로벌판은 역할이 고정이라 첫째가 항상 해설이다(명세 6.4). 이름은 페르소나 결정 뒤 채운다(명세 10장 #4).
 */
export function speakerNames(): readonly [string, string] {
  if (pipelineLocale() === "ko") return KO_SPEAKERS;
  const v = (process.env.PIPELINE_SPEAKERS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (v.length !== 2 || v[0] === v[1]) throw new Error("PIPELINE_LOCALE=en 이면 PIPELINE_SPEAKERS 에 서로 다른 진행자 이름 두 개를 '해설,진행' 순으로 적는다");
  if (v.some((n) => /[[\]|·\\]/.test(n))) throw new Error("PIPELINE_SPEAKERS 의 이름에 [ ] | · \\ 를 쓸 수 없다 — 대본 줄 문법의 화자 라벨이다");
  return [v[0], v[1]];
}

/** 두 진행자 중 다른 한 명 — 해설이 정해지면 진행은 나머지다 */
export function otherSpeaker(name: string): string {
  const [a, b] = speakerNames();
  return name === a ? b : a;
}

const escaped = () => speakerNames().map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
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
