import { IsString, MaxLength } from 'class-validator';

/**
 * `player-api.md` 4.1 — 발급 요청.
 *
 * `device_id`만 받는다. **`audio_access_logs`에 기록하기 위한 값이지 판정 입력이 아니다**
 * (domain.md 6.5) — 이상 탐지의 축이며, 이 값으로 허용 여부가 갈리지 않는다.
 *
 * 티어·잔여 횟수·회수 여부는 받지 않는다. 전부 토큰과 서버 조회로 도출한다
 * (architecture.md 9.2).
 */
export class IssueAudioUrlRequestDto {
  @IsString()
  @MaxLength(200)
  readonly device_id: string;
}
