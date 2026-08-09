import { Type } from 'class-transformer';
import { IsBoolean, IsInt } from 'class-validator';

/**
 * settings-api.md 4.3 — 마케팅 수신 동의 토글.
 *
 * **`is_agreed`는 토글의 절대값이다.** `false`가 철회이며, 둘 다 `consents`에 새 행을
 * 추가한다(domain.md 3.2 — append-only).
 */
export class UpdateMarketingConsentRequestDto {
  @IsBoolean()
  readonly is_agreed: boolean;

  /** 4.2와 같은 의미 — 서버는 저장·판정하지 않고 되돌린다 */
  @Type(() => Number)
  @IsInt()
  readonly client_seq: number;
}
