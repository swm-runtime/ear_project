import { Matches, MaxLength } from 'class-validator';

/** `YYYY-MM-DD` — 서비스 날짜 라벨은 타임존 없는 고정 형식이다(`profile-api.md` 2장) */
const DATE_LABEL_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DATE_LABEL_LENGTH = 10;

/**
 * profile-api.md 4.2 — 조회할 주의 **월요일 라벨**.
 *
 * 직전 응답의 `previous_week_start`(또는 `next_week_start`)를 그대로 되돌려 보내는 값이라
 * 정상 경로에서는 항상 유효하다. **DTO는 형식만 본다**(convention.md 3.3) — 실제로 월요일인지,
 * 가입 주~이번 주 범위 안인지는 도메인 판정이라 Orchestrator가 한다.
 *
 * `@IsISO8601()`을 쓰지 않는 이유: 그 검증은 `2026-08-03T00:00:00Z` 같은 시각 문자열도
 * 통과시킨다. 여기서 받는 것은 시각이 아니라 **날짜 라벨**이므로 형식을 좁게 고정한다.
 */
export class WeeklyListeningQueryRequestDto {
  @Matches(DATE_LABEL_PATTERN)
  @MaxLength(DATE_LABEL_LENGTH)
  readonly week_start: string;
}
