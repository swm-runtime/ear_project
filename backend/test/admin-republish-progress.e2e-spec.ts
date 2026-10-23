import 'dotenv/config';

import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';

import { AppModule } from '@/app.module';
import { traceIdMiddleware } from '@/common/middlewares/trace-id.middleware';
import { AudioProbe } from '@/modules/admin/audio-probe';
import { ContentStorageClient } from '@/modules/admin/content-storage.client';
import { ThumbnailImage } from '@/modules/admin/thumbnail-image';
import { UploadedFileInput } from '@/modules/admin/admin.types';
import {
  EMBEDDING_DIM,
  EMBEDDING_MODEL_ID,
} from '@/modules/content/content.constant';
import { ContentService } from '@/modules/content/services/content.service';
import { Topic } from '@/modules/interest/entities/topic.entity';
import { User } from '@/modules/user/entities/user.entity';
import { SocialProvider, UserMarket, UserRole } from '@/modules/user/user.enum';

interface AdminContentBody {
  id: string;
  thumbnail_url: string;
  content_version: number;
  has_script: boolean;
  has_current_embedding: boolean;
}

interface IssueBody {
  content: { thumbnail_url: string; content_version: number };
  has_script: boolean;
  progress: { position_sec: number; max_reached_sec: number } | null;
}

/**
 * 재발행과 재생 위치 E2E(KAN-236 — admin-api.md 4.10 "재생 위치 폐기").
 *
 * 오디오를 바꾸지 않는 재발행(썸네일 단독)은 재생 위치·`content_version`·대본·임베딩을 그대로 두고,
 * 오디오를 바꾸는 재발행은 지금처럼 위치를 지우고 버전을 올리는지를 실제 DB 위에서 본다.
 * 파일 처리(길이 추출·썸네일 변환·저장소)는 대역으로 바꾼다 — 각자 단위 테스트가 있다.
 */
describe('재발행 재생 위치 E2E', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  const userIds: string[] = [];
  const topicIds: string[] = [];
  const contentIds: string[] = [];
  const STAMP = `e2e-republish-${Date.now().toString(36)}`;
  const path = (p: string) => `/api/v1${p}`;
  let storedCount = 0;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AudioProbe)
      .useValue({
        readDurationSec: () => Promise.resolve(600),
        readMetadata: () =>
          Promise.resolve({
            durationSec: 600,
            codec: 'mp3',
            bitrateKbps: 192,
            channels: 1,
            sampleRateHz: 44100,
          }),
      })
      .overrideProvider(ThumbnailImage)
      .useValue({
        normalize: (file: UploadedFileInput) =>
          Promise.resolve({
            file: { ...file, mimeType: 'image/webp' },
            extension: 'webp',
            width: 768,
            height: 768,
          }),
      })
      .overrideProvider(ContentStorageClient)
      .useValue({
        putAudio: () => Promise.resolve(`${STAMP}/audio-${++storedCount}.mp3`),
        putThumbnail: () => {
          const key = `${STAMP}/thumb-${++storedCount}.webp`;
          return Promise.resolve({ key, url: `https://cdn.example/${key}` });
        },
        remove: () => Promise.resolve([]),
        resolveKey: () => null,
      })
      .compile();
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
    // 사용자부터 — 라이브러리·재생 위치가 콘텐츠를 FK로 가리킨다(사용자 삭제가 함께 지운다)
    for (const userId of userIds) {
      await dataSource.query(`DELETE FROM audit_logs WHERE actor = $1`, [
        userId,
      ]);
      await dataSource.query(`DELETE FROM users WHERE id = $1`, [userId]);
    }
    for (const contentId of contentIds) {
      await dataSource.query(`DELETE FROM contents WHERE id = $1`, [contentId]);
    }
    for (const topicId of topicIds) {
      await dataSource.query(`DELETE FROM topics WHERE id = $1`, [topicId]);
    }
    await app.close();
  }, 60_000);

  it('썸네일만 바꾸면 재생 위치·버전·대본·임베딩이 그대로고, 오디오를 바꾸면 위치가 지워진다', async () => {
    // given — 발행된 콘텐츠(대본·현재 임베딩 있음)와 그 콘텐츠를 120초까지 들은 사용자
    const topic = await seedTopic();
    const { auth: admin } = await createUser('admin', UserRole.ADMIN);
    const { auth: listener } = await createUser('listener', UserRole.USER);

    const uploaded = await request(app.getHttpServer())
      .post(path('/admin/contents'))
      .set('Authorization', admin)
      .field(
        'payload',
        JSON.stringify({
          title: `${STAMP} 편`,
          description: 'e2e 전용',
          origin: 'ai_generated',
          source_name: '참고한 자료: E2E',
          topic_ids: [topic.id],
          sources: [{ title: 'E2E 소스' }],
          review_confirmed: true,
          market: 'kr',
          language: 'ko',
        }),
      )
      .attach('audio', Buffer.from('fake-audio'), {
        filename: 'ep.mp3',
        contentType: 'audio/mpeg',
      })
      .attach('thumbnail', Buffer.from('fake-image'), {
        filename: 'thumb.png',
        contentType: 'image/png',
      })
      .expect(HttpStatus.CREATED);
    const contentId = (uploaded.body as AdminContentBody).id;
    contentIds.push(contentId);
    const firstThumbnailUrl = (uploaded.body as AdminContentBody).thumbnail_url;

    await dataSource.transaction((manager) =>
      app.get(ContentService).saveScript(
        contentId,
        {
          segments: [
            { start_sec: 0, end_sec: 5, speaker: '윤아', text: '안녕하세요' },
          ],
          sections: [],
        },
        manager,
      ),
    );
    await dataSource.query(
      `INSERT INTO content_embeddings (content_id, embedding, model, content_version)
       VALUES ($1, $2::vector, $3, 1)`,
      [
        contentId,
        `[${new Array<number>(EMBEDDING_DIM).fill(0.01).join(',')}]`,
        EMBEDDING_MODEL_ID,
      ],
    );

    await saveProgress(listener, contentId, 120, 1).expect(HttpStatus.OK);
    expect((await issue(listener, contentId)).progress).toEqual({
      position_sec: 120,
      max_reached_sec: 120,
    });

    // when — 썸네일만 바꿔 재발행한다
    const thumbnailOnly = await request(app.getHttpServer())
      .patch(path(`/admin/contents/${contentId}`))
      .set('Authorization', admin)
      .attach('thumbnail', Buffer.from('new-image'), {
        filename: 'thumb.png',
        contentType: 'image/png',
      })
      .expect(HttpStatus.OK);

    // then — 새 썸네일 URL, 버전 그대로, 대본·임베딩 그대로
    const afterThumbnail = thumbnailOnly.body as AdminContentBody;
    expect(afterThumbnail.thumbnail_url).not.toBe(firstThumbnailUrl);
    expect(afterThumbnail).toMatchObject({
      content_version: 1,
      has_script: true,
      has_current_embedding: true,
    });

    // then — 다음 진입에서 위치가 그대로이고, 새 썸네일이 내려간다
    const reentry = await issue(listener, contentId);
    expect(reentry.progress).toEqual({
      position_sec: 120,
      max_reached_sec: 120,
    });
    expect(reentry.content).toMatchObject({
      thumbnail_url: afterThumbnail.thumbnail_url,
      content_version: 1,
    });
    expect(reentry.has_script).toBe(true);

    // then — 재생 중이던 세션(버전 1)의 다음 저장도 버전 가드에 걸리지 않고 저장된다
    const saved = await saveProgress(listener, contentId, 150, 1).expect(
      HttpStatus.OK,
    );
    expect(saved.body).toMatchObject({ position_sec: 150, content_version: 1 });

    // when — 오디오를 바꿔 재발행한다
    const audioRepublish = await request(app.getHttpServer())
      .patch(path(`/admin/contents/${contentId}`))
      .set('Authorization', admin)
      .attach('audio', Buffer.from('new-audio'), {
        filename: 'ep.mp3',
        contentType: 'audio/mpeg',
      })
      .expect(HttpStatus.OK);

    // then — 지금처럼 버전이 오르고 위치가 지워진다(대본은 함께 오지 않아 삭제, 임베딩은 미갱신)
    expect(audioRepublish.body as AdminContentBody).toMatchObject({
      content_version: 2,
      has_script: false,
      has_current_embedding: false,
    });
    const afterAudio = await issue(listener, contentId);
    expect(afterAudio.progress).toBeNull();
    expect(afterAudio.content.content_version).toBe(2);
  });

  it('무손실만 교체하면 무손실 행만 바뀌고 버전·재생 위치·대본·압축 행은 그대로다(KAN-264)', async () => {
    // given — 압축·무손실 두 벌로 발행되고 대본이 있는 콘텐츠, 그 콘텐츠를 120초까지 들은 사용자
    const topic = await seedTopic();
    const { auth: admin } = await createUser('admin-ll', UserRole.ADMIN);
    const { auth: listener } = await createUser('listener-ll', UserRole.USER);

    const uploaded = await request(app.getHttpServer())
      .post(path('/admin/contents'))
      .set('Authorization', admin)
      .field(
        'payload',
        JSON.stringify({
          title: `${STAMP} 무손실 편`,
          description: 'e2e 전용',
          origin: 'ai_generated',
          source_name: '참고한 자료: E2E',
          topic_ids: [topic.id],
          sources: [{ title: 'E2E 소스' }],
          review_confirmed: true,
          market: 'kr',
          language: 'ko',
        }),
      )
      .attach('audio', Buffer.from('fake-audio'), {
        filename: 'ep.mp3',
        contentType: 'audio/mpeg',
      })
      .attach('audio_lossless', Buffer.from('fake-flac'), {
        filename: 'ep.flac',
        contentType: 'audio/flac',
      })
      .attach('thumbnail', Buffer.from('fake-image'), {
        filename: 'thumb.png',
        contentType: 'image/png',
      })
      .expect(HttpStatus.CREATED);
    const contentId = (uploaded.body as AdminContentBody).id;
    contentIds.push(contentId);
    await dataSource.transaction((manager) =>
      app.get(ContentService).saveScript(
        contentId,
        {
          segments: [
            { start_sec: 0, end_sec: 5, speaker: '윤아', text: '안녕하세요' },
          ],
          sections: [],
        },
        manager,
      ),
    );
    await saveProgress(listener, contentId, 120, 1).expect(HttpStatus.OK);
    const before = await renditionPaths(contentId);

    // when — 무손실 파일만 rendition_only=lossless 로 보낸다
    const replaced = await request(app.getHttpServer())
      .patch(path(`/admin/contents/${contentId}`))
      .set('Authorization', admin)
      .field('rendition_only', 'lossless')
      .attach('audio_lossless', Buffer.from('new-flac'), {
        filename: 'ep.flac',
        contentType: 'audio/flac',
      })
      .expect(HttpStatus.OK);

    // then — 버전 그대로·대본 그대로, 무손실 경로만 바뀌고 압축 경로는 그대로
    expect(replaced.body as AdminContentBody).toMatchObject({
      content_version: 1,
      has_script: true,
    });
    const after = await renditionPaths(contentId);
    expect(after.compressed).toBe(before.compressed);
    expect(after.lossless).toBeDefined();
    expect(after.lossless).not.toBe(before.lossless);

    // then — 재생 위치가 남아 있다
    expect((await issue(listener, contentId)).progress).toEqual({
      position_sec: 120,
      max_reached_sec: 120,
    });

    // then — 다른 파트를 섞으면 400, rendition_only 없이 무손실만 보내면 종전대로 400(audio)
    const mixed = await request(app.getHttpServer())
      .patch(path(`/admin/contents/${contentId}`))
      .set('Authorization', admin)
      .field('rendition_only', 'lossless')
      .attach('audio_lossless', Buffer.from('new-flac'), {
        filename: 'ep.flac',
        contentType: 'audio/flac',
      })
      .attach('thumbnail', Buffer.from('new-image'), {
        filename: 'thumb.png',
        contentType: 'image/png',
      })
      .expect(HttpStatus.BAD_REQUEST);
    expect(mixed.body).toMatchObject({ field: 'rendition_only' });
    const withoutFlag = await request(app.getHttpServer())
      .patch(path(`/admin/contents/${contentId}`))
      .set('Authorization', admin)
      .attach('audio_lossless', Buffer.from('new-flac'), {
        filename: 'ep.flac',
        contentType: 'audio/flac',
      })
      .expect(HttpStatus.BAD_REQUEST);
    expect(withoutFlag.body).toMatchObject({ field: 'audio' });
  });

  async function renditionPaths(
    contentId: string,
  ): Promise<Record<string, string>> {
    const rows: { quality: string; path: string }[] = await dataSource.query(
      `SELECT quality, path FROM content_audio_renditions WHERE content_id = $1`,
      [contentId],
    );
    return Object.fromEntries(rows.map((row) => [row.quality, row.path]));
  }

  function saveProgress(
    auth: string,
    contentId: string,
    positionSec: number,
    contentVersion: number,
  ) {
    return request(app.getHttpServer())
      .put(path(`/users/me/playback-progresses/${contentId}`))
      .set('Authorization', auth)
      .send({
        position_sec: positionSec,
        max_reached_sec: positionSec,
        listened_sec_delta: 0,
        content_version: contentVersion,
      });
  }

  async function issue(auth: string, contentId: string): Promise<IssueBody> {
    const response = await request(app.getHttpServer())
      .post(path(`/contents/${contentId}/audio-urls`))
      .set('Authorization', auth)
      .send({ device_id: `${STAMP}-device` })
      .expect(HttpStatus.CREATED);
    return response.body as IssueBody;
  }

  async function createUser(
    label: string,
    role: UserRole,
  ): Promise<{ userId: string; auth: string }> {
    const repository = dataSource.getRepository(User);
    const user = await repository.save(
      repository.create({
        provider: SocialProvider.KAKAO,
        providerUserId: `${STAMP}-${label}`,
        role,
        onboardingCompleted: true,
        market: UserMarket.KR,
      }),
    );
    userIds.push(user.id);
    const token = app
      .get(JwtService)
      .sign(
        { sub: user.id, role, typ: 'access', market: UserMarket.KR },
        { expiresIn: 600 },
      );
    return { userId: user.id, auth: `Bearer ${token}` };
  }

  async function seedTopic(): Promise<Topic> {
    const repository = dataSource.getRepository(Topic);
    const topic = await repository.save(
      repository.create({
        name: `${STAMP}-${topicIds.length}`,
        parentCategory: STAMP,
        isVisible: true,
        displayOrder: 970,
        market: UserMarket.KR,
      }),
    );
    topicIds.push(topic.id);
    return topic;
  }
});
