#!/usr/bin/env node
// 부하 테스트 계정 시드 — **실서버 api 컨테이너 안에서** 실행한다(DB_* 환경변수와 pg 드라이버가 거기 있다).
//
//   docker compose -f docker-compose.prod.yml --env-file .env.prod cp load-test/server api:/tmp/lt
//   docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T api \
//     node /tmp/lt/seed-users.js --count 30 --tier pro --items 4
//
// 만드는 것: users(provider='loadtest', 온보딩 완료) · user_interests(관심 주제 3개, onboarding) ·
//           library_items(발행 중 콘텐츠 --items 편, source='drip', unplayed)
// 로그인은 밟지 않는다 — 토큰은 issue-tokens.js가 JWT_SECRET으로 직접 서명한다.
// 지우기: cleanup-users.js (provider='loadtest' 전부, 자식 행은 FK CASCADE)
//
// 옵션: --count N(기본 20) · --tier light|daily|pro(기본 pro) · --items K(기본 3) · --run 라벨(기본 시각)
const { randomUUID } = require('node:crypto');
const { Client } = require('pg');

function arg(name, dflt) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : dflt;
}

const count = Number(arg('count', 20));
const tier = arg('tier', 'pro');
const items = Number(arg('items', 3));
const run = arg('run', new Date().toISOString().slice(0, 16).replace(/[-:T]/g, ''));

if (!['light', 'daily', 'pro'].includes(tier)) throw new Error(`--tier 는 light|daily|pro: ${tier}`);
if (!(count > 0 && items > 0)) throw new Error('--count, --items 는 1 이상');

const client = new Client({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

(async () => {
  await client.connect();
  try {
    await client.query('begin');

    const contents = (
      await client.query(
        `select id from contents where status = 'published' order by published_at desc nulls last limit $1`,
        [items],
      )
    ).rows.map((r) => r.id);
    if (contents.length < items) {
      throw new Error(`발행 중 콘텐츠가 ${contents.length}편 — --items ${items} 를 채울 수 없다`);
    }
    const topics = (
      await client.query(
        `select distinct ct.topic_id from content_topics ct join contents c on c.id = ct.content_id where c.status = 'published' limit 3`,
      )
    ).rows.map((r) => r.topic_id);

    const userIds = [];
    for (let i = 0; i < count; i++) {
      const id = randomUUID();
      userIds.push(id);
      await client.query(
        `insert into users (id, provider, provider_user_id, nickname, tier, status, onboarding_completed, onboarding_step, onboarding_completed_at)
         values ($1, 'loadtest', $2, $3, $4, 'active', true, 'done', now())`,
        [id, `loadtest-${run}-${tier}-${i}`, `부하테스트 ${i}`, tier],
      );
      for (const topicId of topics) {
        await client.query(
          `insert into user_interests (id, user_id, topic_id, source, is_active, is_user_removed) values ($1, $2, $3, 'onboarding', true, false)`,
          [randomUUID(), id, topicId],
        );
      }
      for (const [k, contentId] of contents.entries()) {
        await client.query(
          `insert into library_items (id, user_id, content_id, source, status, added_at) values ($1, $2, $3, 'drip', 'unplayed', now() - ($4 || ' minutes')::interval)`,
          [randomUUID(), id, contentId, String(k)],
        );
      }
    }

    await client.query('commit');
    console.error(`[seed] users=${count} tier=${tier} items/user=${contents.length} interests/user=${topics.length} run=${run}`);
    // 표준 출력은 id 목록만 — issue-tokens.js가 그대로 읽는다
    console.log(JSON.stringify(userIds.map((user_id) => ({ user_id, tier }))));
  } catch (e) {
    await client.query('rollback').catch(() => {});
    throw e;
  } finally {
    await client.end();
  }
})().catch((e) => {
  console.error('[seed] 실패:', e.message);
  process.exit(1);
});
