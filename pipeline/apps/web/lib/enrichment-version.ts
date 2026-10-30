/** 현재 추천 메타 형식 버전 — 원본은 서버 CURRENT_ENRICHMENT_SCHEMA_VERSION(admin-api 4.6). 3 = 해시태그 포함(KAN-162 운영 배포 뒤 KAN-164). **워커 ENRICH_TAGS=1 과 같은 시점에 움직인다** — 콘솔만 먼저 올리면 발행분 전부가 "구형 v2"로 보이는데 다시 뽑아도 태그가 붙지 않는다(2026-10-13 먼저 올렸다가 되돌림 #1486). 2026-10-14 AI 서버 워커 env.prod 에 ENRICH_TAGS=1 을 넣고 재기동한 뒤 3으로 올렸다.
 * 브라우저 전용 lib/ear.ts 에서 떼어 둔 것은 서버 액션(발행 전 결과물 대체, lib/enrich-fallback.ts)도 같은 값을 써야 해서다 */
export const ENRICHMENT_SCHEMA_VERSION_FALLBACK = 3;
