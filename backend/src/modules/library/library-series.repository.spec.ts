import { Repository } from 'typeorm';

import { UserMarket } from '@/modules/user/user.enum';

import { LibrarySeries } from './library-series.entity';
import {
  DELIVER_NEW_EPISODE_SQL,
  LibrarySeriesRepository,
} from './library-series.repository';
import { LibraryItemSource, LibraryItemStatus } from './library.enum';

const NOW = new Date('2026-10-22T09:00:00.000Z');
const CONTENT_ID = '11111111-1111-4111-8111-111111111111';
const SERIES_ID = '55555555-5555-4555-8555-555555555555';

/** 공백·줄바꿈 차이를 지운 SQL — 조건을 문자열로 대조한다 */
const SQL = DELIVER_NEW_EPISODE_SQL.replace(/\s+/g, ' ');

/**
 * 새 편 적립 한 문장(KAN-245 무엇을 한다 6)의 조건. 실제 DB 위의 동작은 e2e(`series-follow.e2e-spec.ts`)가 보고, 여기서는
 * 조건 하나하나가 문장에 있고 파라미터가 제자리에 들어가는지를 본다 — 조건 하나가 빠지면 다른 시장·뺀 편·시리즈째 뺀
 * 사용자에게 편이 새어 들어간다.
 */
describe('LibrarySeriesRepository.deliverNewEpisode', () => {
  let repository: LibrarySeriesRepository;
  let query: jest.Mock;

  beforeEach(() => {
    query = jest.fn().mockResolvedValue([{ user_id: 'u1' }, { user_id: 'u2' }]);
    repository = new LibrarySeriesRepository({
      query,
    } as unknown as Repository<LibrarySeries>);
  });

  it('같은 시장 사용자만 — users.market 을 편의 시장($3)과 맞춘다', async () => {
    // when
    await repository.deliverNewEpisode({
      contentId: CONTENT_ID,
      seriesId: SERIES_ID,
      market: UserMarket.GLOBAL,
      now: NOW,
    });

    // then
    expect(SQL).toContain('JOIN "users" u ON u."id" = ls."user_id"');
    expect(SQL).toContain('AND u."market" = $3');
    const [, params] = query.mock.calls[0] as [string, unknown[]];
    expect(params[2]).toBe(UserMarket.GLOBAL);
  });

  it('그 편의 라이브러리 행이 있는 사용자는 삭제 이력이라도 뺀다 — deleted_at 을 보지 않는다', () => {
    // then
    expect(SQL).toContain(
      'NOT EXISTS ( SELECT 1 FROM "library_items" li WHERE li."user_id" = ls."user_id" AND li."content_id" = $1 )',
    );
    // 하위 조회에 삭제 여부 조건이 붙으면 "뺀 편이 다시 들어온다"
    const subquery = SQL.slice(
      SQL.indexOf('NOT EXISTS'),
      SQL.indexOf('ON CONFLICT'),
    );
    expect(subquery).not.toContain('deleted_at');
    // 경합으로 행이 생겨도 유니크가 막는다(되살리지 않는다 — DO UPDATE 가 아니다)
    expect(SQL).toContain(
      'ON CONFLICT ON CONSTRAINT "uq_library_items_user_id_content_id" DO NOTHING',
    );
  });

  it('시리즈째 담기가 살아 있는 사용자만 — 시리즈째 뺀(소프트 삭제) 사용자는 받지 않는다', () => {
    expect(SQL).toContain('FROM "library_series" ls');
    expect(SQL).toContain('WHERE ls."series_id" = $2');
    expect(SQL).toContain('AND ls."deleted_at" IS NULL');
  });

  it('source = save · status = unplayed · added_at = 적립 시각으로 넣고 받은 사용자 id 를 돌려준다', async () => {
    // when
    const userIds = await repository.deliverNewEpisode({
      contentId: CONTENT_ID,
      seriesId: SERIES_ID,
      market: UserMarket.KR,
      now: NOW,
    });

    // then
    expect(query).toHaveBeenCalledWith(DELIVER_NEW_EPISODE_SQL, [
      CONTENT_ID,
      SERIES_ID,
      UserMarket.KR,
      LibraryItemSource.SAVE,
      LibraryItemStatus.UNPLAYED,
      NOW,
    ]);
    expect(SQL).toContain('SELECT ls."user_id", $1, $4, $5, $6');
    expect(userIds).toEqual(['u1', 'u2']);
  });
});
