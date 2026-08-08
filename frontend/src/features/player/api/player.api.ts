import { apiClient } from '@/shared/api/api-client';

import { IS_PLAY_API_MOCKED } from '../player.constants';
import type {
  PlaybackProgress,
  PlayEntryPoint,
  PlayLimitSnapshot,
  PlayStartResult,
} from '../player.types';
import type { PlaybackProgressDto, PlayLimitFieldsDto, PlayStartResponseDto } from './player.dto';
import { mockStartPlay } from './player.mock';

/* ── 변환 — snake_case ↔ camelCase 변환은 이 모듈 안에서만 일어난다 ── */

/** 잔여 표시값 세 필드(library-api.md 2) — 목록·복원 응답을 다루는 library도 가져다 쓴다 */
export const toPlayLimitSnapshot = (dto: PlayLimitFieldsDto): PlayLimitSnapshot => ({
  dailyPlayLimit: dto.daily_play_limit,
  dailyPlayCount: dto.daily_play_count,
  serviceDate: dto.service_date,
});

export const toPlaybackProgress = (dto: PlaybackProgressDto | null): PlaybackProgress | null =>
  dto ? { positionSec: dto.position_sec, maxReachedSec: dto.max_reached_sec } : null;

const toPlayStartResult = (dto: PlayStartResponseDto): PlayStartResult => ({
  counted: dto.counted,
  libraryItem: dto.library_item
    ? {
        id: dto.library_item.id,
        status: dto.library_item.status,
        lastPlayedAt: dto.library_item.last_played_at,
      }
    : null,
  progress: toPlaybackProgress(dto.progress),
  playLimit: toPlayLimitSnapshot(dto),
});

/* ── 엔드포인트 — mock 분기는 각 함수 진입점 한 곳에서만 한다 ── */

/**
 * 재생 시작(library-api.md 4.4) — 한도 판정·카운트 적재가 서버에서 일어난다.
 * 사용자가 시작한 액션이고 403은 재시도로 풀리지 않으므로 자동 재시도를 끈다.
 */
export const startPlay = async (input: {
  contentId: string;
  entryPoint: PlayEntryPoint;
}): Promise<PlayStartResult> => {
  const data = IS_PLAY_API_MOCKED
    ? await mockStartPlay(input.contentId)
    : (
        await apiClient.post<PlayStartResponseDto>(
          `/contents/${input.contentId}/play`,
          { entry_point: input.entryPoint },
          { noAutoRetry: true },
        )
      ).data;
  return toPlayStartResult(data);
};
