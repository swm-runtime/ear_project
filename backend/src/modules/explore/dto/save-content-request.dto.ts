import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

import { SaveReason } from '../explore.enum';

/**
 * `client_seq`의 상한. 순번은 앱 세션 동안 단조 증가하는 값이라 상한이 의미상 없지만,
 * 서버는 정수 범위를 벗어난 값을 받지 않는다(architecture.md 9.3).
 */
const MAX_CLIENT_SEQ = Number.MAX_SAFE_INTEGER;

/**
 * explore-api.md 4.3.
 *
 * **`[오늘은 그만 보기]` 억제 상태·잔여 횟수·티어를 받지 않는다**(2장). 전역
 * `ValidationPipe`(`whitelist: true`, `forbidNonWhitelisted: true`)가 DTO에 없는 필드를
 * 잘라내므로 클라이언트가 실어 보내도 서버에 도달하지 않는다.
 */
export class SaveContentRequestDto {
  /**
   * 이 콘텐츠에 대한 담기·해제 조작의 클라이언트 단조 증가 순번.
   *
   * **서버는 저장·판정하지 않고 응답에 그대로 되돌린다.** 순서를 서버가 판정하려면
   * 콘텐츠×사용자별 최종 순번을 저장해야 하는데, 그것은 표시 순서 문제를 풀자고 컬럼을
   * 만드는 일이다(domain.md 1.5와 같은 종류). 담기·해제는 각각 멱등이라 서버 상태는 마지막
   * 도착 요청으로 수렴하고, 화면 표시만 맞추면 된다.
   */
  @IsInt()
  @Min(0)
  @Max(MAX_CLIENT_SEQ)
  readonly client_seq: number;

  /**
   * 기본값은 `user_save`이며 **Service에서 정한다**(convention.md 3.3).
   * `auto_play`(탐색 재생 자동 적립)는 `user_signals` 적재 여부만 가른다.
   */
  @IsOptional()
  @IsEnum(SaveReason)
  readonly reason?: SaveReason;
}
