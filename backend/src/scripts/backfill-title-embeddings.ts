/**
 * 검색 의미 엔진의 제목 임베딩(`content_title_embeddings`)을 채운다 — 도입 이전에 발행된 편·발행 훅이 실패한 편용.
 *
 * - **멱등이다.** 대상은 "유효한 제목 임베딩이 없는 편"(행 없음 · 모델 다름 · `source_text` ≠ 지금 제목)뿐이라, 다시 돌리면
 *   남은 편만 부르고 다 채운 뒤에는 0편이다. 중간에 끊겨도 처음부터 다시 돌리면 된다.
 * - 한 편씩 차례로 AI 서버 `POST /embeddings`를 부르고 사이에 `--delay-ms`(기본 200ms — 초당 5건)를 쉰다.
 * - 한 편의 실패(AI 서버 결손)는 건너뛰고 끝에 실패 수를 출력한다. 실패가 하나라도 있으면 종료 코드 1이다.
 * - 상태는 가리지 않는다(회수 편도 채운다 — 복구되면 다시 검색에 나온다). 최근 발행 순이다.
 *
 * 실행:
 *   npm run embeddings:backfill-titles -- --dry-run          # 대상 수만 출력
 *   npm run embeddings:backfill-titles -- --limit 50         # 최근 50편만
 *   운영 컨테이너: node dist/scripts/backfill-title-embeddings.js [--dry-run] [--limit N] [--delay-ms N]
 */
import 'dotenv/config';

import { NestFactory } from '@nestjs/core';

import { AppModule } from '@/app.module';
import { TITLE_EMBEDDING_BACKFILL_DELAY_MS } from '@/modules/content/content.constant';
import { ContentTitleEmbeddingService } from '@/modules/content/services/content-title-embedding.service';

function readNumberFlag(name: string): number | undefined {
  const index = process.argv.indexOf(name);

  if (index === -1) {
    return undefined;
  }

  const value = Number(process.argv[index + 1]);

  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} 값은 0 이상의 정수여야 한다`);
  }

  return value;
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const limit = readNumberFlag('--limit');
  const delayMs =
    readNumberFlag('--delay-ms') ?? TITLE_EMBEDDING_BACKFILL_DELAY_MS;

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const service = app.get(ContentTitleEmbeddingService);

    if (!service.enabled && !dryRun) {
      console.log(
        'AI 서버가 설정되지 않았다(AI_SERVER_URL · AI_SERVER_INTERNAL_TOKEN) — 중단',
      );
      process.exitCode = 1;
      return;
    }

    const result = await service.backfill(
      { limit, delayMs, dryRun },
      (target, outcome) => {
        console.log(`  ${outcome} ${target.id.slice(0, 8)} ${target.title}`);
      },
    );

    console.log(
      dryRun
        ? `대상 ${result.targets}편 (dry-run — 부르지 않음)`
        : `끝 — 대상 ${result.targets}편 · 생성 ${result.created}편 · 실패 ${result.failed}편`,
    );

    if (result.failed > 0) {
      process.exitCode = 1;
    }
  } finally {
    await app.close();
  }
}

void main();
