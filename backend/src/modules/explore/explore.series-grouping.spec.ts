import { Content } from '@/modules/content/entities/content.entity';

import { groupBySeries } from './explore.series-grouping';

const S1 = '11111111-1111-4111-8111-111111111111';
const S2 = '22222222-2222-4222-8222-222222222222';

function content(id: string, seriesId: string | null = null): Content {
  return { id, seriesId } as Content;
}

describe('groupBySeries — 섹션 접기', () => {
  it('시리즈는 처음 만난(순위가 가장 높은) 편 자리에 한 번, 단일 콘텐츠는 그대로 — 자른 뒤 limit', () => {
    const result = groupBySeries(
      [
        content('a'),
        content('s1e3', S1),
        content('b'),
        content('s1e1', S1),
        content('s2e1', S2),
        content('c'),
      ],
      4,
    );

    expect(result.map((c) => c.id)).toEqual(['a', 's1e3', 'b', 's2e1']);
  });
});
