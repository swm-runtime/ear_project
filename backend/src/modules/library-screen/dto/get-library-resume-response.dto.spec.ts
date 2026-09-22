import {
  LibraryItemSource,
  LibraryItemStatus,
} from '@/modules/library/library.enum';

import { LibraryItemView, LibraryResumeResult } from '../library-screen.types';
import { GetLibraryResumeResponseDto } from './get-library-resume-response.dto';

/**
 * KAN-91 — 복원 스냅샷의 `content` 가 목록 응답(4.1)의 `content` 와 **같은 모양**이어야 한다.
 * 어긋나면 미니플레이어가 앱 재실행 직후에만 카테고리 줄을 잃어, 같은 카드가 상황에 따라
 * 한 줄/두 줄이 된다(`library-api.md` 4.3).
 */
function view(topicIds: string[]): LibraryItemView {
  return {
    id: 'item-1',
    source: LibraryItemSource.DRIP,
    status: LibraryItemStatus.IN_PROGRESS,
    addedAt: new Date('2026-09-20T00:00:00.000Z'),
    lastPlayedAt: new Date('2026-09-22T00:12:30.000Z'),
    completedAt: null,
    isCountedToday: true,
    content: {
      id: 'content-1',
      title: '번아웃 없이 오래 일하는 법',
      authorName: null,
      sourceName: '이어',
      sourceUrl: null,
      durationSec: 620,
      thumbnailUrl: 'https://cdn.example/thumb.webp',
      contentVersion: 1,
      topicIds,
    },
    progress: { contentId: 'content-1', positionSec: 372, maxReachedSec: 372 },
  };
}

function result(resumeTarget: LibraryItemView | null): LibraryResumeResult {
  return {
    resumeTarget,
    quota: { dailyPlayLimit: 2, dailyPlayCount: 1, serviceDate: '2026-09-22' },
  };
}

describe('GetLibraryResumeResponseDto — 복원 대상 응답(library-api.md 4.3)', () => {
  it('복원 대상의 content 에 topic_ids 를 그대로 싣는다 — 목록 응답과 같은 출처다', () => {
    const dto = GetLibraryResumeResponseDto.from(
      result(view(['topic-a', 'topic-b'])),
    );

    expect(dto.resume_target?.content.topic_ids).toEqual([
      'topic-a',
      'topic-b',
    ]);
  });

  it('**주제가 없으면 빈 배열이다 — null 이 아니다.** 화면이 분기하지 않게 한다', () => {
    const dto = GetLibraryResumeResponseDto.from(result(view([])));

    expect(dto.resume_target?.content.topic_ids).toEqual([]);
  });

  it('대상이 없으면 종전대로 resume_target 이 null 이고 잔여 표시값은 남는다', () => {
    const dto = GetLibraryResumeResponseDto.from(result(null));

    expect(dto.resume_target).toBeNull();
    expect(dto.daily_play_limit).toBe(2);
    expect(dto.service_date).toBe('2026-09-22');
  });
});
