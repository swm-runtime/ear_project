import { SearchQueryLogRepository } from '../repositories/search-query-log.repository';
import { SearchQueryLogService } from './search-query-log.service';

describe('SearchQueryLogService', () => {
  let repository: jest.Mocked<SearchQueryLogRepository>;
  let service: SearchQueryLogService;

  const ENTRY = {
    userId: '11111111-1111-4111-8111-111111111111',
    normalizedQuery: '커리어',
    resultCount: 3,
    hasNext: false,
    topicFilterCount: 0,
  };

  beforeEach(() => {
    repository = {
      insert: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<SearchQueryLogRepository>;
    service = new SearchQueryLogService(repository);
  });

  it('질의·첫 페이지 건수·다음 페이지 유무·주제 필터 수를 한 행으로 적재한다', async () => {
    // given
    // when
    await service.record(ENTRY);

    // then
    expect(repository.insert).toHaveBeenCalledWith({
      userId: ENTRY.userId,
      query: '커리어',
      resultCount: 3,
      hasNext: false,
      topicFilterCount: 0,
    });
  });

  it('적재가 실패해도 던지지 않는다 — 로그는 검색 응답의 일부가 아니다', async () => {
    // given
    repository.insert.mockRejectedValue(new Error('connection reset'));

    // when
    // then
    await expect(service.record(ENTRY)).resolves.toBeUndefined();
  });
});
