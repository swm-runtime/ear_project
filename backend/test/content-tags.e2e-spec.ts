import 'dotenv/config';

import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';

import { AppModule } from '@/app.module';
import { traceIdMiddleware } from '@/common/middlewares/trace-id.middleware';
import { ContentOrigin, ContentStatus } from '@/modules/content/content.enum';
import { Content } from '@/modules/content/entities/content.entity';
import { User } from '@/modules/user/entities/user.entity';
import { SocialProvider, UserRole } from '@/modules/user/user.enum';

interface RepublishBody {
  content_version: number;
  enrichment_applied?: boolean;
  enrichment_rejected_reason?: string;
}

interface DetailBody {
  content: { id: string; tags: string[] };
}

interface SearchBody {
  items: { content: { id: string; tags: string[] } }[];
}

/**
 * 콘텐츠 해시태그 E2E(KAN-162) — 추천 메타 형식 3 파일이 관리자 메타 재반영으로 들어와 `contents.tags`에 저장되고,
 * 상세 응답·탐색 카드에 그대로 나가는지 실제 DB 위에서 본다. 규칙 밖 태그는 파일만 거부되고, 형식 2 파일과
 * 태그를 뺀 형식 3 파일은 기존 태그를 지우지 않는다.
 */
describe('콘텐츠 해시태그 E2E', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  const userIds: string[] = [];
  const contentIds: string[] = [];
  const TOKEN = `e2etags${Date.now()}`;
  const path = (p: string) => `/api/v1${p}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.use(traceIdMiddleware);
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    dataSource = app.get(DataSource);
  }, 60_000);

  afterAll(async () => {
    for (const userId of userIds) {
      await dataSource.query(`DELETE FROM users WHERE id = $1`, [userId]);
    }
    for (const contentId of contentIds) {
      await dataSource.query(`DELETE FROM contents WHERE id = $1`, [contentId]);
    }
    await app.close();
  }, 60_000);

  it('형식 3 태그가 저장돼 상세·검색 카드에 나가고, 규칙 밖 태그·형식 2·태그 생략은 기존 태그를 건드리지 않는다', async () => {
    // given
    const adminAuth = await createUser('admin', UserRole.ADMIN);
    const userAuth = await createUser('listener', UserRole.USER);
    const contentId = await seedContent();

    // then — 받은 적 없는 콘텐츠는 빈 배열이다(null 이 아니다)
    expect((await detail(userAuth, contentId)).content.tags).toEqual([]);

    // when — 형식 3, 태그 3개
    const applied = await sendEnrichment(adminAuth, contentId, {
      schema_version: 3,
      difficulty: 'beginner',
      tags: ['ISA', '비과세', '절세'],
    });

    // then — 반영되고 버전은 그대로(메타 단독 전송), 저장값·상세·검색 카드가 같다
    expect(applied).toEqual(
      expect.objectContaining({ enrichment_applied: true, content_version: 1 }),
    );
    expect(await storedTags(contentId)).toEqual(['ISA', '비과세', '절세']);
    expect((await detail(userAuth, contentId)).content.tags).toEqual([
      'ISA',
      '비과세',
      '절세',
    ]);
    const searched = await request(app.getHttpServer())
      .get(path('/explore/search'))
      .query({ query: TOKEN })
      .set('Authorization', userAuth)
      .expect(HttpStatus.OK);
    const card = (searched.body as SearchBody).items.find(
      (item) => item.content.id === contentId,
    );
    expect(card?.content.tags).toEqual(['ISA', '비과세', '절세']);

    // when — 규칙 밖(1개·띄어쓰기) → 파일만 거부, 태그 그대로
    const tooFew = await sendEnrichment(adminAuth, contentId, {
      schema_version: 3,
      tags: ['절세'],
    });
    const spaced = await sendEnrichment(adminAuth, contentId, {
      schema_version: 3,
      tags: ['비과세 한도', '절세'],
    });
    expect(tooFew.enrichment_applied).toBe(false);
    expect(tooFew.enrichment_rejected_reason).toContain('tags');
    expect(spaced.enrichment_applied).toBe(false);
    expect(await storedTags(contentId)).toEqual(['ISA', '비과세', '절세']);

    // when — 형식 2 파일, 태그를 뺀 형식 3 파일 → 반영되지만 태그는 유지(부분 갱신)
    const legacy = await sendEnrichment(adminAuth, contentId, {
      schema_version: 2,
      difficulty: 'intermediate',
    });
    const noTags = await sendEnrichment(adminAuth, contentId, {
      schema_version: 3,
      is_evergreen: true,
    });
    expect(legacy.enrichment_applied).toBe(true);
    expect(noTags.enrichment_applied).toBe(true);
    expect(await storedTags(contentId)).toEqual(['ISA', '비과세', '절세']);
  }, 60_000);

  async function sendEnrichment(
    adminAuth: string,
    contentId: string,
    enrichment: Record<string, unknown>,
  ): Promise<RepublishBody> {
    const response = await request(app.getHttpServer())
      .patch(path(`/admin/contents/${contentId}`))
      .set('Authorization', adminAuth)
      .attach('enrichment_file', Buffer.from(JSON.stringify(enrichment)), {
        filename: 'enrichment.json',
        contentType: 'application/json',
      })
      .expect(HttpStatus.OK);
    return response.body as RepublishBody;
  }

  async function detail(auth: string, contentId: string): Promise<DetailBody> {
    const response = await request(app.getHttpServer())
      .get(path(`/contents/${contentId}`))
      .set('Authorization', auth)
      .expect(HttpStatus.OK);
    return response.body as DetailBody;
  }

  async function storedTags(contentId: string): Promise<string[] | null> {
    const content = await dataSource
      .getRepository(Content)
      .findOneByOrFail({ id: contentId });
    return content.tags;
  }

  async function createUser(label: string, role: UserRole): Promise<string> {
    const repository = dataSource.getRepository(User);
    const user = await repository.save(
      repository.create({
        provider: SocialProvider.KAKAO,
        providerUserId: `${TOKEN}-${label}`,
        role,
        onboardingCompleted: true,
      }),
    );
    userIds.push(user.id);
    const token = app
      .get(JwtService)
      .sign({ sub: user.id, role, typ: 'access' }, { expiresIn: 600 });
    return `Bearer ${token}`;
  }

  async function seedContent(): Promise<string> {
    const repository = dataSource.getRepository(Content);
    const content = await repository.save(
      repository.create({
        title: `${TOKEN} 절세 계좌 이야기`,
        description: 'e2e 전용',
        authorName: '테스트',
        sourceName: 'E2E',
        sourceUrl: 'https://example.com/e2e',
        origin: ContentOrigin.AI_GENERATED,
        partnerId: null,
        seriesId: null,
        episodeNo: null,
        totalEpisodes: null,
        audioPath: `${TOKEN}/0.mp3`,
        durationSec: 600,
        thumbnailUrl: 'https://example.com/e2e.png',
        contentVersion: 1,
        licenseExpiresAt: null,
        status: ContentStatus.PUBLISHED,
        publishedAt: new Date(Date.now() - 60_000),
        withdrawnAt: null,
      }),
    );
    contentIds.push(content.id);
    return content.id;
  }
});
