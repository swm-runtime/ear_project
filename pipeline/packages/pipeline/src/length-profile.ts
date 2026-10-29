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
- **본문 구간은 ${s.sections[0]}~${s.sections[1]}개**다. 축의 하위 질문도 그 수만큼만 편다. 반론·한계, 역사·맥락처럼 축을 넓히는 구간은 두지 않고 축을 바로 증명하는 구간만 남긴다. 역할표의 그 역할은 "없음"으로 적어도 된다.
- 소스는 구간 수에 맞춰 줄어든다 — 역할이 없는 소스는 "역할 없는 소스"로 제외한다. 소스 3건 하한은 그대로다.
- 구간당 사례·일화는 하나, 수치는 가장 의외인 것 하나를 고른다. 재료를 압축해 담지 않는다 — 담지 못하는 재료는 뺀다.${original ? `\n- **축은 원본 편과 같은 질문을 유지한다**: 이 편은 발행된 편 "${original.title}"의 짧은 판이다.${original.axis ? ` 원본의 축: ${original.axis}` : ""} 축 문장을 다시 쓰더라도 같은 질문에 답해야 한다 — 다른 질문으로 옮기면 실험 조건이 깨진다.` : ""}`;
}

/** 대본 프롬프트에 덧붙이는 블록 (short 만) — 분량 목표와 짧은 판 도입 훅 */
export function lengthWriteBlock(profile: LengthProfile): string {
  if (profile !== "short") return "";
  const s = LENGTH_SPECS.short;
  return `\n\n## 짧은 판 — 분량과 도입 (KAN-296 실험, 이 편에 한해 위 규칙보다 우선)
- 분량: 하한 ${s.floorMin}분(약 ${s.floorChars.toLocaleString()}자)·상한 ${s.maxMin}분(약 ${s.maxChars!.toLocaleString()}자). 위 "분량"의 13분 하한은 이 편에 적용하지 않는다. 목표는 구성안의 예상 분량이다. 상한을 넘기면 해설 턴의 풀어 쓰기를 줄인다 — 재료를 더 넣지 않는다.
- 도입(규칙 13)을 **선취 훅**으로 쓴다: 인트로의 주제 선언 바로 뒤 첫 해설 턴이 이 편에서 가장 의외인 **결과 하나**(claims 의 수치·장면)를 한두 문장으로 먼저 말하고, 진행 턴 하나가 "왜"를 묻고, 바로 본문 구간 #1 로 들어간다. [도입] 구역은 그 두 턴이 전부다 — 경험담·사물·되받기 장면을 세우지 않는다. 결과는 claims 에 있는 그대로이고(헤지 유지), "보통은 이렇게 생각하지만 실은 반대"식 통념 반전 틀은 쓰지 않는다(규칙 13). 그 결과가 속한 구간에서는 같은 문장을 되풀이하지 않고 기제를 설명한다.
- 본문: 구간마다 해설 턴은 짧게, 진행 턴은 한 문장. 마무리 정리 턴은 구간 수만큼의 줄로만 수렴한다.`;
}

/** 비평(critic) 프롬프트에 덧붙이는 한 줄 (short 만) — 생성 맥락은 넘기지 않는다, 규격이 다르다는 사실만 */
export function lengthCriticNote(profile: LengthProfile): string {
  if (profile !== "short") return "";
  const s = LENGTH_SPECS.short;
  return `\n\n## 규격 알림 — 짧은 판
이 대본은 분량 ${s.floorMin}~${s.maxMin}분·본문 구간 ${s.sections[0]}~${s.sections[1]}개 규격으로 만들어졌다(KAN-296). 구간 수가 적은 것, 반론·맥락 구간이 없는 것, 도입이 결과 한 문장과 질문 한 턴뿐인 것은 규격이지 결함이 아니다 — 3.5·3.6 에서 그 이유로 감점하지 않는다. 그 밖의 항목은 그대로 평가한다.`;
}
