import { IsEnum } from 'class-validator';

import { PlayEntryPoint } from '../playback.enum';

/**
 * library-api.md 4.4.
 *
 * **`entry_point`가 판정을 바꾸지 않는다.** 어디서 시작하든 같은 규칙이며(`paywall.md` 4.2),
 * 판정에 쓰이면 진입점을 위조해 한도를 우회할 수 있다. 전환 분석용으로만 남긴다.
 *
 * 잔여 횟수·억제 여부·티어는 **받지 않는다.** 전역 `ValidationPipe`의 `whitelist`가
 * DTO에 없는 필드를 잘라내므로 클라이언트가 실어 보내도 서버에 도달하지 않는다.
 */
export class StartPlayRequestDto {
  @IsEnum(PlayEntryPoint)
  readonly entry_point: PlayEntryPoint;
}
