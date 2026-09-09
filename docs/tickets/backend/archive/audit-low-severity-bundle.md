# [BE] 전수 감사 하 등급 묶음 — 경합성 잠재 건·소규모 개선 (한 PR에서 처리)

| 항목 | 값 |
|---|---|
| 대상 | 아래 표 |
| 요청 파트 | 백엔드 |
| 발행 날짜 | 2026-09-09 |
| 발견 시점 | 백엔드 전수 감사 (2026-09-09) — 심각도 하로 분류된 것 중 코드 한두 줄이 아닌 것들 |
| 근거 문서 | 각 행 |
| 심각도 | **하** |
| 상태 | 대기 — 이번 주 안(Low) |

코드 한두 줄짜리 6건(graceful shutdown·Slack 타임아웃·lint 경고·회수 커서 tie-break·first_drip 파기·DB 풀 명시)은
감사 직후 PR에서 처리했다. 여기 남긴 것은 **동시성 잠재 건**이거나 계약 확인이 필요한 것들이다.

| # | 항목 | 근거 | 권장 조치 |
|---|---|---|---|
| 1 | **탈퇴 멱등키 자기 파기 충돌** — 탈퇴가 자기 `owner_key` 행을 지워 같은 키 재시도가 저장 응답 대신 404 | `user-withdrawal.service.ts:227-230`, domain.md 1.4 | 현재 요청의 키만 파기에서 제외하거나, 계약(auth-api 4.7)에 "재시도는 404 = 이미 탈퇴됨"을 명시 |
| 2 | **온보딩 관심사 PUT 동시 유니크 500** — 관리 경로와 달리 잠금·흡수 없음 | `onboarding.orchestrator.ts:110-128` | 관리 경로(`user-interest.service`)의 유니크 흡수 패턴 재사용 |
| 3 | **소프트 삭제/해제/재담기 read-then-write 경합** — 동시 요청 시 `user_signals` 중복 적재 | `library.service.ts:139-183`, `library-screen.orchestrator.ts:186-217` | `WHERE deleted_at IS NULL` 조건부 UPDATE + affected 판정으로 한쪽만 신호 적재 |
| 4 | **`purgeStorage` 감사 로그 커밋 후 파일 삭제 — 실패해도 "purged"로 기록** | `admin-content.service.ts:694-725` | 삭제 결과를 후속 감사 행으로(성공/실패) 기록 |
| 5 | **관리자 업로드 POST 멱등키 없음** — 더블클릭 = 중복 발행 | `admin.controller.ts` 4.6 라우트 | admin-api 계약 확인 후 `Idempotency-Key` 적용(콘솔 버튼 비활성만으로는 부족) |
| 6 | **검색 WHERE의 OR 안 topic EXISTS가 trgm BitmapOr를 막을 가능성** (추측 — 실행계획 실측 필요) | `content.repository.ts:467-469` | `EXPLAIN ANALYZE` 실측 → 느리면 topics 선매칭 후 `content_topics IN` 치환 |
| 7 | **`/health`가 DB 미확인** | `health` 모듈 | 단일 인스턴스라 실익 작음. 배포 헬스 판정에 DB 연결을 포함할지 결정 |
| 8 | **`data-source.ts`가 import 시 `validateEnv` 실행** — 스크립트 재사용성 저해 | `data-source.ts:36` | 지연 검증 또는 CLI 전용 진입점 분리 |
| 9 | **낡은 주석** — `user-withdrawal.service.ts:220-225` "아직 테이블 없음" 목록이 현행 스키마와 불일치 | | 주석 현행화 |
| 10 | **인덱스 방향 표기**(문서 DESC vs 코드 ASC) — 기능 동일 | | 표기 통일(문서 또는 코드) |
| 11 | **관심사 요약의 topics 중복 조회** — 요청당 1쿼리 낭비 | `user-interest.service.ts:74-97` | 한 번 조회로 합침 |
| 12 | **탐색/검색 keyset 정렬 키(전체 play_count)가 04시 배치로 변동** — 스크롤 중 경계 통과 시 중복·누락 | | 인지 기록. 커서에 스냅샷 시각을 넣을지는 발생 빈도 실측 후 |

## 완료 조건

- Given 각 행 / When 처리한다 / Then 이 표에 처리 결과(수정/계약 명시/실측 결과)가 기록되고, 12행 전부 처리되면 archive로 옮긴다
