import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

/**
 * `player-api.md` 4.3 — 위치 저장.
 *
 * **완청 여부를 클라이언트가 선언하지 않는다.** 완청은 이 요청을 받은 서버가
 * `max_reached_sec`으로 판정한다(`player.md` 4.4) — 완료를 선언할 수 있는 필드 자체를 두지
 * 않는다. 두면 `library.md` 4.4가 제거한 수동 완료 표시가 API 형태로 되살아난다.
 *
 * **상한을 DTO에 두지 않는다.** `duration_sec` 초과는 형식 오류가 아니라 경계·배속 타이밍
 * 오차라 거부가 아니라 보정 대상이고(4.3 서버 처리 3), 콘텐츠마다 값이 달라 DTO가 알 수
 * 없다. 여기서는 **음수만** 막는다.
 */
export class SaveProgressRequestDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  readonly position_sec: number;

  /**
   * 클라이언트가 추적한 **연속 도달 최대 위치.** 시크로 점프한 위치는 포함하지 않는다 —
   * 그 구분이 2배속 완주(완청)와 시크 점프(완청 아님)를 가른다.
   */
  @Type(() => Number)
  @IsInt()
  @Min(0)
  readonly max_reached_sec: number;

  /**
   * **직전 반영 성공 이후** 재생기가 실제로 소리를 낸 경과 시간(초). 0을 허용한다.
   *
   * 절대값이 아니라 증분인 이유는 `play_records.listened_sec`이 하루·콘텐츠당 1행에
   * 누적되는 값이고 여러 기기가 같은 행에 적산하기 때문이다 — 절대값으로 보내면 다른
   * 기기의 적산분을 덮어쓴다.
   */
  @Type(() => Number)
  @IsInt()
  @Min(0)
  readonly listened_sec_delta: number;

  /** 발급(4.1) 응답에서 받은 값. 서버 값과 다르면 저장하지 않는다 */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  readonly content_version: number;
}
