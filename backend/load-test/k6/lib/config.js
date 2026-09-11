// 공통 설정 — 모든 시나리오가 이 파일 하나만 읽는다.
//
// 환경변수(k6 -e KEY=VALUE 또는 셸 환경):
//   BASE_URL      기본 https://api.earcast.co.kr/api/v1  (로컬: http://localhost:3000/api/v1)
//   TOKENS_FILE   기본 ../../out/tokens.json — server/issue-tokens.js 출력
//   VUS           동시 가상 사용자 수(기본 20). 토큰 수보다 크면 계정이 겹쳐 사용자별 분당 300회 제한에 걸린다
//   DURATION      부하 유지 시간(기본 5m)
//   THINK_MIN/MAX 화면 사이 대기 초(기본 1~3)
import { SharedArray } from 'k6/data';

export const BASE_URL = (__ENV.BASE_URL || 'https://api.earcast.co.kr/api/v1').replace(/\/+$/, '');
export const VUS = Number(__ENV.VUS || 20);
export const DURATION = __ENV.DURATION || '5m';
export const THINK_MIN = Number(__ENV.THINK_MIN || 1);
export const THINK_MAX = Number(__ENV.THINK_MAX || 3);

/**
 * 토큰 파일 — [{ user_id, tier, token }]. SharedArray라 VU 수만큼 복제되지 않는다.
 * 경로는 이 파일 기준 상대 경로다(k6 open()의 규칙).
 */
export const TOKENS = new SharedArray('tokens', () => {
  const raw = JSON.parse(open(__ENV.TOKENS_FILE || '../../out/tokens.json'));
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error('tokens.json이 비어 있다 — server/issue-tokens.js를 먼저 실행한다');
  }
  return raw;
});

/** VU 번호 → 계정. 계정 수 = VU 수가 원칙이며, 넘치면 순환한다(겹침 경고는 setup에서 낸다) */
export function tokenForVu(pool = TOKENS) {
  return pool[(__VU - 1) % pool.length];
}

/** 티어로 계정을 고른다(페이월 시나리오는 light만, 청취 시나리오는 pro 우선) */
export function tokensByTier(tier) {
  return TOKENS.filter((t) => t.tier === tier);
}

/** 서비스 공통 임계값 — 실패율 1% 미만, p95 500ms, p99 1s. 수치는 팀 SLO 확정 시 여기만 바꾼다 */
export const COMMON_THRESHOLDS = {
  http_req_failed: ['rate<0.01'],
  http_req_duration: ['p(95)<500', 'p(99)<1000'],
  checks: ['rate>0.99'],
};

/** 표준 부하 곡선 — 워밍업 → 유지 → 램프다운. smoke는 이걸 쓰지 않는다 */
export function rampStages(vus = VUS, duration = DURATION) {
  return [
    { duration: '30s', target: Math.max(1, Math.floor(vus / 2)) },
    { duration: '30s', target: vus },
    { duration, target: vus },
    { duration: '30s', target: 0 },
  ];
}

export function warnIfAccountsOverlap(pool, vus, label) {
  if (vus > pool.length) {
    console.warn(
      `[${label}] VU ${vus} > 계정 ${pool.length} — 계정이 겹쳐 사용자별 분당 300회 제한(429)과 라이브러리 상태 공유가 생긴다. seed-users.js로 계정을 늘려라`,
    );
  }
}
