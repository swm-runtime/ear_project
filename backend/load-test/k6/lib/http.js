// HTTP 도우미 — 인증 헤더·JSON·태그·표준 체크를 한 곳에 모은다.
// `name` 태그는 경로의 uuid를 지운 값이라 k6 결과가 엔드포인트 단위로 묶인다.
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate } from 'k6/metrics';

import { BASE_URL, THINK_MAX, THINK_MIN } from './config.js';

/** 429 — 서버가 느린 게 아니라 레이트 리밋이 동작한 것. 따로 세어 결과 해석에서 걸러낸다 */
export const rateLimited = new Counter('ear_rate_limited');
/** 기대한 403(한도 소진)처럼 "실패가 아닌 4xx"를 성공률에서 분리한다 */
export const expectedDenials = new Counter('ear_expected_denials');
/** 도메인 에러 응답(error_code 있음)의 비율 — http_req_failed와 달리 4xx도 포함 */
export const domainErrors = new Rate('ear_domain_errors');

const normalize = (path) => path.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, ':id').replace(/\?.*$/, '');

function params(token, path, extraTags = {}) {
  return {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    tags: { name: normalize(path), ...extraTags },
  };
}

function record(res) {
  if (res.status === 429) rateLimited.add(1);
  domainErrors.add(res.status >= 400 && res.status !== 429);
  return res;
}

export const authGet = (token, path, tags) => record(http.get(`${BASE_URL}${path}`, params(token, path, tags)));
export const authPost = (token, path, body, tags) =>
  record(http.post(`${BASE_URL}${path}`, body === undefined ? null : JSON.stringify(body), params(token, path, tags)));
export const authPut = (token, path, body, tags) =>
  record(http.put(`${BASE_URL}${path}`, JSON.stringify(body), params(token, path, tags)));
export const authDel = (token, path, tags) => record(http.del(`${BASE_URL}${path}`, null, params(token, path, tags)));

/** 상태 코드 체크 + JSON 파싱. 실패하면 null을 돌려 호출부가 여정을 끊게 한다 */
export function expectJson(res, status, label) {
  const ok = check(res, { [`${label} → ${status}`]: (r) => r.status === status });
  if (!ok) {
    if (res.status !== 429) console.error(`[${label}] ${res.status} ${String(res.body).slice(0, 200)}`);
    return null;
  }
  try {
    return res.json();
  } catch {
    return {};
  }
}

/** 화면 사이 사람의 대기 — 부하를 요청 폭주가 아니라 사용 흐름으로 만든다 */
export function think(min = THINK_MIN, max = THINK_MAX) {
  sleep(min + Math.random() * Math.max(0, max - min));
}

export function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}
