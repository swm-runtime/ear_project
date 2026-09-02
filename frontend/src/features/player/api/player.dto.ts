/**
 * 서버 통신 DTO — library-api.md 4.4(재생 시작)·player-api.md 4.1~4.5를
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

/** POST /contents/:content_id/audio-urls (player-api.md 4.1) */
export interface AudioUrlsRequestDto {
  device_id: string;
}

export interface AudioUrlsResponseDto {
  content: {
    id: string;
    title: string;
    author_name: string;
    source_name: string;
    source_url: string | null;
    duration_sec: number;
    thumbnail_url: string;
    content_version: number;
  };
  library_item: { id: string; status: PlayedLibraryItemStatus } | null;
  progress: PlaybackProgressDto | null;
  audio: {
    url: string;
    expires_at: string;
    expires_in_sec: number;
  };
}

/** PUT /users/me/playback-progresses/:content_id (player-api.md 4.3) */
export interface PlaybackProgressPutRequestDto {
  position_sec: number;
  max_reached_sec: number;
  /** 직전 반영 성공 이후 실제로 소리를 낸 경과 시간(초) — 절대값이 아니라 증분이다 */
  listened_sec_delta: number;
  content_version: number;
}

export interface PlaybackProgressPutResponseDto {
  position_sec: number;
  max_reached_sec: number;
  content_version: number;
  library_item: {
    id: string;
    status: PlayedLibraryItemStatus;
    completed_at: string | null;
  } | null;
}
