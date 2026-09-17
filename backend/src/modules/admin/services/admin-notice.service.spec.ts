import { DataSource, EntityManager } from 'typeorm';

import { Notice } from '@/modules/notice/entities/notice.entity';
import { NoticeService } from '@/modules/notice/notice.service';
import { AuditLogService } from '@/modules/partner/audit-log.service';

import { AdminNoticeService } from './admin-notice.service';

const ACTOR_ID = '11111111-1111-4111-8111-111111111111';
const NOTICE_ID = '22222222-2222-4222-8222-222222222222';
const PUBLISHED_AT = new Date('2026-09-17T09:00:00.000Z');

function buildNotice(overrides: Partial<Notice> = {}): Notice {
  return {
    id: NOTICE_ID,
    title: '9월 업데이트 안내',
    body: '본문',
    isPinned: false,
    publishedAt: PUBLISHED_AT,
    ...overrides,
  } as Notice;
}

describe('AdminNoticeService', () => {
  let service: AdminNoticeService;
  let noticeService: jest.Mocked<NoticeService>;
  let auditLogService: jest.Mocked<AuditLogService>;
  let manager: EntityManager;

  beforeEach(() => {
    manager = {} as EntityManager;
    const dataSource = {
      transaction: jest
        .fn()
        .mockImplementation((run: (m: EntityManager) => Promise<unknown>) =>
          run(manager),
        ),
    } as unknown as DataSource;

    noticeService = {
      create: jest.fn().mockResolvedValue(buildNotice()),
      getByIdForUpdate: jest.fn().mockResolvedValue(buildNotice()),
      update: jest
        .fn()
        .mockImplementation((notice: Notice, command: Partial<Notice>) =>
          Promise.resolve({ ...notice, ...command }),
        ),
      remove: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<NoticeService>;

    auditLogService = {
      record: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<AuditLogService>;

    service = new AdminNoticeService(
      dataSource,
      noticeService,
      auditLogService,
    );
  });

  it('작성하면 같은 트랜잭션에서 감사 로그를 남긴다 — 작성자는 이 기록만 안다', async () => {
    // when
    await service.create(ACTOR_ID, {
      title: '9월 업데이트 안내',
      body: '본문',
      isPinned: false,
      publishedAt: PUBLISHED_AT,
    });

    // then
    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: ACTOR_ID,
        action: 'notice.create',
        target: `notice:${NOTICE_ID}`,
      }),
      manager,
    );
  });

  it('발행 취소하면 before/after 에 발행 시각 변화가 남는다', async () => {
    // when
    await service.update(ACTOR_ID, NOTICE_ID, { publishedAt: null });

    // then
    expect(noticeService.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: NOTICE_ID }),
      { publishedAt: null },
      manager,
    );
    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'notice.update',
        before: expect.objectContaining({
          published_at: PUBLISHED_AT.toISOString(),
        }) as unknown,
        after: expect.objectContaining({ published_at: null }) as unknown,
      }),
      manager,
    );
  });

  it('감사 로그에 본문 원문을 싣지 않고 길이만 남긴다', async () => {
    // when
    await service.create(ACTOR_ID, {
      title: '제목',
      body: '본문',
      isPinned: false,
      publishedAt: null,
    });

    // then
    const [entry] = auditLogService.record.mock.calls[0];
    expect(entry.after).toEqual(expect.objectContaining({ body_length: 2 }));
    expect(entry.after).not.toHaveProperty('body');
  });

  it('수정 전에 행을 잠그고 읽는다 — 감사 로그 before 가 동시 수정으로 낡지 않는다', async () => {
    // when
    await service.update(ACTOR_ID, NOTICE_ID, { isPinned: true });

    // then
    expect(noticeService.getByIdForUpdate).toHaveBeenCalledWith(
      NOTICE_ID,
      manager,
    );
  });

  it('삭제하면 soft delete 하고 감사 로그를 남긴다', async () => {
    // when
    await service.remove(ACTOR_ID, NOTICE_ID);

    // then
    expect(noticeService.remove).toHaveBeenCalledWith(
      expect.objectContaining({ id: NOTICE_ID }),
      manager,
    );
    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'notice.delete' }),
      manager,
    );
  });
});
