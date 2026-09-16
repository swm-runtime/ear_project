#!/usr/bin/env node
// 부하 테스트 계정의 access 토큰 발급 — **실서버 api 컨테이너 안에서** 실행한다(JWT_SECRET이 거기 있다).
//
// access 토큰은 무상태다(서명·만료·typ만 검사 — jwt-auth.guard.ts). 그래서 로그인 API를 부르지 않고
// 서버와 같은 비밀키로 직접 서명하면 인증 라우트의 IP당 분당 20회 제한과 무관하게 계정 수만큼 만들 수 있다.
//
//   docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T -e NODE_PATH=/app/node_modules api \
//     node /tmp/lt/issue-tokens.js --ttl 3h > /tmp/tokens.json        # provider='loadtest' 전 계정
//   scp -i ~/.ssh/ear-prod-isb.pem ec2-user@<HOST>:/tmp/tokens.json backend/load-test/out/tokens.json
//
// 옵션: --ttl 2h(기본 — 테스트 길이보다 길게) · --tier light|daily|pro(그 티어만)
// 출력(표준 출력): [{ user_id, tier, token }]  ← k6 lib/config.js가 읽는 형식
// 토큰 파일은 실계정과 같은 권한을 가진 비밀이다 — 커밋하지 않고(out/ 는 gitignore) 테스트가 끝나면 지운다.
const jwt = require('jsonwebtoken');
const { Client } = require('pg');

function arg(name, dflt) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : dflt;
}

const ttl = arg('ttl', '2h');
const tierFilter = arg('tier', null);
const secret = process.env.JWT_SECRET;
if (!secret) throw new Error('JWT_SECRET 이 없다 — api 컨테이너 안에서 실행한다');

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
    const rows = (
      await client.query(
        `select id, tier from users where provider = 'loadtest' and status = 'active' ${tierFilter ? 'and tier = $1' : ''} order by created_at, provider_user_id`,
        tierFilter ? [tierFilter] : [],
      )
    ).rows;
    if (rows.length === 0) throw new Error('loadtest 계정이 없다 — seed-users.js 를 먼저 실행한다');

    // token.service.ts issueAccessToken 과 같은 페이로드 — sub·role·typ. 알고리즘은 @nestjs/jwt 기본(HS256)
    const tokens = rows.map((r) => ({
      user_id: r.id,
      tier: r.tier,
      token: jwt.sign({ sub: r.id, role: 'user', typ: 'access' }, secret, { expiresIn: ttl }),
    }));
    console.error(`[tokens] ${tokens.length}개 발급 · ttl=${ttl}` + (tierFilter ? ` · tier=${tierFilter}` : ''));
    console.log(JSON.stringify(tokens));
  } finally {
    await client.end();
  }
})().catch((e) => {
  console.error('[tokens] 실패:', e.message);
  process.exit(1);
});
