import { EntityManager } from 'typeorm';

import { BusinessNotFoundException } from '@/common/exceptions/business-not-found.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';

import { Notice } from './entities/notice.entity';
import { NoticeRepository } from './notice.repository';
import { NoticeService } from './notice.service';

const NOW = new Date('2026-10-10T06:00:00Z');
const MANAGER = {} as EntityManager;
const ID_1 = '00000000-0000-4000-8000-000000000001';
const ID_2 = '00000000-0000-4000-8000-000000000002';
const ID_3 = '00000000-0000-4000-8000-000000000003';
const MISSING_ID = '00000000-0000-4000-8000-0000000000ff';

/**
 * 공지 저장소의 메모리 대역. "발행됨 = `published_at <= now`"·삭제 제외는 SQL 이 하는 일이라
 * 같은 조건을 여기서 흉내 낸다 — 이 테스트가 보는 것은 Service 의 페이지 자르기·uuid 관문·부분 수정이다.
 */
class FakeNoticeRepository {
  readonly notices: Notice[] = [];
  /** Service 가 저장소에 몇 건을 요청했는지 — limit + 1 확인용 */
  readonly requestedLimits: number[] = [];
  readonly lookedUpIds: string[] = [];
  readonly softDeletedIds: string[] = [];

  findPublishedPage(now: Date, _cursor: unknown, limit: number) {
    this.requestedLimits.push(limit);
    return Promise.resolve(
      this.alive()
        .filter((n) => n.publishedAt !== null && n.publishedAt <= now)
        .slice(0, limit),
    );
  }
  findPublishedById(id: string, now: Date) {
    this.lookedUpIds.push(id);
    return Promise.resolve(
      this.alive().find(
        (n) => n.id === id && n.publishedAt !== null && n.publishedAt <= now,
      ) ?? null,
    );
  }
  findAdminPage(_cursor: unknown, limit: number) {
    this.requestedLimits.push(limit);
    return Promise.resolve(this.alive().slice(0, limit));
  }
  findById(id: string) {
    this.lookedUpIds.push(id);
    return Promise.resolve(this.alive().find((n) => n.id === id) ?? null);
  }
  findByIdForUpdate(id: string) {
    this.lookedUpIds.push(id);
    return Promise.resolve(this.alive().find((n) => n.id === id) ?? null);
  }
  create(fields: Partial<Notice>) {
    return { ...fields } as Notice;
  }
  save(notice: Notice) {
    return Promise.resolve(notice);
  }
  softDelete(id: string) {
    this.softDeletedIds.push(id);
    return Promise.resolve();
  }

  private alive(): Notice[] {
    return this.notices.filter((n) => n.deletedAt === null);
  }
}

function notice(overrides: Partial<Notice> = {}): Notice {
  return {
    id: ID_1,
    title: '점검 안내',
    body: '본문',
    isPinned: false,
    publishedAt: new Date('2026-10-01T00:00:00Z'),
    createdAt: new Date('2026-09-30T00:00:00Z'),
    deletedAt: null,
    ...overrides,
  } as Notice;
}

function setup() {
  const repository = new FakeNoticeRepository();
  const service = new NoticeService(repository as unknown as NoticeRepository);
  return { repository, service };
}

async function expectNoticeNotFound(work: Promise<unknown>): Promise<void> {
  const error = await work.then(
    () => {
      throw new Error('expected NOTICE_NOT_FOUND but resolved');
    },
    (thrown: unknown) => thrown,
  );
  expect(error).toBeInstanceOf(BusinessNotFoundException);
  expect((error as BusinessNotFoundException).errorCode).toBe(
    ErrorCode.NOTICE_NOT_FOUND,
  );
}

describe('NoticeService', () => {
  describe('findPublishedPage', () => {
    it('limit 보다 한 건 더 조회해 다음 페이지가 있으면 hasNext 를 켜고 limit 건만 돌려준다', async () => {
      // given
      const { repository, service } = setup();
      repository.notices.push(
        notice({ id: ID_1 }),
        notice({ id: ID_2 }),
        notice({ id: ID_3 }),
      );

      // when
      const page = await service.findPublishedPage(NOW, null, 2);

      // then
      expect(repository.requestedLimits).toEqual([3]);
      expect(page.items.map((n) => n.id)).toEqual([ID_1, ID_2]);
      expect(page.hasNext).toBe(true);
    });

    it('남은 건수가 limit 와 같으면 hasNext 를 끈다', async () => {
      // given
      const { repository, service } = setup();
      repository.notices.push(notice({ id: ID_1 }), notice({ id: ID_2 }));

      // when
      const page = await service.findPublishedPage(NOW, null, 2);

      // then
      expect(page.items).toHaveLength(2);
      expect(page.hasNext).toBe(false);
    });
  });

  describe('findAdminPage', () => {
    it('관리자 목록도 limit + 1 로 다음 페이지 여부를 판정한다', async () => {
      // given
      const { repository, service } = setup();
      repository.notices.push(
        notice({ id: ID_1, publishedAt: null }),
        notice({ id: ID_2 }),
      );

      // when
      const page = await service.findAdminPage(null, 1);

      // then
      expect(repository.requestedLimits).toEqual([2]);
      expect(page.items).toHaveLength(1);
      expect(page.hasNext).toBe(true);
    });
  });

  describe('getPublished', () => {
    it('발행된 공지를 돌려준다', async () => {
      // given
      const { repository, service } = setup();
      repository.notices.push(notice());

      // when
      const found = await service.getPublished(ID_1, NOW);

      // then
      expect(found.id).toBe(ID_1);
    });

    it('초안(발행 시각 없음)이면 404 NOTICE_NOT_FOUND 다', async () => {
      // given
      const { repository, service } = setup();
      repository.notices.push(notice({ publishedAt: null }));

      // when / then
      await expectNoticeNotFound(service.getPublished(ID_1, NOW));
    });

    it('예약(발행 시각이 미래)이면 404 NOTICE_NOT_FOUND 다', async () => {
      // given
      const { repository, service } = setup();
      repository.notices.push(
        notice({ publishedAt: new Date('2026-10-10T06:00:01Z') }),
      );

      // when / then
      await expectNoticeNotFound(service.getPublished(ID_1, NOW));
    });

    it('삭제된 공지면 404 NOTICE_NOT_FOUND 다', async () => {
      // given
      const { repository, service } = setup();
      repository.notices.push(notice({ deletedAt: NOW }));

      // when / then
      await expectNoticeNotFound(service.getPublished(ID_1, NOW));
    });

    it('uuid 가 아닌 id 면 저장소를 거치지 않고 404 NOTICE_NOT_FOUND 다', async () => {
      // given — DB 에 닿으면 형식 오류 500 이 된다
      const { repository, service } = setup();

      // when / then
      await expectNoticeNotFound(service.getPublished('not-a-uuid', NOW));
      expect(repository.lookedUpIds).toHaveLength(0);
    });
  });

  describe('getById', () => {
    it('관리자 조회는 초안도 돌려준다', async () => {
      // given
      const { repository, service } = setup();
      repository.notices.push(notice({ publishedAt: null }));

      // when
      const found = await service.getById(ID_1);

      // then
      expect(found.publishedAt).toBeNull();
    });

    it('없는 id 면 404 NOTICE_NOT_FOUND 다', async () => {
      // given
      const { service } = setup();

      // when / then
      await expectNoticeNotFound(service.getById(MISSING_ID));
    });

    it('uuid 가 아닌 id 면 저장소를 거치지 않고 404 NOTICE_NOT_FOUND 다', async () => {
      // given
      const { repository, service } = setup();

      // when / then
      await expectNoticeNotFound(service.getById('1; DROP TABLE'));
      expect(repository.lookedUpIds).toHaveLength(0);
    });
  });

  describe('getByIdForUpdate', () => {
    it('uuid 가 아닌 id 면 잠금 조회 없이 404 NOTICE_NOT_FOUND 다', async () => {
      // given
      const { repository, service } = setup();

      // when / then
      await expectNoticeNotFound(service.getByIdForUpdate('abc', MANAGER));
      expect(repository.lookedUpIds).toHaveLength(0);
    });
  });

  describe('update', () => {
    it('보낸 키만 바꾸고 보내지 않은 키는 그대로 둔다', async () => {
      // given
      const { service } = setup();
      const target = notice({ isPinned: true });

      // when
      const updated = await service.update(target, { title: '새 제목' });

      // then
      expect(updated).toMatchObject({
        title: '새 제목',
        body: '본문',
        isPinned: true,
        publishedAt: new Date('2026-10-01T00:00:00Z'),
      });
    });

    it('publishedAt 에 null 을 보내면 발행을 취소해 초안으로 되돌린다', async () => {
      // given
      const { service } = setup();
      const target = notice();

      // when
      const updated = await service.update(target, { publishedAt: null });

      // then
      expect(updated.publishedAt).toBeNull();
    });

    it('isPinned 에 false 를 보내면 고정을 푼다', async () => {
      // given — falsy 값도 "보낸 값"이다
      const { service } = setup();
      const target = notice({ isPinned: true });

      // when
      const updated = await service.update(target, { isPinned: false });

      // then
      expect(updated.isPinned).toBe(false);
    });
  });

  describe('remove', () => {
    it('행을 지우지 않고 소프트 삭제한다', async () => {
      // given
      const { repository, service } = setup();
      const target = notice();

      // when
      await service.remove(target);

      // then
      expect(repository.softDeletedIds).toEqual([ID_1]);
    });
  });
});
