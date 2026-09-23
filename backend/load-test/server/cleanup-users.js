#!/usr/bin/env node
// 부하 테스트 계정 정리 — **실서버 api 컨테이너 안에서** 실행한다.
// provider='loadtest' 사용자를 지운다. 라이브러리·재생 기록·위치·신호·세션은 FK ON DELETE CASCADE 로 함께 지워진다.
// 사용자 FK 가 없는 흔적(content_stats 집계·audio_access_logs)은 남는다 — 집계는 다음 배치가 다시 세고,
// 접근 로그는 device_id='k6-load-test' 로 구분된다. 멱등키(idempotency_keys)는 owner_key='user:<id>' 문자열이라
// CASCADE 가 닿지 않으므로 여기서 함께 지운다(2026-09-23 — 온보딩 램프가 사용자당 1건씩 남겼다).
//
//   docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T -e NODE_PATH=/app/node_modules api node /tmp/lt/cleanup-users.js --yes
//
// 옵션: --yes(없으면 개수만 보여주고 끝) · --run 라벨(그 시드분만)
const { Client } = require('pg');

function arg(name, dflt) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : dflt;
}
const yes = process.argv.includes('--yes');
const run = arg('run', null);

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
    const where = `provider = 'loadtest'` + (run ? ` and provider_user_id like $1` : '');
    const params = run ? [`loadtest-${run}-%`] : [];
    const { rows } = await client.query(
      `select count(*)::int as users,
              (select count(*)::int from library_items li join users u on u.id = li.user_id where u.${where}) as library_items,
              (select count(*)::int from play_records pr join users u on u.id = pr.user_id where u.${where}) as play_records
         from users where ${where}`,
      params,
    );
    console.error(`[cleanup] 대상 users=${rows[0].users} library_items=${rows[0].library_items} play_records=${rows[0].play_records}` + (run ? ` (run=${run})` : ''));
    if (!yes) {
      console.error('[cleanup] --yes 를 붙이면 지운다');
      return;
    }
    // 멱등키는 owner_key='user:<id>' 문자열 참조라 CASCADE 가 닿지 않는다 — 사용자보다 먼저 지운다
    const idem = await client.query(
      `delete from idempotency_keys where owner_key in (select 'user:' || id from users where ${where})`,
      params,
    );
    const del = await client.query(`delete from users where ${where}`, params);
    console.error(`[cleanup] users ${del.rowCount}건 삭제(자식 행은 CASCADE) · idempotency_keys ${idem.rowCount}건`);
  } finally {
    await client.end();
  }
})().catch((e) => {
  console.error('[cleanup] 실패:', e.message);
  process.exit(1);
});
