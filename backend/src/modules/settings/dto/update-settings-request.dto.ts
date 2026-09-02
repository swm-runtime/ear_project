import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional } from 'class-validator';

import { PlaybackRate } from '@/modules/user/user.enum';

/**
 * settings-api.md 4.2 — 바꿀 필드만 보내는 부분 갱신.
 *
 * **마케팅 수신 동의 필드를 받지 않는다.** 전역 `ValidationPipe`가 잘라내는 것과 별개로
 * 계약에 존재하지 않는다 — 저장 구조가 달라(이력 append) 별도 엔드포인트(4.3)다.
 *
 * **세 설정 필드 중 최소 하나는 있어야 한다.** 그 판정은 DTO가 아니라 Controller/Service가
 * 한다 — class-validator로 "필드 조합"을 검증하면 규칙이 데코레이터 안에 숨는다.
 */
export class UpdateSettingsRequestDto {
  /**
   * 허용값 밖이면 400. **서버가 검증한다**(7장) — 클라이언트를 우회해 임의 배속을 저장할 수
   * 없어야 한다.
   */
  @IsOptional()
  @Type(() => Number)
  @IsEnum(PlaybackRate)
  readonly default_playback_rate?: PlaybackRate;

  @IsOptional()
  @IsBoolean()
  readonly is_auto_expand_enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  readonly is_drip_notification_enabled?: boolean;

  /**
   * 사용자별 설정 조작의 단조 증가 순번(`settings.md` 7장 — 마지막 상태가 최종).
   *
   * **서버는 저장·판정하지 않고 응답에 그대로 되돌린다.** 순번을 서버가 비교하려면 사용자별
   * 최종 순번을 저장해야 하는데, 표시 순서 문제를 풀자고 컬럼을 만드는 것이다
   * (`explore-api.md` 4.3과 같은 논리). 절대값 저장이라 서버 상태는 마지막 도착 요청으로
   * 수렴하고, 화면 표시만 맞추면 된다.
   */
  @Type(() => Number)
  @IsInt()
  readonly client_seq: number;
}
