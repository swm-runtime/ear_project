/**
 * 라이브러리 행의 상태를 재생 위치에 맞춘다(1회성, 2026-10-23 — KAN-248 후속).
 *
 * 탐색 재생 자동 적립 시절의 행은 `unplayed`로 생긴 뒤 라이브러리에서 다시 틀지 않으면 그대로였다 — 듣던 편이 진행 바 없이,
 * 드물게 끝까지 들은 편이 "듣는 중"으로 남았다. 지금은 담기·적립·복구가 상태를 맞추고(`LibraryService.syncWithProgress`),
 * 이 스크립트가 그 전의 행을 한 번 정리한다.
 *
 * - 대상: 살아 있는 행 중 최대 도달 ≥ 길이 × 90% → `completed`(`completed_at` = 위치 갱신 시각) · 그 밖에 `unplayed`인데
 *   위치 > 0 → `in_progress`. `last_played_at`이 비면 위치 갱신 시각으로. `completed`는 내리지 않는다. 신호는 쌓지 않는다
 * - **멱등이다.** 다시 돌리면 0건이다. 한 번의 UPDATE라 중간 상태가 없다
 *
 * 실행:
 *   npm run library:sync-status -- --dry-run      # 바뀔 수만 출력
 *   운영 컨테이너: node dist/scripts/sync-library-status.js [--dry-run]
 */
import './one-off-script';
import 'dotenv/config';

import { NestFactory } from '@nestjs/core';

import { AppModule } from '@/app.module';
import { LibraryService } from '@/modules/library/library.service';

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const result = await app
      .get(LibraryService)
      .syncAllStatusWithProgress(dryRun);

    console.log(
      `${dryRun ? '바뀔 행(dry-run — 바꾸지 않음)' : '바꾼 행'} — completed ${result.toCompleted} · in_progress ${result.toInProgress}`,
    );
  } finally {
    await app.close();
  }
}

void main();
