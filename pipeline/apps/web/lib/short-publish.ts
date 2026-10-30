import { shortHookFor } from "@ear/pipeline/length-profile";

/**
 * 짧은 판 발행 필드 (KAN-296 · BE KAN-298 — admin-api 4.6 "짧은 판 필드 검증" · 4.24).
 *
 * 패키지 `upload-meta.json` 의 `length_profile` 은 그대로, `remake_of_content_ref`(원본의 제품 content_id)는 `variant_of_content_id` 로
 * 이름을 바꿔 보낸다. `intro_version` 은 서버 지표(4.22-6) 전용이고 값 이름은 파이프라인이 정한다 — 이 편의 도입 훅 형태(후보 번호 홀짝,
 * `shortHookFor`)를 `hook-payoff` · `hook-promise` 로 싣는다. 기존 판은 이 값이 비어 "기존 도입부"로 묶인다.
 *
 * 노출은 서버가 가입 코호트로 가른다(`SHORT_CONTENT_COHORT_SINCE` — 비어 있으면 아무에게도 나가지 않는다). 서버가 이 필드를 모르면
 * (KAN-298 배포 전) 모르는 필드로 400 이라 일반 편으로 새어 나가지 않는다.
 */
export interface ShortMeta { backlog_id: string; length_profile?: string | null; remake_of_content_ref?: string | null }

export interface ShortUploadFields { length_profile: "short"; variant_of_content_id?: string; intro_version: string }

export const isShortMeta = (m: Pick<ShortMeta, "length_profile"> | null | undefined): boolean => m?.length_profile === "short";

export const shortIntroVersion = (backlogId: string): string => `hook-${shortHookFor(backlogId).key}`;

/**
 * 업로드 payload 에 더할 짧은 판 필드. 기존 판이면 `fields` 가 null.
 * 단편은 원본이 필수라(없으면 서버 400) 원본 content_id 가 없으면 `blocker` 로 막는다. 시리즈 편은 원본이 선택이다 — 있으면 싣는다.
 */
export function shortUploadFields(meta: ShortMeta, kind: "single" | "series"): { fields: ShortUploadFields | null; blocker: string | null } {
  if (!isShortMeta(meta)) return { fields: null, blocker: null };
  const ref = meta.remake_of_content_ref?.trim() || null;
  if (!ref && kind === "single") return { fields: null, blocker: `${meta.backlog_id} 짧은 판의 원본 제품 content_id(remake_of_content_ref)가 패키지에 없다 — 원본이 발행 기록 없이 올라갔다. 원본 행에 제품 content_id 를 남긴 뒤 [패키지]를 다시 건다` };
  return { fields: { length_profile: "short", ...(ref ? { variant_of_content_id: ref } : {}), intro_version: shortIntroVersion(meta.backlog_id) }, blocker: null };
}

/** 제품 시리즈 생성 필드 — 짧은 판 시리즈는 원본 시리즈의 제품 id 가 필수다(없으면 서버 400). 원본이 아직 제품에 없으면 막는다 */
export function shortSeriesFields(variantOfSeriesId: string | null): { fields: { length_profile: "short"; variant_of_series_id: string } | null; blocker: string | null } {
  const id = variantOfSeriesId?.trim() || null;
  if (!id) return { fields: null, blocker: "원본 시리즈의 제품 series_id 가 없다 — 원본 시리즈가 [시리즈 발행]으로 올라간 기록(published_series_id)이 있어야 짧은 판 시리즈를 만든다" };
  return { fields: { length_profile: "short", variant_of_series_id: id }, blocker: null };
}
