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
export const CHARS_PER_MIN_KO = 341;
/** 짧은 판 발행 준비 관문 — 비평 v2 합계가 이 값 미만이면 TTS 를 걸지 않고 사람 검토(review_required)로 둔다 (2026-10-29 박수헌: short 에만 65). standard 는 관문 없음 */
export const SHORT_CRITIC_THRESHOLD = 65; // eleven_v4 실측(2026-10-08) — draft-two-stage.ts scriptStats 와 같은 값

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
}

export const LENGTH_SPECS: Record<LengthProfile, LengthSpec> = {
  standard: { key: "standard", label: "기본", floorMin: 13, targetMin: 15, maxMin: null, splitMin: 26, sections: [4, 6], floorChars: 4300, maxChars: null },
  short: { key: "short", label: "짧은 판", floorMin: 5, targetMin: 9, maxMin: 12, splitMin: null, sections: [2, 3], floorChars: 1700, maxChars: 4100 },
};

/** DB 값 → 프로필. null·모르는 값은 standard */
export function lengthProfileOf(v: string | null | undefined): LengthProfile {
  return v === "short" ? "short" : "standard";
}
export const lengthSpecOf = (v: string | null | undefined): LengthSpec => LENGTH_SPECS[lengthProfileOf(v)];

/**
 * 설계 프롬프트에 덧붙이는 블록 (short 만). 기본 규칙 본문(13분·구간 4~6개)은 그대로 두고 **이 편에 한해** 덮어쓴다 — 시리즈 블록(seriesDesignBlock)과 같은 방식.
 * 축은 원본 편과 같은 질문을 유지한다 — "같은 주제, 길이만 다름"이 실험 조건이다.
 */
export function lengthDesignBlock(profile: LengthProfile, original?: { title: string; axis?: string | null } | null): string {
  if (profile !== "short") return "";
  const s = LENGTH_SPECS.short;
  return `\n\n## 짧은 판 — 이 편의 분량 규칙은 아래가 우선한다 (KAN-296 실험)
- 이 편은 **하한 ${s.floorMin}분(약 ${s.floorChars.toLocaleString()}자) · 목표 ${s.targetMin}분 · 상한 ${s.maxMin}분(약 ${s.maxChars!.toLocaleString()}자)**이다. 위 "분량 규칙"의 13분 하한·26분 분할은 이 편에 적용하지 않는다. 재료가 ${s.maxMin}분을 넘으면 분할안을 적지 말고 구간을 덜어낸다. 예상 분량은 ${s.floorMin}~${s.maxMin}분 사이의 실제 재료량으로 적는다.
- **본문 구간은 ${s.sections[0]}~${s.sections[1]}개**다. 축의 하위 질문도 그 수만큼만 편다. 역사·맥락 구간은 두지 않는다. **반론·한계는 별도 구간으로 세우지 않고 착지 구간 안의 한두 턴으로 둔다** — 그 재료(claims)는 착지 구간에 배정하고, 착지 구간 목적에 "반론 한 가지를 짚고 축으로 돌아온다"를 적는다. 분량 상한 안에서 하고, 반론 재료가 없으면 역할표에 "없음"으로 적는다.
- **예상 분량은 구간에 실제로 담은 재료만으로 계산한다** — 제외한 재료·소스는 세지 않는다. 재료 총량이 16분이어도 구간 3개에 담은 만큼이 9분이면 예상 분량은 9분이다.
- 소스는 구간 수에 맞춰 줄어든다 — 역할이 없는 소스는 "역할 없는 소스"로 제외한다. 소스 3건 하한은 그대로다.
- 구간당 사례·일화는 하나, 수치는 가장 의외인 것 하나를 고른다. 재료를 압축해 담지 않는다 — 담지 못하는 재료는 뺀다.${original ? `\n- **축은 원본 편과 같은 질문을 유지한다**: 이 편은 발행된 편 "${original.title}"의 짧은 판이다.${original.axis ? ` 원본의 축: ${original.axis}` : ""} 축 문장을 다시 쓰더라도 같은 질문에 답해야 한다 — 다른 질문으로 옮기면 실험 조건이 깨진다.` : ""}`;
}

/** 짧은 판 도입 훅 형태 (2026-10-29 박수헌) — 편마다 번갈아 쓰고 실행 기록에 남겨 형태별 초반 이탈을 비교한다. 형태를 더하면 여기에 한 줄씩 */
export interface ShortHook { key: string; label: string; rule: string }
export const SHORT_HOOKS: readonly ShortHook[] = [
  { key: "payoff", label: "선취형", rule: "인트로의 주제 선언 바로 뒤 첫 해설 턴이 이 편에서 가장 의외인 **결과 하나**를 **한 문장, 수치 1~2개**로 먼저 말한다 — 예: \"금리만 4%에서 8%로 올라도 매달 내는 돈이 143만 원에서 220만 원이 돼요.\" 조건·계산 방법·배경은 말하지 않는다(본문 #1 이 푼다 — 한 턴 수치는 3개 이하, L0). 결과는 claims 에 있는 그대로(헤지 유지)이고 **축 소스의 claims 에서 고른다** — 도입에서 쓸 수 있는 소스는 축 소스뿐이다(규칙 22). 그 결과가 속한 구간에서는 같은 문장을 되풀이하지 않고 기제를 설명한다." },
  { key: "promise", label: "약속형", rule: "인트로의 주제 선언 바로 뒤 첫 해설 턴이 이 편을 다 들으면 청취자에게 **무엇이 달라지는지**를 한두 문장으로 단언한다. 청취자의 **구체적인 상황 하나**(면접장·월급날·대출 상담 창구·회의실 같은)에서 행동·감정·판단이 어떻게 바뀌는지를 말한다 — 예: 면접 편이면 \"이걸 듣고 나면 면접에서 떨 이유가 없어져요\", AI 평가 편이면 \"다음에 AI 성능이 좋아졌다는 발표를 보면 그 말이 믿을 만한지 바로 가려낼 수 있어요\". \"~을 짚을 수 있어요\"·\"~을 이해하게 돼요\"·\"~을 알아볼게요\"처럼 배움이나 진행을 약속하는 말은 쓰지 않는다. 수치는 넣지 않는다. 약속은 본문이 실제로 증명하는 범위 안에서만 하고(claims 밖의 효능을 붙이지 않는다), 마무리 정리 턴이 그 약속을 한 문장으로 회수한다. 청취자에게 시키는 말(\"~해 보세요\")은 아니다." },
];
/** 편마다 번갈아 — 후보 번호(또는 시드)로 고른다 */
export function pickShortHook(seed: number): ShortHook { return SHORT_HOOKS[Math.abs(Math.trunc(seed)) % SHORT_HOOKS.length]; }

/** 설계 프롬프트 맨 앞에 두는 한 줄 표지 (short 만) — 시스템 프롬프트의 기본 분량 규칙(13분·구간 4~6)보다 먼저 읽히게. 2026-10-29 C601·C602: 끝에 붙인 블록만으로는 모델이 16분·15분 구성안을 냈다 */
export function lengthDesignBanner(profile: LengthProfile): string {
  if (profile !== "short") return "";
  const s = LENGTH_SPECS.short;
  return `**이 편은 짧은 판이다 — 분량·구간 수는 아래 "짧은 판" 절이 우선한다: ${s.floorMin}~${s.maxMin}분 · 본문 구간 ${s.sections[0]}~${s.sections[1]}개 · 분할 없음 · 예상 분량은 담은 재료만으로.**\n\n`;
}
/** 짧은 판 분량·구간 초과 시 재설계 피드백 (design-single) — 축·발췌·claims 는 유지하고 구간을 덜어낸다 */
export function shortTrimFeedback(est: number | null | undefined, sections: number): string {
  const s = LENGTH_SPECS.short;
  return `\n\n## 짧은 판 분량 반려 — 1차 구성안 (KAN-296)\n1차 구성안은 예상 ${est ?? "?"}분 · 본문 구간 ${sections}개다. 이 편의 규격은 **${s.floorMin}~${s.maxMin}분 · 구간 ${s.sections[0]}~${s.sections[1]}개**다. 축·발췌·claims 는 그대로 두고 **구간을 덜어낸다**: 축을 바로 증명하는 구간 ${s.sections[1]}개 이하만 남기고, 뺀 구간의 소스는 "역할 없는 소스"로 옮긴다(3건 하한만 지킨다). 예상 분량은 남긴 구간에 담은 재료만으로 다시 계산해 ${s.maxMin}분 이하로 적는다. 같은 형식으로 구성안을 다시 낸다.`;
}

/** 대본 프롬프트에 덧붙이는 블록 (short 만) — 분량 목표와 짧은 판 도입 훅. 기존 "진입 방식" 로테이션 줄은 short 편에서 빠진다(buildWritePromptParts) */
export function lengthWriteBlock(profile: LengthProfile, hook: ShortHook = SHORT_HOOKS[0]): string {
  if (profile !== "short") return "";
  const s = LENGTH_SPECS.short;
  return `\n\n## 짧은 판 — 분량과 도입 (KAN-296 실험, 이 편에 한해 위 규칙보다 우선)
- 분량: 하한 ${s.floorMin}분(약 ${s.floorChars.toLocaleString()}자)·상한 ${s.maxMin}분(약 ${s.maxChars!.toLocaleString()}자). 위 "분량"의 13분 하한은 이 편에 적용하지 않는다. 목표는 구성안의 예상 분량이다. 상한을 넘기면 해설 턴의 풀어 쓰기를 줄인다 — 재료를 더 넣지 않는다.
- 도입(규칙 13)은 이 편에서 **${hook.label} 훅**으로 쓴다: ${hook.rule} 그다음 진행 턴 하나가 "왜"(또는 "그게 왜 가능한지")를 묻고 바로 본문 구간 #1 로 들어간다. [도입] 구역은 그 두 턴이 전부다 — 경험담·사물·되받기 장면을 세우지 않는다. "보통은 이렇게 생각하지만 실은 반대"식 통념 반전 틀은 쓰지 않는다(규칙 13).
- 본문: 구간마다 해설 턴은 짧게, 진행 턴은 한 문장. 착지 구간에 반론·한계가 배정돼 있으면 한두 턴으로 짚고 축으로 돌아온다.
- 마무리 정리 턴(3~5문장, L0)은 구간을 차례로 되짚지 않는다 — "○○에서는 … ○○에서는 …"처럼 같은 틀로 나란히 놓는 열거 금지. 본문이 보여 준 것을 원인과 결과로 이어 축 하나로 올리고, 마지막 문장이 축이다. 이미 한 구분을 다시 선언하는 데서 끝내지 않는다.`;
}

/** 비평(critic) 프롬프트에 덧붙이는 한 줄 (short 만) — 생성 맥락은 넘기지 않는다, 규격이 다르다는 사실만 */
export function lengthCriticNote(profile: LengthProfile): string {
  if (profile !== "short") return "";
  const s = LENGTH_SPECS.short;
  return `\n\n## 규격 알림 — 짧은 판
이 대본은 분량 ${s.floorMin}~${s.maxMin}분·본문 구간 ${s.sections[0]}~${s.sections[1]}개 규격으로 만들어졌다(KAN-296). 구간 수가 적은 것, 반론·맥락 구간이 없는 것, 도입이 결과 한 문장과 질문 한 턴뿐인 것은 규격이지 결함이 아니다 — 3.5·3.6 에서 그 이유로 감점하지 않는다. 그 밖의 항목은 그대로 평가한다.`;
}
