import { Type } from 'class-transformer';
import { IsBoolean, IsInt, Max, Min } from 'class-validator';

/** 순번은 단조 증가하는 정수다 — 정수 범위 밖 값을 받지 않는다(architecture.md 9.3, explore DTO와 같은 상한) */
const MAX_CLIENT_SEQ = Number.MAX_SAFE_INTEGER;

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
  @Min(0)
  @Max(MAX_CLIENT_SEQ)
  readonly client_seq: number;
}
