// 시나리오 2 — 둘러보기 (읽기 집중)
// 라이브러리 e2e "탭·출처·주제 필터와 커서 페이지네이션이 조합되고…"와 탐색 화면 진입을 합쳤다.
// 쓰기가 없어 아무 계정으로나 돌 수 있고, 청취 시나리오와 동시에 띄워도 상태를 어지럽히지 않는다.
//
//   GET /users/me/library-items  (filter=all|unplayed|completed · source_filter=drip|save · topic_filter · cursor)
//   GET /users/me/library-items/topics
//   GET /users/me/library-items/resume
//   GET /explore/feed · /explore/popular?period=week · /explore/topics · /explore/search?query=…
//   GET /contents/:id
//   GET /users/me/profile
import { check } from 'k6';

import { COMMON_THRESHOLDS, TOKENS, VUS, rampStages, tokenForVu, warnIfAccountsOverlap } from '../lib/config.js';
import { authGet, expectJson, pick, think } from '../lib/http.js';

const SEARCH_TERMS = ['협상', '리더십', '개발', '디자인', '커리어', '데이터'];

export const options = {
  scenarios: {
    browse: { executor: 'ramping-vus', stages: rampStages(), gracefulRampDown: '30s', exec: 'browseJourney' },
  },
  thresholds: {
    ...COMMON_THRESHOLDS,
    // 피드는 섹션 여러 개를 한 번에 만들어 가장 무거운 읽기다
    'http_req_duration{name:/explore/feed}': ['p(95)<800'],
    'http_req_duration{name:/users/me/library-items}': ['p(95)<400'],
  },
};

export function setup() {
  warnIfAccountsOverlap(TOKENS, VUS, 'browse');
  return {};
}

export function browseJourney() {
  const { token } = tokenForVu();

  // 라이브러리 — 탭 3개를 차례로 누른다
  const all = expectJson(authGet(token, '/users/me/library-items?filter=all&limit=20'), 200, 'library all');
  if (!all) return;
  check(all, { 'list has service_date': (b) => typeof b.service_date === 'string' });
  think(0.5, 1.5);
  expectJson(authGet(token, '/users/me/library-items?filter=unplayed&limit=20'), 200, 'library unplayed');
  think(0.5, 1.5);
  expectJson(authGet(token, '/users/me/library-items?filter=completed&limit=20'), 200, 'library completed');
  think();

  // 필터 시트 — 출처·주제. 주제는 목록 첫 항목의 주제를 그대로 건다(빈 결과 방지)
  authGet(token, '/users/me/library-items/topics');
  expectJson(authGet(token, '/users/me/library-items?source_filter=drip&limit=20'), 200, 'library source=drip');
  const first = all.items && all.items[0];
  if (first && first.content.topic_ids && first.content.topic_ids.length > 0) {
    expectJson(
      authGet(token, `/users/me/library-items?topic_filter=${first.content.topic_ids[0]}&limit=20`),
      200,
      'library topic filter',
    );
  }
  // 커서 페이지네이션 — 다음 페이지가 있으면 한 번 더 넘긴다(limit을 작게 줘서 커서를 만든다)
  const paged = expectJson(authGet(token, '/users/me/library-items?filter=all&limit=2'), 200, 'library page 1');
  if (paged && paged.has_next && paged.next_cursor) {
    expectJson(
      authGet(token, `/users/me/library-items?filter=all&limit=2&cursor=${encodeURIComponent(paged.next_cursor)}`),
      200,
      'library page 2',
    );
  }
  authGet(token, '/users/me/library-items/resume');
  think();

  // 탐색 탭
  expectJson(authGet(token, '/explore/feed'), 200, 'explore feed');
  think(0.5, 1.5);
  expectJson(authGet(token, '/explore/popular?period=week&limit=20'), 200, 'explore popular');
  expectJson(authGet(token, '/explore/topics'), 200, 'explore topics');
  expectJson(authGet(token, `/explore/search?query=${encodeURIComponent(pick(SEARCH_TERMS))}`), 200, 'explore search');
  think();

  // 상세 한 번, 프로필 한 번
  if (first) expectJson(authGet(token, `/contents/${first.content.id}`), 200, 'content detail');
  expectJson(authGet(token, '/users/me/profile'), 200, 'profile');
  think();
}

export default browseJourney;
