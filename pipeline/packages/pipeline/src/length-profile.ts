/**
 * 길이 프로필 (KAN-296 단기 실험 ④, 2026-10-29) — 한국판 편 하나하나가 어느 분량 규격으로 만들어지는가.
 *   standard — 지금까지의 규격 그대로: 하한 13분(공백·기호 제외 약 4,300자)·평균 목표 15분·상한 없음·26분 이상이면 분할 제안·본문 구간 4~6개.
 *   short    — 짧은 판: 하한 5분(약 1,700자)·목표 9분·상한 12분(약 4,100자)·분할 없음(넘치면 덜어냄)·본문 구간 2~3개.
 *              발행된 편의 주제를 다시 만든 재제작 후보(backlog.remake_of)가 쓴다. 새 앱 배포 뒤 가입한 사용자에게만 나간다(BE 코호트 분리).
 * 프로필은 `backlog.length_profile`(0040)에 있고 설계·대본·L0·비평이 읽는다. **standard 경로의 프롬프트·검사는 글자 하나 바뀌지 않는다** — short 일 때만 블록이 덧붙는다.
 * 한국판 전용이다(글로벌판은 MIN_MINUTES_EN 하나로 돈다).
 */
export type LengthProfile = "standard" | "short";
export const LENGTH_PROFILES: readonly LengthProfile[] = ["standard", "short"];
export const CHARS_PER_MIN_KO = 341; // eleven_v4 실측(2026-10-08) — draft-two-stage.ts scriptStats 와 같은 값

export interface LengthSpec {
  key: LengthProfile;
  label: string;
  /** 분량 하한(분) — 설계 예상 분량·L0 모두 이 값 */
  floorMin: number;
  /** 설계가 목표로 적는 분량(분) — 재료가 충분할 때의 기본값 */
  targetMin: number;
  /** 상한(분). null = 없음 */
  maxMin: number | null;
  /** 이 분량 이상이면 분할안을 적는다. null = 분할 없음 */
  splitMin: number | null;
  /** 본문 구간 수 범위 */
  sections: readonly [number, number];
  /** L0 글자 하한(공백·기호 제외) */
  floorChars: number;
  /** L0 글자 상한. null = 없음(설계 예상의 1.6배 검사만) */
  maxChars: number | null;
  /** 설계가 실제로 쓰는 소스(본문을 읽은 소스) 하한 — 후보 단계의 소스 3건 규칙과는 별개 (2026-10-30 박수헌: 짧은 판 2건) */
  minSources: number;
}

export const LENGTH_SPECS: Record<LengthProfile, LengthSpec> = {
  standard: { key: "standard", label: "기본", floorMin: 13, targetMin: 15, maxMin: null, splitMin: 26, sections: [4, 6], floorChars: 4300, maxChars: null, minSources: 3 },
  short: { key: "short", label: "짧은 판", floorMin: 5, targetMin: 9, maxMin: 12, splitMin: null, sections: [2, 3], floorChars: 1700, maxChars: 4100, minSources: 2 },
};

/** DB 값 → 프로필. null·모르는 값은 standard */
export function lengthProfileOf(v: string | null | undefined): LengthProfile {
  return v === "short" ? "short" : "standard";
}
export const lengthSpecOf = (v: string | null | undefined): LengthSpec => LENGTH_SPECS[lengthProfileOf(v)];

/** 짧은 판 도입 훅 형태 (2026-10-29 박수헌) — 편마다 번갈아 쓰고 실행 기록에 남겨 형태별 초반 이탈을 비교한다. 규칙 본문은 자산 skills/draft/short.md 의 "## 도입 훅 — <label>" 절 */
export interface ShortHook { key: string; label: string }
export const SHORT_HOOKS: readonly ShortHook[] = [
  { key: "payoff", label: "선취형" },
  { key: "promise", label: "약속형" },
];
/** 편마다 번갈아 — 후보 번호(또는 시드)로 고른다 */
export function pickShortHook(seed: number): ShortHook { return SHORT_HOOKS[Math.abs(Math.trunc(seed)) % SHORT_HOOKS.length]; }
/** 후보 ID(C613 …)로 고른 이 편의 훅 — 설계·대본 단계가 같은 값을 쓴다(short-v1.2: 구성안이 훅 재료와 첫 구간을 정한다) */
export function shortHookFor(candidateId: string): ShortHook { return pickShortHook(Number(candidateId.replace(/\D/g, "")) || 0); }

/**
 * 짧은 판 규칙 자산 (skills/draft/short.md, short-v1 — 2026-10-30). 질적 규칙(설계·대본·훅)은 자산이 진실이고, 분량·구간·소스 하한 숫자는 L0 와 맞물려 여기(LENGTH_SPECS)가 붙인다.
 * 본문(promptBody)을 "## " 절로 나눈다 — 설계 · 대본 · 도입 훅 — <label>. 절이 빠지면 조용히 넘어가지 않고 멈춘다(프롬프트의 진실은 DB, spec/10 3.2)
 */
export interface ShortRules { version: string; design: string; write: string; hooks: Record<string, string> }
export function parseShortRules(body: string, version: string): ShortRules {
  const sec = new Map<string, string>();
  let cur: string | null = null; let buf: string[] = [];
  const flush = () => { if (cur) sec.set(cur, buf.join("\n").trim()); };
  for (const line of body.split(/\r?\n/)) {
    const h = line.match(/^##\s+(.+?)\s*$/);
    if (h) { flush(); cur = h[1]; buf = []; continue; }
    if (cur) buf.push(line);
  }
  flush();
  const need = (name: string) => { const t = sec.get(name); if (!t) throw new Error(`짧은 판 규칙(skills/draft/short.md@${version})에 "## ${name}" 절이 없다 — /assets 에서 고쳐 활성화`); return t; };
  const hooks: Record<string, string> = {};
  for (const h of SHORT_HOOKS) hooks[h.key] = need(`도입 훅 — ${h.label}`);
  return { version, design: need("설계"), write: need("대본"), hooks };
}

/** 원본 편 축 유지 줄 — "같은 주제, 길이만 다름"이 실험 조건이다 */
const originalLine = (original?: { title: string; axis?: string | null } | null) => original ? `\n- **축은 원본 편과 같은 질문을 유지한다**: 이 편은 발행된 편 "${original.title}"의 짧은 판이다.${original.axis ? ` 원본의 축: ${original.axis}` : ""} 축 문장을 다시 쓰더라도 같은 질문에 답해야 한다.` : "";

/**
 * 설계 프롬프트에 덧붙이는 블록 (short 만). 기본 규칙 본문(13분·구간 4~6개)은 그대로 두고 **이 편에 한해** 덮어쓴다 — 시리즈 블록(seriesDesignBlock)과 같은 방식.
 * 숫자 줄(분량·구간·소스 하한)은 코드, 나머지는 자산의 "## 설계" 절.
 */
export function lengthDesignBlock(profile: LengthProfile, original?: { title: string; axis?: string | null } | null, rules?: ShortRules | null, hook?: ShortHook | null): string {
  if (profile !== "short") return "";
  if (!rules) throw new Error("짧은 판 편인데 짧은 판 규칙(skills/draft/short.md)을 받지 못했다");
  const s = LENGTH_SPECS.short;
  return `\n\n## 짧은 판 — 이 편은 아래 규칙이 위 규칙보다 우선한다 (KAN-296, ${rules.version})
- 분량: **하한 ${s.floorMin}분(약 ${s.floorChars.toLocaleString()}자) · 목표 ${s.targetMin}분 · 상한 ${s.maxMin}분(약 ${s.maxChars!.toLocaleString()}자)**. 위 "분량 규칙"의 13분 하한·26분 분할은 적용하지 않는다. 재료가 ${s.maxMin}분을 넘으면 분할안을 적지 않고 구간을 덜어낸다.
- 예상 분량은 구간에 실제로 담은 재료만으로 계산한다. 제외한 재료·소스는 세지 않는다.
- **본문 구간은 ${s.sections[0]}~${s.sections[1]}개**다. 축의 하위 질문도 그 수만큼만 편다.
- **사용 소스 하한은 ${s.minSources}건**이다. 위의 "소스 3건 하한"은 이 편에 적용하지 않는다.${originalLine(original)}
${rules.design}${hook ? `

### 이 편의 도입 훅 — ${hook.label} (대본 단계가 아래 규칙으로 쓴다. 구성안은 "도입 훅:" 줄에 재료 claim 과 훅이 남기는 질문을 정한다)
${rules.hooks[hook.key]}` : ""}`;
}

/** 설계 프롬프트 맨 앞에 두는 한 줄 표지 (short 만) — 시스템 프롬프트의 기본 분량 규칙(13분·구간 4~6)보다 먼저 읽히게. 2026-10-29 C601·C602: 끝에 붙인 블록만으로는 모델이 16분·15분 구성안을 냈다 */
export function lengthDesignBanner(profile: LengthProfile): string {
  if (profile !== "short") return "";
  const s = LENGTH_SPECS.short;
  return `**이 편은 짧은 판이다 — 아래 "짧은 판" 절이 우선한다: ${s.floorMin}~${s.maxMin}분 · 본문 구간 ${s.sections[0]}~${s.sections[1]}개 · 사용 소스 ${s.minSources}건 이상 · 분할 없음 · 예상 분량은 담은 재료만으로.**\n\n`;
}
/** 짧은 판 분량·구간 초과 시 재설계 피드백 (design-single) — 축·발췌·claims 는 유지하고 구간을 덜어낸다 */
export function shortTrimFeedback(est: number | null | undefined, sections: number): string {
  const s = LENGTH_SPECS.short;
  return `\n\n## 짧은 판 분량 반려 — 1차 구성안 (KAN-296)\n1차 구성안은 예상 ${est ?? "?"}분 · 본문 구간 ${sections}개다. 이 편의 규격은 **${s.floorMin}~${s.maxMin}분 · 구간 ${s.sections[0]}~${s.sections[1]}개**다. 축·발췌·claims 는 그대로 두고 **구간을 덜어낸다**: 축을 바로 증명하는 구간 ${s.sections[1]}개 이하만 남기고, 뺀 구간의 소스는 "역할 없는 소스"로 옮긴다(사용 소스 ${s.minSources}건 하한만 지킨다). 예상 분량은 남긴 구간에 담은 재료만으로 다시 계산해 ${s.maxMin}분 이하로 적는다. 같은 형식으로 구성안을 다시 낸다.`;
}

/** 대본 프롬프트에 덧붙이는 블록 (short 만) — 분량 줄(코드) + 자산의 "## 대본" 절 + 이 편의 훅 절. 기존 "진입 방식" 로테이션 줄은 short 편에서 빠진다(buildWritePromptParts) */
export function lengthWriteBlock(profile: LengthProfile, hook: ShortHook = SHORT_HOOKS[0], rules?: ShortRules | null): string {
  if (profile !== "short") return "";
  if (!rules) throw new Error("짧은 판 편인데 짧은 판 규칙(skills/draft/short.md)을 받지 못했다");
  const s = LENGTH_SPECS.short;
  return `\n\n## 짧은 판 — 이 편은 아래 규칙이 위 규칙보다 우선한다 (KAN-296, ${rules.version})
- 분량: 하한 ${s.floorMin}분(약 ${s.floorChars.toLocaleString()}자) · 상한 ${s.maxMin}분(약 ${s.maxChars!.toLocaleString()}자). 위 "분량"의 13분 하한은 적용하지 않는다. 목표는 구성안의 예상 분량이다. 상한을 넘기면 해설 턴의 풀어 쓰기를 줄인다.
- 이 편의 도입은 **${hook.label} 훅**이다(아래 "도입 훅 — ${hook.label}").
${rules.write}

### 도입 훅 — ${hook.label}
${rules.hooks[hook.key]}`;
}

/**
 * 비평(critic) 프롬프트에 덧붙이는 절 (short 만) — 짧은 판 루브릭(skills/critic/rubric-short.md, shortcritic-v1)으로 v2 3장(점수)을 바꾼다. 생성 맥락은 넘기지 않는다.
 * 루브릭을 받지 못하면(측정 모드 등) 규격 알림 한 절만 붙인다
 */
export function lengthCriticNote(profile: LengthProfile, rubricShortMd?: string | null): string {
  if (profile !== "short") return "";
  const s = LENGTH_SPECS.short;
  if (rubricShortMd) return `\n\n## 짧은 판 채점 — 위 1절 비평 루브릭 v2 의 3장(점수) 대신 아래 루브릭으로 채점한다
2장 플래그·4장 리포트 규격은 v2 그대로 쓴다. 점수표의 항목 이름·배점은 아래를 따른다.
\`\`\`\`
${rubricShortMd.trim()}
\`\`\`\``;
  return `\n\n## 규격 알림 — 짧은 판
이 대본은 분량 ${s.floorMin}~${s.maxMin}분·본문 구간 ${s.sections[0]}~${s.sections[1]}개 규격으로 만들어졌다(KAN-296). 구간 수가 적은 것, 반론·맥락 구간이 없는 것, 도입이 훅 두 턴뿐인 것은 규격이지 결함이 아니다 — 3.5·3.6 에서 그 이유로 감점하지 않는다. 그 밖의 항목은 그대로 평가한다.`;
}

/** 짧은 판 비평 축 배점 (shortcritic-v1) — 결과 요약 문자열용. 칸은 v2 와 같다 */
export const SHORT_CRITIC_AXIS_MAX = { content: 30, structure: 25, naturalness: 20, immersion: 15, persona: 10 } as const;
export const V2_CRITIC_AXIS_MAX = { content: 35, structure: 20, naturalness: 20, immersion: 15, persona: 10 } as const;
