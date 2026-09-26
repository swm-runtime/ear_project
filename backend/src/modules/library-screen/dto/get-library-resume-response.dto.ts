import { LibraryItemStatus } from '@/modules/library/library.enum';

import { LibraryItemView, LibraryResumeResult } from '../library-screen.types';

class ResumeContentDto {
  readonly id: string;
  readonly title: string;
  readonly duration_sec: number;
  readonly thumbnail_url: string;
  readonly content_version: number;
  /**
   * 목록 응답(4.1)의 `content.topic_ids`와 **같은 출처·같은 모양**이다(KAN-91).
   * 미니플레이어가 제목 아래 카테고리 줄을 그리는데, 이 필드가 없으면 앱 재실행 직후
   * 복원 스냅샷에서만 그 줄이 사라져 같은 카드가 상황에 따라 한 줄/두 줄이 된다.
   * 주제가 없으면 **`null`이 아니라 빈 배열**이다 — 화면이 분기하지 않게 한다.
   */
  readonly topic_ids: string[];
}

class ResumeProgressDto {
  readonly position_sec: number;
  readonly max_reached_sec: number;
}

class ResumeTargetDto {
  readonly id: string;
  readonly status: LibraryItemStatus;
  readonly last_played_at: string | null;
  readonly is_counted_today: boolean;
  readonly content: ResumeContentDto;
  readonly progress: ResumeProgressDto | null;
}

/**
 * library-api.md 4.3.
 *
 * **대상이 없어도 200이다.** 신규 사용자와 완청만 있는 사용자에게는 대상이 없는 것이
 * 정상이며, 클라이언트는 같은 응답에서 잔여 재생 표시값까지 함께 받아야 한다.
 *
 * **자동 재생 여부를 담지 않는다** — 미니플레이어는 언제나 일시정지 상태로 뜬다.
 */
export class GetLibraryResumeResponseDto {
  readonly resume_target: ResumeTargetDto | null;
  readonly daily_play_limit: number | null;
  readonly daily_play_count: number | null;
  readonly service_date: string;

  static from(result: LibraryResumeResult): GetLibraryResumeResponseDto {
    return {
      resume_target: result.resumeTarget
        ? toResumeTarget(result.resumeTarget)
        : null,
      daily_play_limit: result.quota.dailyPlayLimit,
      daily_play_count: result.quota.dailyPlayCount,
      service_date: result.quota.serviceDate,
    };
  }
}

function toResumeTarget(view: LibraryItemView): ResumeTargetDto {
  return {
    id: view.id,
    status: view.status,
    last_played_at: view.lastPlayedAt?.toISOString() ?? null,
    is_counted_today: view.isCountedToday,
    content: {
      id: view.content.id,
      title: view.content.title,
      duration_sec: view.content.durationSec,
      thumbnail_url: view.content.thumbnailUrl,
      content_version: view.content.contentVersion,
      topic_ids: view.content.topicIds,
    },
    progress: view.progress
      ? {
          position_sec: view.progress.positionSec,
          max_reached_sec: view.progress.maxReachedSec,
        }
      : null,
  };
}
