import { FirstDripJobStatus } from '@/modules/drip/drip.enum';

import { GetFirstDripResponseDto } from './get-first-drip-response.dto';

describe('GetFirstDripResponseDto', () => {
  it('완료 상태면 열 편 id를 snake_case로 싣는다', () => {
    // given
    const completedAt = new Date('2026-10-29T09:12:03Z');

    // when
    const dto = GetFirstDripResponseDto.from({
      status: FirstDripJobStatus.COMPLETED,
      itemCount: 2,
      completedAt,
      firstContentId: 'content-1',
    });

    // then
    expect(dto).toEqual({
      status: FirstDripJobStatus.COMPLETED,
      library_item_count: 2,
      completed_at: '2026-10-29T09:12:03.000Z',
      first_content_id: 'content-1',
    });
  });

  it('열 편이 없으면 필드를 빼지 않고 null로 내린다', () => {
    // given — 앱은 키가 없는 옛 서버 응답도 null로 다루지만, 새 서버는 키를 항상 싣는다

    // when
    const dto = GetFirstDripResponseDto.from({
      status: FirstDripJobStatus.PENDING,
      itemCount: 0,
      completedAt: null,
      firstContentId: null,
    });

    // then
    expect(dto).toHaveProperty('first_content_id', null);
  });
});
