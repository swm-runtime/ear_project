#!/usr/bin/env node
// 가입 직후(온보딩 미완료) 계정 시드 — **api 컨테이너 안에서** 실행한다. 온보딩 여정 부하(onboarding-signup-ramp.js)용.
//
//   docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T -e NODE_PATH=/app/node_modules api \
//     node /tmp/lt/seed-signups.js --count 1600
//
// 만드는 것: users(provider='loadtest', tier light, onboarding_completed=false, onboarding_step='topic') 뿐이다.
// 관심 주제·라이브러리·첫 드립 작업은 시나리오가 API 로 만든다 — 그것이 측정 대상이다.
// 소셜 로그인은 밟지 않는다(인증 라우트 IP 한도와 무관하게 하려고). 토큰은 issue-tokens.js 가 직접 서명한다.
// 한 계정은 온보딩을 한 번만 끝낼 수 있다 → 계정 수 = 가입 시도 총 수. 지우기: cleanup-users.js --yes
//
// 옵션: --count N(기본 100) · --run 라벨(기본 시각)
const { randomUUID } = require('node:crypto');
const { Client } = require('pg');

function arg(name, dflt) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : dflt;
}

const count = Number(arg('count', 100));
const run = arg('run', new Date().toISOString().slice(0, 16).replace(/[-:T]/g, ''));
if (!(count > 0)) throw new Error('--count 는 1 이상');

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
    const ids = [];
    const values = [];
    const params = [];
    for (let i = 0; i < count; i++) {
      const id = randomUUID();
      ids.push(id);
      const b = params.length;
      params.push(id, `loadtest-${run}-signup-${i}`, `가입테스트 ${i}`);
      values.push(`($${b + 1}, 'loadtest', $${b + 2}, $${b + 3}, 'light', 'active', false, 'topic')`);
    }
    await client.query(
      `insert into users (id, provider, provider_user_id, nickname, tier, status, onboarding_completed, onboarding_step)
       values ${values.join(',')}`,
      params,
    );
    await client.query('commit');
    console.error(`[seed-signups] users=${count} run=${run} (onboarding 미완료)`);
    console.log(JSON.stringify(ids.map((user_id) => ({ user_id, tier: 'light' }))));
  } catch (e) {
    await client.query('rollback').catch(() => {});
    throw e;
  } finally {
    await client.end();
  }
})().catch((e) => {
  console.error('[seed-signups] 실패:', e.message);
  process.exit(1);
});
