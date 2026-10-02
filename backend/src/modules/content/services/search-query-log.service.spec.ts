import { SearchQueryLogRepository } from '../repositories/search-query-log.repository';
import { SearchQueryLog } from '../entities/search-query-log.entity';
import {
  isSameTyping,
  SearchQueryLogService,
} from './search-query-log.service';

describe('SearchQueryLogService', () => {
  let repository: jest.Mocked<SearchQueryLogRepository>;
  let service: SearchQueryLogService;

  const USER_ID = '11111111-1111-4111-8111-111111111111';
  const NOW = new Date('2026-10-01T09:00:10.000Z');
  const ENTRY = {
    userId: USER_ID,
    normalizedQuery: '커리어',
    resultCount: 3,
    hasNext: false,
    topicFilterCount: 0,
    resultContentIds: ['c1', 'c2', 'c3'],
  };

  const latestRow = (query: string, updatedAt: Date): SearchQueryLog =>
    ({
      id: '7',
      userId: USER_ID,
      query,
      resultCount: 0,
      hasNext: false,
      topicFilterCount: 0,
      resultContentIds: [],
      createdAt: updatedAt,
      updatedAt,
    }) as unknown as SearchQueryLog;

  beforeEach(() => {
    repository = {
      insert: jest.fn().mockResolvedValue(undefined),
      overwrite: jest.fn().mockResolvedValue(undefined),
      findLatestByUserId: jest.fn().mockResolvedValue(null),
      summarize: jest.fn(),
    } as unknown as jest.Mocked<SearchQueryLogRepository>;
    service = new SearchQueryLogService(repository);
  });

  describe('record', () => {
    it('직전 행이 없으면 질의·첫 페이지 건수·다음 페이지 유무·주제 필터 수를 한 행으로 적재한다', async () => {
      // given
      // when
      await service.record(ENTRY, NOW);

      // then
      expect(repository.insert).toHaveBeenCalledWith({
        userId: USER_ID,
        query: '커리어',
        resultCount: 3,
        hasNext: false,
        topicFilterCount: 0,
        resultContentIds: ['c1', 'c2', 'c3'],
      });
      expect(repository.overwrite).not.toHaveBeenCalled();
    });

    it('묶음 창 안의 직전 행이 접두사면 새 행 대신 그 행을 덮어쓴다 — 디바운스 중간 입력을 접는다', async () => {
      // given — 3초 전에 "커리"를 쳤다
      repository.findLatestByUserId.mockResolvedValue(
        latestRow('커리', new Date(NOW.getTime() - 3_000)),
      );

      // when
      await service.record(ENTRY, NOW);

      // then
      expect(repository.overwrite).toHaveBeenCalledWith('7', {
        query: '커리어',
        resultCount: 3,
        hasNext: false,
        topicFilterCount: 0,
        resultContentIds: ['c1', 'c2', 'c3'],
      });
      expect(repository.insert).not.toHaveBeenCalled();
    });

    it('지우고 다시 쳐서 짧아진 질의도 같은 묶음이다', async () => {
      // given — "커리어"를 쳤다가 "커"로 지웠다
      repository.findLatestByUserId.mockResolvedValue(
        latestRow('커리어', new Date(NOW.getTime() - 1_000)),
      );

      // when
      await service.record({ ...ENTRY, normalizedQuery: '커' }, NOW);

      // then
      expect(repository.overwrite).toHaveBeenCalledWith(
        '7',
        expect.objectContaining({ query: '커' }),
      );
    });

    it('묶음 창을 넘긴 직전 행은 접두사여도 새 검색이다', async () => {
      // given — 11초 전
      repository.findLatestByUserId.mockResolvedValue(
        latestRow('커리', new Date(NOW.getTime() - 11_000)),
      );

      // when
      await service.record(ENTRY, NOW);

      // then
      expect(repository.insert).toHaveBeenCalled();
      expect(repository.overwrite).not.toHaveBeenCalled();
    });

    it('창 안이라도 다른 말이면 새 검색이다', async () => {
      // given — "면접" 직후 "커리어"
      repository.findLatestByUserId.mockResolvedValue(
        latestRow('면접', new Date(NOW.getTime() - 2_000)),
      );

      // when
      await service.record(ENTRY, NOW);

      // then
      expect(repository.insert).toHaveBeenCalled();
      expect(repository.overwrite).not.toHaveBeenCalled();
    });

    it('적재가 실패해도 던지지 않는다 — 로그는 검색 응답의 일부가 아니다', async () => {
      // given
      repository.insert.mockRejectedValue(new Error('connection reset'));

      // when
      // then
      await expect(service.record(ENTRY, NOW)).resolves.toBeUndefined();
    });
  });

  describe('summarize', () => {
    it('집계 창을 days 만큼 거슬러 시작한다', async () => {
      // given
      repository.summarize.mockResolvedValue({
        since: new Date(0),
        totals: {
          searches: 0,
          misses: 0,
          clicked: 0,
          users: 0,
          shortQueries: 0,
          filteredSearches: 0,
        },
        daily: [],
        missed: [],
        top: [],
      });

      // when
      await service.summarize(14, NOW);

      // then
      expect(repository.summarize).toHaveBeenCalledWith(
        new Date('2026-09-17T09:00:10.000Z'),
      );
    });

    it('상한(90일)을 넘는 창은 상한으로 자른다', async () => {
      // given
      repository.summarize.mockResolvedValue({
        since: new Date(0),
        totals: {
          searches: 0,
          misses: 0,
          clicked: 0,
          users: 0,
          shortQueries: 0,
          filteredSearches: 0,
        },
        daily: [],
        missed: [],
        top: [],
      });

      // when
      await service.summarize(365, NOW);

      // then
      expect(repository.summarize).toHaveBeenCalledWith(
        new Date('2026-07-03T09:00:10.000Z'),
      );
    });
  });

  describe('isSameTyping', () => {
    it.each([
      ['커리', '커리어', true, '이어 침'],
      ['커리어', '커', true, '지움'],
      ['커리어', '커리어', true, '재검색'],
      ['커리오', '커리어', true, '한 글자 고침'],
      ['커리ㅇ', '커리어', true, '조합 중'],
      ['면저', '면접', true, '2자 오타 고침'],
      ['면접', '커리어', false, '다른 말'],
      ['면접', '면담', true, '한 글자 차이는 묶인다 — 거리 1의 한계'],
      ['커리어', '커뮤니케이션', false, '첫 글자만 같은 다른 말'],
      ['자기계발', '자기개발서', false, '거리 2'],
    ])('%s → %s = %s (%s)', (previous, next, expected) => {
      expect(isSameTyping(previous, next)).toBe(expected);
    });
  });
});
