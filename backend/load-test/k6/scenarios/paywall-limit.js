// 시나리오 4 — 무료 한도·페이월 (부하 아래서도 판정이 정확한가)
// 라이브러리 e2e "무료 사용자가 2편을 재생하면 3편째에 페이월이 열리고, 이미 튼 콘텐츠는 …"에서 따왔다.
//
// light 계정으로 서로 다른 콘텐츠를 연달아 재생해 (한도)번째까지 200, (한도+1)번째에 403 PLAY_LIMIT_EXCEEDED,
// 그리고 이미 튼 콘텐츠의 재재생은 한도와 무관하게 200(counted=false)인지 본다.
// 한도 값은 첫 재생 응답의 daily_play_limit에서 읽는다 — 문서 상수를 여기 박지 않는다.
//
// 한 계정은 서비스 날짜(04시 경계) 안에서 한 번만 의미가 있다. 그래서 per-vu-iterations 1회 고정이며,
// 같은 날 다시 돌리려면 다른 light 계정을 시드하거나 04시 이후에 돌린다.
// light 계정마다 라이브러리에 (한도+1)편 이상 있어야 한다 → seed-users.js --items 3 이상.
import { check } from 'k6';

import { COMMON_THRESHOLDS, tokensByTier } from '../lib/config.js';
import { authGet, authPost, expectJson, think } from '../lib/http.js';

const pool = tokensByTier('light');

export const options = {
  scenarios: {
    paywall: {
      executor: 'per-vu-iterations',
      vus: Math.max(1, Math.min(Number(__ENV.VUS || pool.length || 1), pool.length || 1)),
      iterations: 1,
      maxDuration: '5m',
      exec: 'paywallJourney',
    },
  },
  thresholds: {
    ...COMMON_THRESHOLDS,
    // 403은 규칙대로 난 응답이라 http_req_failed에서 빼고 본다 — k6는 4xx를 실패로 세므로 이 시나리오만 완화
    http_req_failed: ['rate<0.5'],
  },
};

export function setup() {
  if (pool.length === 0) throw new Error('light 티어 토큰이 없다 — seed-users.js --tier light 로 시드한다');
  return {};
}

export function paywallJourney() {
  const { token } = pool[(__VU - 1) % pool.length];

  const list = expectJson(authGet(token, '/users/me/library-items?filter=unplayed&limit=50'), 200, 'library unplayed');
  if (!list) return;
  // 오늘 이미 한도를 쓴 계정은 판정을 볼 수 없다 — 실패가 아니라 "오늘은 건너뜀"이다(계정당 서비스 날짜 1회)
  if (list.daily_play_count >= list.daily_play_limit) {
    console.warn(`[paywall] 계정이 오늘 한도(${list.daily_play_limit})를 이미 다 썼다 — 04시 이후 또는 다른 light 계정으로`);
    return;
  }
  const items = list.items.filter((i) => !i.is_counted_today);
  if (items.length < 2) {
    console.error(`오늘 아직 안 튼 항목이 ${items.length}개 — 이 계정은 오늘 이미 소진됐거나 라이브러리가 작다`);
    return;
  }

  let limit = null;
  let played = 0;
  for (const item of items) {
    const res = authPost(token, `/contents/${item.content.id}/play`, { entry_point: 'library' });
    if (res.status === 200) {
      const body = res.json();
      if (limit === null) limit = body.daily_play_limit;
      played += 1;
      check(body, {
        'play counted': (b) => b.counted === true,
        'daily_play_count == played so far': (b) => b.daily_play_count === played,
      });
      if (played >= limit) {
        // 한도까지 썼다 — 다음 항목에서 403이 나야 한다
        const next = items[played];
        if (!next) {
          console.error(`한도 ${limit}편을 쓴 뒤 남은 항목이 없어 403을 확인하지 못했다 — --items ${limit + 1} 이상으로 시드`);
          break;
        }
        const denied = authPost(token, `/contents/${next.content.id}/play`, { entry_point: 'library' });
        check(denied, {
          'over-limit play → 403': (r) => r.status === 403,
          'over-limit code = PLAY_LIMIT_EXCEEDED': (r) => String(r.body).includes('PLAY_LIMIT_EXCEEDED'),
        });
        break;
      }
      think(0.5, 1);
    } else {
      check(res, { 'unexpected play status': () => false });
      console.error(`play ${res.status}: ${String(res.body).slice(0, 200)}`);
      return;
    }
  }

  // 이미 튼 콘텐츠는 한도와 무관하게 다시 재생된다(재청취 창, counted=false)
  const replay = authPost(token, `/contents/${items[0].content.id}/play`, { entry_point: 'library' });
  check(replay, {
    'replay of counted content → 200': (r) => r.status === 200,
    'replay not counted again': (r) => r.status === 200 && r.json().counted === false,
  });
}

export default paywallJourney;
