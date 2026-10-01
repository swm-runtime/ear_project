import { Matches } from 'class-validator';

/** `POST /users/me/drip-feedback/dismiss` — 팝업이 받은 `placed_date`를 그대로 되돌린다 */
export class DismissDripFeedbackRequestDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  readonly placed_date: string;
}
