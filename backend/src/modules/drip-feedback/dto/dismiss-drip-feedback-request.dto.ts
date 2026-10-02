import { IsISO8601, Matches } from 'class-validator';

/** `POST /users/me/drip-feedback/dismiss` — 팝업이 받은 `placed_date`를 그대로 되돌린다 */
export class DismissDripFeedbackRequestDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  // 형식만 맞고 달력에 없는 날짜(`2026-13-45`)는 `date` 컬럼 저장에서 DB 오류(500)가 된다 — 여기서 400으로 막는다
  @IsISO8601({ strict: true })
  readonly placed_date: string;
}
