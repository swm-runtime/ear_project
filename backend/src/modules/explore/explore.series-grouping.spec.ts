import { Content } from '@/modules/content/entities/content.entity';

import {
  attachSeenSeries,
  encodeExploreCursor,
  readSeenSeries,
} from './explore.cursor';
import {
  GroupedPage,
  collectGroupedPage,
  groupBySeries,
} from './explore.series-grouping';

const S1 = '11111111-1111-4111-8111-111111111111';
const S2 = '22222222-2222-4222-8222-222222222222';

function content(id: string, seriesId: string | null = null): Content {
  return { id, seriesId } as Content;
}

interface Row {
  content: Content;
  rank: number;
}

/** 순위순 행 목록을 키셋 페이지로 흉내 낸다 — 위치는 순위(`rank`), 커서는 "이 순위 뒤부터" */
function fakeSource(rows: Row[]) {
  const calls: (number | null)[] = [];
  const fetchPage = (cursor: number | null, limit: number) => {
    calls.push(cursor);
    const after = rows.filter((row) => cursor === null || row.rank > cursor);
    return Promise.resolve({
      items: after.slice(0, limit),
      hasNext: after.length > limit,
    });
  };
  return { calls, fetchPage };
}

const ranked = (...contents: Content[]): Row[] =>
  contents.map((c, index) => ({ content: c, rank: index + 1 }));

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

describe('collectGroupedPage — 커서 페이지 접기', () => {
  it('페이지를 넘어도 같은 시리즈는 한 번만, 콘텐츠는 빠짐·중복 없이 전부 나온다', async () => {
    // given — S1 편이 1·3·5·7위에 흩어져 있다
    const rows = ranked(
      content('s1e2', S1),
      content('a'),
      content('s1e1', S1),
      content('b'),
      content('s1e3', S1),
      content('c'),
      content('s1e4', S1),
      content('d'),
    );
    const source = fakeSource(rows);
    const seen = new Set<string>();
    const pages: string[][] = [];
    let cursor: number | null = null;

    // when — 2개씩 끝까지 넘긴다
    for (let guard = 0; guard < 10; guard += 1) {
      const page: GroupedPage<Row> = await collectGroupedPage<Row, number>(
        (c) => source.fetchPage(c, 2),
        cursor,
        2,
        seen,
        (row) => row.rank,
      );
      pages.push(page.emitted.map((row) => row.content.id));
      if (!page.hasNext) {
        break;
      }
      cursor = page.lastScanned?.rank ?? null;
    }

    // then — 카드 자리는 S1의 가장 높은 순위 편(1위)
    expect(pages.flat()).toEqual(['s1e2', 'a', 'b', 'c', 'd']);
    expect(new Set(pages.flat()).size).toBe(pages.flat().length);
    expect(pages[0]).toEqual(['s1e2', 'a']);
  });

  it('건너뛴 편 때문에 모자라면 마지막으로 훑은 위치에서 이어 읽어 채운다', async () => {
    // given — 앞 페이지에서 S1이 이미 나갔고, 이번 구간 앞쪽이 전부 S1 편이다
    const rows = ranked(
      content('s1e2', S1),
      content('s1e3', S1),
      content('s1e4', S1),
      content('a'),
      content('b'),
    );
    const source = fakeSource(rows);

    // when
    const page = await collectGroupedPage<Row, number>(
      (c) => source.fetchPage(c, 2),
      null,
      2,
      new Set([S1]),
      (row) => row.rank,
    );

    // then — 세 번 읽었다(1~2위 → 3~4위 → 5위)
    expect(page.emitted.map((row) => row.content.id)).toEqual(['a', 'b']);
    expect(source.calls).toEqual([null, 2, 4]);
    expect(page.lastScanned?.rank).toBe(5);
    expect(page.hasNext).toBe(false);
  });

  it('limit을 채운 행 뒤에 같은 묶음 행이 남으면 has_next이고, 커서는 채운 행(훑은 마지막)이다', async () => {
    const rows = ranked(content('a'), content('b'), content('c'));
    const source = fakeSource(rows);

    const page = await collectGroupedPage<Row, number>(
      (c) => source.fetchPage(c, 3),
      null,
      2,
      new Set(),
      (row) => row.rank,
    );

    expect(page.emitted.map((row) => row.content.id)).toEqual(['a', 'b']);
    expect(page.lastScanned?.rank).toBe(2);
    expect(page.hasNext).toBe(true);
  });

  it('이어 읽기 상한에 걸리면 채운 만큼 내고 has_next를 유지한다', async () => {
    // given — 앞 페이지에서 나간 S1 편만 계속 나온다
    const rows = ranked(
      ...Array.from({ length: 20 }, (_, i) => content(`s1e${i}`, S1)),
      content('a'),
    );
    const source = fakeSource(rows);

    const page = await collectGroupedPage<Row, number>(
      (c) => source.fetchPage(c, 2),
      null,
      2,
      new Set([S1]),
      (row) => row.rank,
      3,
    );

    expect(page.emitted).toEqual([]);
    expect(page.hasNext).toBe(true);
    expect(page.lastScanned?.rank).toBe(6);
  });

  it('새로 낸 시리즈를 seen에 더한다 — 다음 커서에 싣는 값이다', async () => {
    const seen = new Set<string>();
    const source = fakeSource(ranked(content('s2e1', S2), content('a')));

    await collectGroupedPage<Row, number>(
      (c) => source.fetchPage(c, 5),
      null,
      5,
      seen,
      (row) => row.rank,
    );

    expect([...seen]).toEqual([S2]);
  });
});

describe('커서의 이미 낸 시리즈(g)', () => {
  const base = encodeExploreCursor(
    { playCount: 3, publishedAt: new Date('2026-10-17T00:00:00Z'), id: S1 },
    [],
  );

  it('정렬해 담고 그대로 읽는다 — 같은 입력이면 같은 커서다', () => {
    const a = attachSeenSeries(base, [S2, S1]);
    const b = attachSeenSeries(base, [S1, S2]);

    expect(a).toBe(b);
    expect(readSeenSeries(a)).toEqual([S1, S2]);
  });

  it('g가 없는 커서(스위치가 꺼져 있을 때 발급)는 빈 목록이다', () => {
    expect(readSeenSeries(base)).toEqual([]);
  });

  it('uuid가 아닌 값이 섞이면 거절한다', () => {
    const forged = Buffer.from(
      JSON.stringify({
        p: 1,
        t: '2026-10-17T00:00:00.000Z',
        i: S1,
        q: '',
        g: ['x'],
      }),
    ).toString('base64url');

    expect(() => readSeenSeries(forged)).toThrow();
  });
});
