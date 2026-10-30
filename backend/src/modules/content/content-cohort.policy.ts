import { ContentLengthProfile } from './content.enum';

/**
 * 짧은 판 코호트(KAN-298 — 단기 실험 ④, 2026-10-29)의 **판정 규칙을 이 파일에만 둔다.**
 *
 * 가입 시각이 `SHORT_CONTENT_COHORT_SINCE`(새 앱의 스토어 배포 시각) **이상**이면 `short`, 아니면 `standard`다. 설정이 비면 전원
 * `standard`(롤백 스위치 — 짧은 판은 아무에게도 노출되지 않는다). 앱은 코호트를 모른다(판정은 서버, 클라이언트는 표시만).
 *
 * 요청 경로는 access token의 가입 시각 클레임으로, 배치(드립·리텐션 알림)는 `users.created_at`으로 같은 함수를 부른다. 리텐션 알림의
 * 원시 SQL은 같은 규칙의 SQL판(`cohortLengthProfileSql`)을 쓴다 — 둘의 동치는 단위 테스트가 고정한다.
 */

/** 설정값 해석 — 비었거나(공백) 날짜가 아니면 null(= 전원 standard). 형식 검증은 env.validation이 부팅 때 한다 */
export function parseShortContentCohortSince(
  raw: string | undefined | null,
): Date | null {
  const trimmed = raw?.trim() ?? '';
  if (trimmed === '') {
    return null;
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * 가입 시각 → 코호트의 길이 프로필. 가입 시각을 모르면(클레임 없는 옛 토큰 — 이 기능 배포 전 발급) `standard`다: 배포 전 토큰을
 * 가진 사람은 배포 전 가입자이고, 경계(새 앱 배포)는 그보다 뒤다.
 */
export function resolveContentLengthProfile(
  signedUpAt: Date | null | undefined,
  since: Date | null,
): ContentLengthProfile {
  if (since === null || signedUpAt === null || signedUpAt === undefined) {
    return ContentLengthProfile.STANDARD;
  }
  return signedUpAt.getTime() >= since.getTime()
    ? ContentLengthProfile.SHORT
    : ContentLengthProfile.STANDARD;
}

/**
 * 같은 규칙의 SQL판 — 사용자 행을 SQL 안에서 도는 조회(리텐션 알림 "듣던 콘텐츠")가 쓴다. `sinceParam`은 timestamptz 파라미터
 * 자리(`$8` 등)이고 NULL이면 전원 standard다
 */
export function cohortLengthProfileSql(
  signedUpAtColumn: string,
  sinceParam: string,
): string {
  return `(CASE WHEN ${sinceParam}::timestamptz IS NOT NULL AND ${signedUpAtColumn} >= ${sinceParam}::timestamptz THEN '${ContentLengthProfile.SHORT}' ELSE '${ContentLengthProfile.STANDARD}' END)`;
}
