/**
 * 기존 썸네일을 저장 규격(WebP 768px)으로 다시 쓴다 — 2026-09-19 규격 도입 이전에 발행된 콘텐츠용.
 *
 * 업로드 경로(`AdminContentService`)가 바뀐 뒤에도 이미 올라간 1024px PNG 는 그대로라, 앱 목록의
 * 첫 화면이 여전히 30MB 를 받는다. 이 스크립트가 `thumbnail_url` 이 `.webp` 가 아닌 콘텐츠를 골라
 * 원본을 내려받아 `ThumbnailImage` 로 변환하고 **새 키**로 올린 뒤 URL 을 바꾼다 — 같은 키에 덮어쓰면
 * CloudFront·앱 캐시가 1년 `immutable` 이라 바뀐 것이 보이지 않는다. 옛 키는 URL 교체가 끝난 뒤 지운다.
 *
 * - 버전(`content_version`)은 올리지 않는다. 같은 그림을 작게 다시 쓴 것이라 클라이언트가 다시 받을
 *   이유가 없고, 새 URL 자체가 새 파일이다.
 * - 회수(`withdrawn`) 콘텐츠도 대상이다 — 복구되면 다시 목록에 보인다.
 * - 감사 로그 `content.thumbnail_reprocess` 를 남긴다(저장소 파일이 바뀌는 작업은 기록한다).
 *
 * 실행:
 *   npm run thumbnails:reprocess -- --dry-run     # 대상과 크기만 출력
 *   npm run thumbnails:reprocess                  # 실제 교체
 *   운영 컨테이너: node dist/scripts/reprocess-thumbnails.js [--dry-run]
 */
import 'dotenv/config';

import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';

import { AppModule } from '@/app.module';
import {
  AUDIT_ACTION_CONTENT_THUMBNAIL_REPROCESS,
  THUMBNAIL_OUTPUT_EXTENSION,
} from '@/modules/admin/admin.constant';
import { ContentStorageClient } from '@/modules/admin/content-storage.client';
import { ThumbnailImage } from '@/modules/admin/thumbnail-image';
import { Content } from '@/modules/content/entities/content.entity';
import { AuditLogService } from '@/modules/partner/audit-log.service';

const DRY_RUN = process.argv.includes('--dry-run');
/** 사람이 아니라 스크립트가 한 일 — 감사 로그의 actor 는 사용자 ID 형식이 아니어도 된다(문자열) */
const SCRIPT_ACTOR = 'script:reprocess-thumbnails';

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  const dataSource = app.get(DataSource);
  const storage = app.get(ContentStorageClient);
  const thumbnailImage = app.get(ThumbnailImage);
  const auditLogService = app.get(AuditLogService);
  const workDir = await mkdtemp(join(tmpdir(), 'ear-thumb-reprocess-'));

  try {
    const targets = await dataSource
      .getRepository(Content)
      .createQueryBuilder('content')
      .where('content.thumbnail_url NOT LIKE :webp', {
        webp: `%.${THUMBNAIL_OUTPUT_EXTENSION}`,
      })
      .orderBy('content.published_at', 'DESC')
      .getMany();

    console.log(
      `대상 ${targets.length}편${DRY_RUN ? ' (dry-run — 바꾸지 않음)' : ''}`,
    );

    let replaced = 0;
    let failed = 0;

    for (const content of targets) {
      const label = `${content.id.slice(0, 8)} ${content.title}`;
      const previousUrl = content.thumbnailUrl;
      const previousKey = storage.resolveKey(previousUrl);

      if (previousKey === null) {
        console.log(
          `  건너뜀 ${label} — 우리 저장소 URL 이 아님: ${previousUrl}`,
        );
        continue;
      }

      try {
        const response = await fetch(previousUrl);
        if (!response.ok) {
          throw new Error(`원본 내려받기 실패 ${response.status}`);
        }
        const original = Buffer.from(await response.arrayBuffer());
        const sourcePath = join(workDir, `${randomUUID()}.src`);
        await writeFile(sourcePath, original);

        const normalized = await thumbnailImage.normalize({
          path: sourcePath,
          originalName: previousKey.split('/').pop() ?? 'thumbnail',
          mimeType:
            response.headers.get('content-type') ?? 'application/octet-stream',
          size: original.length,
        });

        if (normalized === null) {
          throw new Error('이미지를 읽을 수 없음');
        }

        const kb = (bytes: number): string => `${Math.round(bytes / 1024)}KB`;
        console.log(
          `  ${DRY_RUN ? '예정' : '교체'} ${label} — ${kb(original.length)} → ${kb(normalized.file.size)} (${normalized.width}×${normalized.height})`,
        );

        if (DRY_RUN) {
          await rm(normalized.file.path, { force: true });
          continue;
        }

        const stored = await storage.putThumbnail(
          normalized.file,
          normalized.extension,
        );
        await rm(normalized.file.path, { force: true });

        const nextUrl = stored.url;
        if (nextUrl === null) {
          throw new Error(`저장소가 공개 URL 을 돌려주지 않음: ${stored.key}`);
        }

        await dataSource.transaction(async (manager) => {
          await manager
            .getRepository(Content)
            .update({ id: content.id }, { thumbnailUrl: nextUrl });
          await auditLogService.record(
            {
              actor: SCRIPT_ACTOR,
              action: AUDIT_ACTION_CONTENT_THUMBNAIL_REPROCESS,
              target: `content:${content.id}`,
              before: { thumbnail_url: previousUrl, bytes: original.length },
              after: { thumbnail_url: nextUrl, bytes: normalized.file.size },
            },
            manager,
          );
        });

        const notRemoved = await storage.remove([previousKey]);
        if (notRemoved.length > 0) {
          console.log(`    옛 파일 삭제 실패(남겨 둠): ${previousKey}`);
        }
        replaced += 1;
      } catch (error) {
        failed += 1;
        console.log(
          `  실패 ${label} — ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    console.log(`끝 — 교체 ${replaced}편 · 실패 ${failed}편`);
  } finally {
    await rm(workDir, { recursive: true, force: true });
    await app.close();
  }
}

void main();
