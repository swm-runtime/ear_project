# [BE] 전수 감사 하 등급 묶음 — 경합성 잠재 건·소규모 개선 (한 PR에서 처리)

| 항목 | 값 |
|---|---|
| 대상 | 아래 표 |
| 요청 파트 | 백엔드 |
| 발행 날짜 | 2026-09-09 |
| 발견 시점 | 백엔드 전수 감사 (2026-09-09) — 심각도 하로 분류된 것 중 코드 한두 줄이 아닌 것들 |
| 근거 문서 | 각 행 |
| 심각도 | **하** |
| 상태 | **완료** (2026-09-09) — 12행 전부 처리 결과 기록 |

코드 한두 줄짜리 6건(graceful shutdown·Slack 타임아웃·lint 경고·회수 커서 tie-break·first_drip 파기·DB 풀 명시)은
감사 직후 PR에서 처리했다. 여기 남긴 것은 **동시성 잠재 건**이거나 계약 확인이 필요한 것들이다.

| # | 항목 | 근거 | 권장 조치 | 처리 결과 (2026-09-09) |
|---|---|---|---|---|
| 1 | **탈퇴 멱등키 자기 파기 충돌** — 탈퇴가 자기 `owner_key` 행을 지워 같은 키 재시도가 저장 응답 대신 404 | `user-withdrawal.service.ts:227-230`, domain.md 1.4 | 현재 요청의 키만 파기에서 제외하거나, 계약(auth-api 4.7)에 "재시도는 404 = 이미 탈퇴됨"을 명시  **수정** — `deleteByOwnerKey`가 `in_progress` 행을 남긴다(현재 요청의 키). `complete`가 204를 기록해 같은 키 재시도는 저장 응답을 받는다. 남은 행은 24h 만료 배치가 지운다 |
| 2 | **온보딩 관심사 PUT 동시 유니크 500** — 관리 경로와 달리 잠금·흡수 없음 | `onboarding.orchestrator.ts:110-128` | 관리 경로(`user-interest.service`)의 유니크 흡수 패턴 재사용  **수정** — `replaceOnboardingSelection`이 관리 경로와 같이 사용자 행 `FOR UPDATE`로 동시 저장을 직렬화한다(트랜잭션 안에서만) |
| 3 | **소프트 삭제/해제/재담기 read-then-write 경합** — 동시 요청 시 `user_signals` 중복 적재 | `library.service.ts:139-183`, `library-screen.orchestrator.ts:186-217` | `WHERE deleted_at IS NULL` 조건부 UPDATE + affected 판정으로 한쪽만 신호 적재  **수정** — `softDeleteById`·`restoreById`·`reactivateById`를 `deleted_at` 조건부 UPDATE + affected 판정으로. 삭제·해제·재담기 모두 이번 요청이 바꾼 경우에만 제외·신호를 적재한다 |
| 4 | **`purgeStorage` 감사 로그 커밋 후 파일 삭제 — 실패해도 "purged"로 기록** | `admin-content.service.ts:694-725` | 삭제 결과를 후속 감사 행으로(성공/실패) 기록  **수정** — `storage.remove`가 실패 키를 돌려주고, `purgeStorage`가 결과(`purged`/`partially_failed`, `failed_keys`)를 같은 action의 후속 감사 행으로 남긴다 |
| 5 | **관리자 업로드 POST 멱등키 없음** — 더블클릭 = 중복 발행 | `admin.controller.ts` 4.6 라우트 | admin-api 계약 확인 후 `Idempotency-Key` 적용(콘솔 버튼 비활성만으로는 부족)  **보류(기록)** — `admin-api.md`에 `Idempotency-Key` 정의가 없다. 필수화하면 pipeline 워커의 업로드 호출이 깨지므로 계약 개정(changes) + pipeline 동반 수정이 선행이다. 콘솔 더블클릭은 버튼 비활성으로 막고 있음 |
| 6 | **검색 WHERE의 OR 안 topic EXISTS가 trgm BitmapOr를 막을 가능성** (추측 — 실행계획 실측 필요) | `content.repository.ts:467-469` | `EXPLAIN ANALYZE` 실측 → 느리면 topics 선매칭 후 `content_topics IN` 치환  **실측 보류(기록)** — 로컬 DB는 콘텐츠 33행이라 실행계획이 seq scan으로만 나와 판단 불가. 운영 데이터가 수백 건 쌓인 뒤 `EXPLAIN ANALYZE` 재실측 |
| 7 | **`/health`가 DB 미확인** | `health` 모듈 | 단일 인스턴스라 실익 작음. 배포 헬스 판정에 DB 연결을 포함할지 결정  **수정(결정: DB 포함)** — `/health`가 `SELECT 1`(2초 상한)을 보고 못 붙으면 503 + `status: 'degraded'`. 배포 헬스 확인·모니터링이 DB 단절을 정상으로 읽지 않게 한다 |
| 8 | **`data-source.ts`가 import 시 `validateEnv` 실행** — 스크립트 재사용성 저해 | `data-source.ts:36` | 지연 검증 또는 CLI 전용 진입점 분리  **현행 유지(기록)** — TypeORM CLI가 `DataSource` 인스턴스 export를 요구해 import 시 검증이 불가피하다. 스크립트(`seed-mock-onboarding.ts`)는 이미 `buildDataSourceOptions`를 직접 써서 문제 없음 |
| 9 | **낡은 주석** — `user-withdrawal.service.ts:220-225` "아직 테이블 없음" 목록이 현행 스키마와 불일치 | | 주석 현행화  **수정** — 주석을 현행 스키마로(`user_settings`·`user_preference_vectors`·`source_link_clicks`는 CASCADE 대상, 미생성은 `purchase_intents`·`notification_logs`뿐) |
| 10 | **인덱스 방향 표기**(문서 DESC vs 코드 ASC) — 기능 동일 | | 표기 통일(문서 또는 코드)  **문서 통일** — `domain.md` 1.1에 "`DESC` 표기는 조회 의도, 실제 인덱스는 ASC(양방향 스캔 동일)"를 명시. 코드 변경 없음 |
| 11 | **관심사 요약의 topics 중복 조회** — 요청당 1쿼리 낭비 | `user-interest.service.ts:74-97` | 한 번 조회로 합침  **수정** — `findActiveWithTopics`로 노출 판정과 이름 붙이기가 topics를 한 번만 읽는다 |
| 12 | **탐색/검색 keyset 정렬 키(전체 play_count)가 04시 배치로 변동** — 스크롤 중 경계 통과 시 중복·누락 | | 인지 기록. 커서에 스냅샷 시각을 넣을지는 발생 빈도 실측 후  **인지 기록** — 발생 조건(04시 경계 통과 중 스크롤)이 드물고 결과가 중복·누락 1~2건이라 현재는 손대지 않는다. 사용자 신고나 실측이 생기면 커서에 스냅샷 시각을 넣는다 |

## 완료 조건

- Given 각 행 / When 처리한다 / Then 이 표에 처리 결과(수정/계약 명시/실측 결과)가 기록되고, 12행 전부 처리되면 archive로 옮긴다

## 처리 기록 (반영 날짜: 2026-09-09)

12행 전부 위 표 "처리 결과" 열에 기록했다 — 수정 7건(#1·#2·#3·#4·#7·#9·#11), 문서 통일 1건(#10),
보류·현행 유지·인지 기록 4건(#5·#6·#8·#12). 보류 2건은 선행 조건(계약 개정·운영 데이터)이 생기면 별도 티켓으로 다시 연다.
