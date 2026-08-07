/**
 * 서버 통신 DTO — library-api.md 4.4(재생 시작)와 잔여 표시값 공통 규약(같은 문서 2장)을
 * snake_case 그대로 선언한다(convention.md 5.1). camelCase 변환은 player.api.ts 안에서만 일어난다.
 */
import type { PlayedLibraryItemStatus, PlayEntryPoint } from '../player.types';

/** 잔여 재생 표시값 — 목록·복원·재생 시작 응답에 같은 이름으로 얹힌다(library-api.md 2) */
export interface PlayLimitFieldsDto {
  daily_play_limit: number | null;
  daily_play_count: number | null;
  service_date: string;
}

export interface PlaybackProgressDto {
  position_sec: number;
  max_reached_sec: number;
}

/** POST /contents/:content_id/play (library-api.md 4.4) */
export interface PlayStartRequestDto {
  entry_point: PlayEntryPoint;
}

export interface PlayStartResponseDto extends PlayLimitFieldsDto {
  counted: boolean;
  library_item: {
    id: string;
    status: PlayedLibraryItemStatus;
    last_played_at: string;
  } | null;
  progress: PlaybackProgressDto | null;
}
