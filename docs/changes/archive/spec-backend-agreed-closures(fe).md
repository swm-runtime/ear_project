# [FE] spec 백엔드 협의분 문서 확정 — 에러 코드 등재·delta 방어·경로·직군 목록 형태

| 항목 | 값 |
|---|---|
| 발행 날짜 | 2026-08-10 |
| 대상 문서 | `common-error-handling.md` 9장, `interest-management.md` 7장, `domain.md` 15.1 #10, spec 5건(`player-api`·`interest-management-api`·`career-api`·`onboarding-api`) |
| 요청 파트 | 프론트엔드 (spec 작성에서 나온 백엔드 협의 항목 — 사용자가 협의 완료 확인 2026-08-10) |
| 파급 | **enum 4종 추가는 백엔드 구현 시**(`error-code.enum.ts` — `architecture.md` 7.5 순서에서 enum만 남음) |

## 확정 내용

1. **에러 코드 4종 중앙 등재** — `INTEREST_REQUIRED` · `INTEREST_LIMIT_EXCEEDED` ·
   `INTEREST_TOPIC_UNAVAILABLE`(9.8 신설) · `CAREER_JOB_CATEGORY_UNAVAILABLE`(9.9 신설)을
   `common-error-handling.md` 9장 중앙 표에 등재. enum 반영은 백엔드 구현 시.
2. **`listened_sec_delta` 이중 적산 방어 — ① 위험 감수 + 이상치 관측.** 계약 변경 없음.
   상한 검증값은 서버 구현 재량(클램프 처리 포함).
3. **주제 목록 공용 경로 — `GET /onboarding/topics` 현행 유지.**
4. **직군 목록 저장 형태 — 서버 코드 상수로 시작**(`domain.md` 15.1 #10 해소, 스키마 변경
   없음). 관리 요구 발생 시 테이블 승격 + 제거된 값 처리 결정.
5. **숨겨진 주제의 diff·개수 판정 제외를 features에 명문화**(`interest-management.md` 7장) —
   spec의 해석을 규칙 소유자에 승격.

## 완료 조건

- Given 이 확정이 반영된다 / When `common-error-handling.md` 9.8·9.9를 읽는다 / Then 신설
  4종이 클라이언트 동작과 함께 등재되어 있고, 9.10에 enum 반영 대기가 표기되어 있다
- Given 각 spec(player·interest-management·career-api)의 미결 사항을 읽는다 / When 위 항목을
  찾는다 / Then 전부 해소 표시가 있다
- Given 백엔드가 enum을 갱신한다 / When `error-code.enum.ts`를 확인한다 / Then 신설 4종이
  9장 표와 1:1로 일치한다 (백엔드 구현 시)

---

## 처리 기록

| 항목 | 값 |
|---|---|
| 반영 날짜 | **2026-08-10** — 발행 즉시 직접 반영(협의 완료 확인에 따른 문서 확정) |
