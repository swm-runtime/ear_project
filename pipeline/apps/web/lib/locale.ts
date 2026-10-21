/**
 * 콘솔 인스턴스 로케일 (글로벌판 명세 docs/ai/global/PIPELINE.md 4.2, KAN-201) — 워커의 @ear/pipeline locale.ts 와 같은 env 규칙.
 * `PIPELINE_LOCALE` 미설정 = ko(한국판). **서버에서만 부른다** — 브라우저는 env 를 못 읽어 한국판으로 잘못 판정하므로, 서버 컴포넌트가 읽어 props 로 넘긴다.
 * 이미지는 한 번 빌드해 두 인스턴스가 같이 쓰므로 NEXT_PUBLIC_(빌드 시 박힘)로 두지 않는다.
 */
export type PipelineLocale = "ko" | "en";

export function pipelineLocale(): PipelineLocale {
  const v = (process.env.PIPELINE_LOCALE ?? "").trim();
  if (v === "" || v === "ko") return "ko";
  if (v === "en") return "en";
  throw new Error(`PIPELINE_LOCALE 은 ko 또는 en 이다 (받은 값: ${v})`);
}

/**
 * 글로벌판 출연진 4명 (워커 @ear/pipeline GLOBAL_TEAMS 와 같은 이름 — 바꾸면 둘 다, 2026-10-17). 편마다 대표 주제로 2인조가 정해지므로
 * 콘솔은 대본을 읽고 고칠 때 네 이름을 다 화자로 받는다(allSpeakerNames)
 */
export const GLOBAL_CAST_NAMES = ["Yuna", "Owen", "E-um", "Grace"] as const;

/** 대본에 나올 수 있는 화자 이름 전부 — ko 윤아·이음, en 은 출연진 4명 + PIPELINE_SPEAKERS(2026-10-17 이전 편의 임시 이름) */
export function allSpeakerNames(): string[] {
  if (pipelineLocale() === "ko") return ["윤아", "이음"];
  const env = (process.env.PIPELINE_SPEAKERS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return [...new Set<string>([...GLOBAL_CAST_NAMES, ...env])];
}

/** 진행자 이름 두 개 — ko 윤아·이음, en 은 PIPELINE_SPEAKERS("해설,진행") */
export function speakerNames(): readonly [string, string] {
  if (pipelineLocale() === "ko") return ["윤아", "이음"];
  const v = (process.env.PIPELINE_SPEAKERS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (v.length !== 2 || v[0] === v[1]) throw new Error("PIPELINE_LOCALE=en 이면 PIPELINE_SPEAKERS 에 서로 다른 진행자 이름 두 개를 '해설,진행' 순으로 적는다");
  return [v[0], v[1]];
}
