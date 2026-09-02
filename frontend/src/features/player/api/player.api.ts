import { apiClient } from '@/shared/api/api-client';
import { getDeviceId } from '@/shared/lib/device-id';

import { IS_PLAY_API_MOCKED, IS_PLAYER_API_MOCKED } from '../player.constants';
import type {
  AudioIssueResult,
  PlaybackProgress,
  PlayEntryPoint,
  PlayLimitSnapshot,
  PlayStartResult,
  ProgressSaveResult,
} from '../player.types';
import type {
  AudioUrlsRequestDto,
  AudioUrlsResponseDto,
  PlaybackProgressDto,
  PlaybackProgressPutRequestDto,
  PlaybackProgressPutResponseDto,
  PlayLimitFieldsDto,
  PlayStartResponseDto,
} from './player.dto';
import {
  mockIssueAudioUrls,
  mockSavePlaybackProgress,
  mockSendReplaySignal,
  mockSendSourceLinkClick,
  mockStartPlay,
} from './player.mock';

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

const toAudioIssueResult = (dto: AudioUrlsResponseDto): AudioIssueResult => ({
  content: {
    id: dto.content.id,
    title: dto.content.title,
    authorName: dto.content.author_name,
    sourceName: dto.content.source_name,
    sourceUrl: dto.content.source_url,
    durationSec: dto.content.duration_sec,
    thumbnailUrl: dto.content.thumbnail_url,
    contentVersion: dto.content.content_version,
  },
  libraryItem: dto.library_item
    ? { id: dto.library_item.id, status: dto.library_item.status }
    : null,
  progress: toPlaybackProgress(dto.progress),
  audio: {
    url: dto.audio.url,
    expiresAt: dto.audio.expires_at,
    expiresInSec: dto.audio.expires_in_sec,
  },
});

const toProgressSaveResult = (dto: PlaybackProgressPutResponseDto): ProgressSaveResult => ({
  positionSec: dto.position_sec,
  maxReachedSec: dto.max_reached_sec,
  contentVersion: dto.content_version,
  libraryItem: dto.library_item
    ? {
        id: dto.library_item.id,
        status: dto.library_item.status,
        completedAt: dto.library_item.completed_at,
      }
    : null,
});

/* ── 엔드포인트 — mock 분기는 각 함수 진입점 한 곳에서만 한다 ── */

/**
 * 재생 시작(library-api.md 4.4) — 한도 판정·카운트 적재가 서버에서 일어난다.
 * 호출 시점은 오디오가 실제로 소리를 낸 시점이다(paywall.md 4.3 — PlaybackService가 소유).
 * 403은 재시도로 풀리지 않으므로 자동 재시도를 끈다.
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

/**
 * 서명 URL 발급 + 진입 메타(player-api.md 4.1). 재생 중 갱신도 같은 호출이다.
 * 발급은 판정을 거치되 차감하지 않는다 — 403 분기는 재생 시작과 같은 코드로 처리한다.
 */
export const issueAudioUrls = async (input: { contentId: string }): Promise<AudioIssueResult> => {
  if (IS_PLAYER_API_MOCKED) {
    return toAudioIssueResult(await mockIssueAudioUrls(input.contentId));
  }
  const body: AudioUrlsRequestDto = { device_id: await getDeviceId() };
  const { data } = await apiClient.post<AudioUrlsResponseDto>(
    `/contents/${input.contentId}/audio-urls`,
    body,
  );
  return toAudioIssueResult(data);
};

/**
 * 재생 위치 저장(player-api.md 4.3) — 절대값 저장이라 멱등키가 없다.
 * listened_sec_delta는 직전 반영 성공 이후의 증분이다 — 실패 시 호출자가 누적을 유지한다.
 * 백그라운드 동기화이므로 실패를 사용자에게 알리지 않는다(common-error-handling.md 4.3).
 */
export const savePlaybackProgress = async (input: {
  contentId: string;
  positionSec: number;
  maxReachedSec: number;
  listenedSecDelta: number;
  contentVersion: number;
}): Promise<ProgressSaveResult> => {
  const body: PlaybackProgressPutRequestDto = {
    position_sec: input.positionSec,
    max_reached_sec: input.maxReachedSec,
    listened_sec_delta: input.listenedSecDelta,
    content_version: input.contentVersion,
  };
  const data = IS_PLAYER_API_MOCKED
    ? await mockSavePlaybackProgress(input.contentId, body)
    : (
        await apiClient.put<PlaybackProgressPutResponseDto>(
          `/users/me/playback-progresses/${input.contentId}`,
          body,
        )
      ).data;
  return toProgressSaveResult(data);
};

/**
 * replay 신호(player-api.md 4.4) — 완료 상태에서 위치 0 재생이 실제로 시작된 시점에 보낸다.
 * Idempotency-Key 필수 — 재전송 중복이 replay_count·드립 스코어링을 부풀린다.
 */
export const sendReplaySignal = async (input: {
  contentId: string;
  idempotencyKey: string;
}): Promise<void> => {
  if (IS_PLAYER_API_MOCKED) {
    await mockSendReplaySignal(input.contentId);
    return;
  }
  await apiClient.post(`/contents/${input.contentId}/replay`, undefined, {
    idempotencyKey: input.idempotencyKey,
  });
};

/**
 * 원문 유입 클릭 적재(player-api.md 4.5) — 라이브러리·탐색·플레이어 세 화면 공용 계약.
 * 인앱 브라우저 열기는 이 요청의 성공을 기다리지 않는다. Idempotency-Key 필수.
 */
export const sendSourceLinkClick = async (input: {
  contentId: string;
  idempotencyKey: string;
}): Promise<void> => {
  if (IS_PLAYER_API_MOCKED) {
    await mockSendSourceLinkClick(input.contentId);
    return;
  }
  await apiClient.post(`/contents/${input.contentId}/source-link-clicks`, undefined, {
    idempotencyKey: input.idempotencyKey,
  });
};
