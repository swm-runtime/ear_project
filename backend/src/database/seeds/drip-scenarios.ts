/**
 * 드립 편성 규칙 검증 — 합성 시나리오 러너.
 *
 * `npm run drip:scenarios` (로컬 DB 필수, 운영 금지)
 *
 * 콘텐츠가 적은 시기에도 참/거짓이 나오는 **규칙 정합성**을 검증한다(추천 "품질"은 표본이 있어야
 * 하므로 여기서 다루지 않는다). 방식: 격리된 주제·콘텐츠·사용자를 심고 → **실제 배치 코드**
 * (`DripBatchOrchestrator.run`)를 그대로 돌리고 → 라이브러리에 무엇이 적립됐는지로 판정한다.
 * 제품 코드는 건드리지 않는다 — 테스트 대상은 `drip-scheduling.md` 4.1~4.8의 규칙이다.
 *
 * 격리: 모든 행에 `[drip-scn]` 접두를 붙이고 끝나면 지운다. 배치 자체는 전 사용자를 대상으로 도므로
 * 로컬 DB의 다른 사용자도 함께 편성된다(그들의 결과는 판정에 쓰지 않는다). `run_date`는 미래 날짜를
 * 써서 그날의 실제 배치와 충돌하지 않게 한다.
 */
import 'dotenv/config';

import { NestFactory } from '@nestjs/core';
import { DataSource, EntityManager } from 'typeorm';

import { AppModule } from '@/app.module';
import { toServiceDate } from '@/common/utils/service-date.util';
import { DripBatchOrchestrator } from '@/modules/drip-batch/drip-batch.orchestrator';
import { UNFINISHED_INVENTORY_LIMIT } from '@/modules/drip/drip.constant';

const TAG = '[drip-scn]';
/** 실제 배치(오늘 05:00)의 run_date와 겹치지 않게 30일 뒤 05:00 KST로 돈다 */
const RUN_AT = (() => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 30);
  d.setUTCHours(20, 0, 0, 0); // 05:00 KST
  return d;
})();
/** 배치 기록의 키 — 서버와 같은 규칙(04시 경계, KST)으로 환산해야 같은 행을 본다 */
const RUN_DATE = toServiceDate(RUN_AT);

interface Row {
  id: string;
}

interface RunRow {
  target_count: number;
  success_count: number;
  skipped_count: number;
  failed_count: number;
  finished_at: Date | null;
}

/** TypeORM `query()`는 any를 준다 — 결과 모양을 한 곳에서만 단언한다 */
async function rows<T>(
  runner: { query(sql: string, params?: unknown[]): Promise<unknown> },
  sql: string,
  params: unknown[],
): Promise<T[]> {
  return (await runner.query(sql, params)) as T[];
}

let failed = 0;
function check(name: string, ok: boolean, detail = ''): void {
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`,
  );
  if (!ok) failed += 1;
}

async function topic(m: EntityManager, name: string): Promise<string> {
  const [row] = await rows<Row>(
    m,
    `INSERT INTO topics (name, parent_category, is_visible, display_order)
     VALUES ($1, '검증', true, 999) RETURNING id`,
    [`${TAG} ${name}`],
  );
  return row.id;
}

async function content(
  m: EntityManager,
  title: string,
  topicIds: string[],
  opts: {
    seriesId?: string;
    episodeNo?: number;
    totalEpisodes?: number;
    publishedDaysAgo?: number;
  } = {},
): Promise<string> {
  const [row] = await rows<Row>(
    m,
    `INSERT INTO contents (title, description, source_name, origin, audio_path, duration_sec,
                           thumbnail_url, status, published_at, series_id, episode_no, total_episodes)
     VALUES ($1, '검증', '참고한 자료: 검증', 'ai_generated', $2, 600, 'https://x/t.png', 'published',
             now() - ($3 || ' days')::interval, $4, $5, $6) RETURNING id`,
    [
      `${TAG} ${title}`,
      `audio/${TAG}-${title}.mp3`,
      String(opts.publishedDaysAgo ?? 1),
      opts.seriesId ?? null,
      opts.episodeNo ?? null,
      opts.totalEpisodes ?? null,
    ],
  );
  for (const topicId of topicIds) {
    await m.query(
      `INSERT INTO content_topics (content_id, topic_id) VALUES ($1, $2)`,
      [row.id, topicId],
    );
  }
  return row.id;
}

async function user(
  m: EntityManager,
  name: string,
  topicIds: string[],
): Promise<string> {
  const [row] = await rows<Row>(
    m,
    `INSERT INTO users (provider, provider_user_id, nickname, onboarding_completed, onboarding_step, tier)
     VALUES ('kakao', $1, $2, true, 'done', 'light') RETURNING id`,
    [`${TAG}-${name}`, `${TAG} ${name}`],
  );
  for (const topicId of topicIds) {
    await m.query(
      `INSERT INTO user_interests (user_id, topic_id, source, is_active, is_user_removed) VALUES ($1, $2, 'onboarding', true, false)`,
      [row.id, topicId],
    );
  }
  await isolatePool(m, row.id);
  return row.id;
}

/**
 * 후보 풀 격리 — 로컬 DB에 이미 있는 다른 발행 콘텐츠를 이 사용자에게는 "이미 들은 것"으로 표시해
 * 탐험·정규 풀이 시나리오 콘텐츠만 보게 한다. 배치 코드는 그대로 두고 데이터로만 격리한다.
 */
async function isolatePool(m: EntityManager, userId: string): Promise<void> {
  await m.query(
    `INSERT INTO drip_excluded_contents (user_id, content_id, reason, excluded_at)
     SELECT $1, id, 'played', now() FROM contents WHERE status = 'published' AND title NOT LIKE $2`,
    [userId, `${TAG} %`],
  );
}

async function libraryItem(
  m: EntityManager,
  userId: string,
  contentId: string,
  status = 'unplayed',
): Promise<void> {
  await m.query(
    `INSERT INTO library_items (user_id, content_id, source, status, added_at) VALUES ($1, $2, 'save', $3, now())`,
    [userId, contentId, status],
  );
}

async function exclude(
  m: EntityManager,
  userId: string,
  contentId: string,
  reason: string,
): Promise<void> {
  await m.query(
    `INSERT INTO drip_excluded_contents (user_id, content_id, reason, excluded_at) VALUES ($1, $2, $3, now())`,
    [userId, contentId, reason],
  );
}

/** 전체 기간 집계 행 — 배치의 인기·품질 입력(`content_stats`, period 'all') */
async function allTimeStats(
  m: EntityManager,
  contentId: string,
  playCount: number,
  completeCount: number,
): Promise<void> {
  await m.query(
    `INSERT INTO content_stats (content_id, period_type, period_start, play_count, complete_count)
     VALUES ($1, 'all', '1970-01-01', $2, $3)`,
    [contentId, playCount, completeCount],
  );
}

async function completeEpisode(
  m: EntityManager,
  userId: string,
  contentId: string,
): Promise<void> {
  await libraryItem(m, userId, contentId, 'completed');
  await m.query(
    `UPDATE library_items SET completed_at = now() WHERE user_id = $1 AND content_id = $2`,
    [userId, contentId],
  );
}

/** 이번 배치가 그 사용자에게 적립한 항목(source별) */
async function dripped(
  db: DataSource,
  userId: string,
): Promise<{ contentId: string; source: string; title: string }[]> {
  return await db.query(
    `SELECT li.content_id AS "contentId", li.source, c.title
       FROM library_items li JOIN contents c ON c.id = li.content_id
      WHERE li.user_id = $1 AND li.source IN ('drip', 'discovery')
      ORDER BY li.source, c.title`,
    [userId],
  );
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('시나리오 러너는 운영 환경에서 실행할 수 없다');
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });
  const db = app.get(DataSource);
  const orchestrator = app.get(DripBatchOrchestrator);

  // 이전 실행 잔여물 정리(중단됐을 수 있다)
  await cleanup(db);

  const fx = await db.transaction(async (m) => {
    const tA = await topic(m, 'A');
    const tB = await topic(m, 'B');
    const tC = await topic(m, 'C');

    // 주제 A: 단편 4 + 시리즈 3편(ep1~3)
    const a1 = await content(m, 'A-1', [tA]);
    const a2 = await content(m, 'A-2', [tA]);
    const a3 = await content(m, 'A-3', [tA]);
    const a4 = await content(m, 'A-4', [tA]);
    const seriesId = a1; // series_id는 uuid면 되므로 첫 콘텐츠 id를 빌린다
    const s1 = await content(m, 'A-S1', [tA], {
      seriesId,
      episodeNo: 1,
      totalEpisodes: 3,
    });
    const s2 = await content(m, 'A-S2', [tA], {
      seriesId,
      episodeNo: 2,
      totalEpisodes: 3,
    });
    const s3 = await content(m, 'A-S3', [tA], {
      seriesId,
      episodeNo: 3,
      totalEpisodes: 3,
    });
    // 주제 B: 단편 3 (탐험 슬롯 후보 — 사용자들의 관심 밖)
    const b1 = await content(m, 'B-1', [tB]);
    const b2 = await content(m, 'B-2', [tB]);
    const b3 = await content(m, 'B-3', [tB]);
    // 주제 C: 콘텐츠 1편 (고갈 시나리오용)
    const c1 = await content(m, 'C-1', [tC]);

    // 카탈로그 전체가 "훑어보기만 한" 상태 — 재생은 있고 완청은 거의 없다(2026-09-10 실서버 재현).
    // 절대 하한(0.2)만 있으면 탐험 후보가 전멸해 U1·U5의 탐험 1편이 0이 된다(회귀 검증)
    for (const id of [...[a1, a2, a3, a4], s1, b1, b2, b3, c1])
      await allTimeStats(m, id, 10, 0);
    await allTimeStats(m, s2, 10, 1);

    // U1 기본: 관심 A만. 정규 2편은 전부 A, 탐험 1편은 B에서
    const u1 = await user(m, 'u1-basic', [tA]);
    // U2 시리즈: 관심 A, S1 완청 → S2는 허용, S3는 불가
    const u2 = await user(m, 'u2-series', [tA]);
    await completeEpisode(m, u2, s1);
    // 시리즈 외 단편은 라이브러리에 넣어 두어 후보를 시리즈로 좁힌다
    for (const id of [a1, a2, a3, a4]) await libraryItem(m, u2, id);
    // U3 영구 제외: 관심 A, A-1·A-2·A-3·S1~S3 제외/보유 → 남는 후보는 A-4 하나
    const u3 = await user(m, 'u3-excluded', [tA]);
    await exclude(m, u3, a1, 'played');
    await exclude(m, u3, a2, 'library_delete');
    await libraryItem(m, u3, a3);
    for (const id of [s1, s2, s3]) await libraryItem(m, u3, id);
    // U4 재고 초과: 관심 A, 미청취 5편 보유 → 건너뜀
    const u4 = await user(m, 'u4-inventory', [tA]);
    for (const id of [a1, a2, a3, a4, s1]) await libraryItem(m, u4, id);
    // U5 고갈: 관심 C, C-1은 이미 라이브러리에 → 정규 0편(탐험은 허용)
    const u5 = await user(m, 'u5-exhausted', [tC]);
    await libraryItem(m, u5, c1);
    // U6 관심 0: 온보딩 완료지만 관심 주제 없음 → 건너뜀
    const u6 = await user(m, 'u6-no-interest', []);

    return {
      tA,
      tB,
      tC,
      a: [a1, a2, a3, a4],
      s: [s1, s2, s3],
      b: [b1, b2, b3],
      c1,
      u1,
      u2,
      u3,
      u4,
      u5,
      u6,
    };
  });

  try {
    await orchestrator.run(RUN_AT);

    const inA = new Set([...fx.a, ...fx.s]);

    // U1
    const d1 = await dripped(db, fx.u1);
    const d1Drip = d1.filter((x) => x.source === 'drip');
    const d1Disc = d1.filter((x) => x.source === 'discovery');
    check(
      'U1 정규 2편이 적립된다(4.6)',
      d1Drip.length === 2,
      `${d1Drip.length}편`,
    );
    check(
      'U1 정규 편은 전부 관심 주제(A) 안이다(4.2 필터)',
      d1Drip.every((x) => inA.has(x.contentId)),
    );
    check(
      'U1 정규 편에 시리즈 2·3편이 오지 않는다(4.2 시리즈 순서)',
      d1Drip.every((x) => x.contentId !== fx.s[1] && x.contentId !== fx.s[2]),
    );
    check(
      'U1 탐험 1편이 관심 밖 주제(B 또는 C)에서 온다(4.8)',
      d1Disc.length === 1 && !inA.has(d1Disc[0]?.contentId ?? ''),
      d1Disc.map((x) => x.title).join(','),
    );

    // U2
    const d2 = await dripped(db, fx.u2);
    const d2Drip = d2
      .filter((x) => x.source === 'drip')
      .map((x) => x.contentId);
    check(
      'U2 S1 완청 후 S2는 오고 S3는 오지 않는다(시리즈 순서)',
      d2Drip.includes(fx.s[1]) && !d2Drip.includes(fx.s[2]),
      `drip=${d2
        .filter((x) => x.source === 'drip')
        .map((x) => x.title)
        .join(',')}`,
    );

    // U3
    const d3 = await dripped(db, fx.u3);
    const d3Drip = d3
      .filter((x) => x.source === 'drip')
      .map((x) => x.contentId);
    check(
      'U3 played·library_delete 제외분은 다시 오지 않는다(FR-16)',
      !d3Drip.includes(fx.a[0]) && !d3Drip.includes(fx.a[1]),
    );
    check(
      'U3 남은 후보 A-4 한 편만 적립되고 대체 편성은 없다(7장)',
      d3Drip.length === 1 && d3Drip[0] === fx.a[3],
      `${d3Drip.length}편`,
    );

    // U4
    const d4 = await dripped(db, fx.u4);
    check(
      `U4 미청취 ${UNFINISHED_INVENTORY_LIMIT}편 보유면 정규·탐험 모두 건너뛴다(4.1)`,
      d4.length === 0,
      `${d4.length}편`,
    );

    // U5
    const d5 = await dripped(db, fx.u5);
    check(
      'U5 관심 주제 콘텐츠가 전부 라이브러리에 있으면 정규 0편(고갈, 대체 없음)',
      d5.filter((x) => x.source === 'drip').length === 0,
    );
    check(
      'U5 고갈이어도 탐험 1편은 관심 밖에서 온다(4.8 독립)',
      d5.filter((x) => x.source === 'discovery').length === 1,
      d5.map((x) => `${x.source}:${x.title}`).join(','),
    );

    // U6
    const d6 = await dripped(db, fx.u6);
    check('U6 관심 주제 0이면 건너뛴다(4.1 방어)', d6.length === 0);

    // 배치 기록
    const [run] = await rows<RunRow>(
      db,
      `SELECT target_count, success_count, skipped_count, failed_count, finished_at
         FROM drip_batch_runs WHERE run_date = $1`,
      [RUN_DATE],
    );
    check(
      '배치 실행 기록이 닫혔다(finished_at)',
      Boolean(run?.finished_at),
      JSON.stringify(run),
    );
    check(
      '사용자 단위 실패 0',
      run?.failed_count === 0,
      `failed=${run?.failed_count}`,
    );

    // 상수 검증 — 고갈 수학의 입력
    console.log(
      `\n참고: 미청취 재고 상한 ${UNFINISHED_INVENTORY_LIMIT}편 · 하루 정규 2편 + 탐험 1편 → 관심 주제 안 콘텐츠 C편이면 약 C/2일 뒤 고갈`,
    );
  } finally {
    await cleanup(db);
    await db.query(`DELETE FROM drip_batch_runs WHERE run_date = $1`, [
      RUN_DATE,
    ]);
    await app.close();
  }

  console.log(failed === 0 ? '\n전부 통과' : `\n실패 ${failed}건`);
  process.exitCode = failed === 0 ? 0 : 1;
}

async function cleanup(db: DataSource): Promise<void> {
  // users 삭제로 관심사·라이브러리·제외·신호가 CASCADE로 함께 지워진다
  await db.query(`DELETE FROM users WHERE provider_user_id LIKE $1`, [
    `${TAG}-%`,
  ]);
  await db.query(`DELETE FROM contents WHERE title LIKE $1`, [`${TAG} %`]);
  await db.query(`DELETE FROM topics WHERE name LIKE $1`, [`${TAG} %`]);
}

void main();
