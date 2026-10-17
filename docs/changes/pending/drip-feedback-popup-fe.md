# 추천 별점 팝업 FE 구현 반영 — uiux 카피·화면 ID, 팝업 순서, 미전송 보관

| 항목 | 값 |
|---|---|
| 대상 문서 | `spec/uiux/library-uiux.md`(또는 별도 uiux 문서) · `features/drip-feedback.md` 5장·미결 · `frontend/architecture.md` 4.4(library·profile 행)·5.4·7.2 · `frontend/design.md` §5 시트·다이얼로그 |
| 요청 파트 | 프론트엔드 — 이주호 |
| 발행 날짜 | 2026-10-17 |
| 시작 날짜 | 2026-10-17 |
| 기한 | 없음 (통합 과정에서 반영) |
| 선행 | 없음 — 코드는 KAN-224 PR에서 반영됨(`tickets/frontend/archive/drip-feedback-popup.md`) |
| 중요도 | Low |

## 배경

KAN-224(추천 별점 팝업)를 구현하면서 문서에 아직 없는 결정이 생겼다. 개발 중이라 문서를 바로 고치지 않고 여기 기록한다(루트 CLAUDE.md `changes/` 절차).

## 수정 내용

1. **확정 카피·화면 ID(uiux 개정)** — 지금 코드의 카피는 티켓의 안이다(`features/library/library.copy.ts` `dripFeedback`). uiux 문서에 화면 ID를 매기고 아래를 확정 카피로 옮긴다(또는 고친다).

   | 자리 | ko | en |
   |---|---|---|
   | 제목 | 최근 추천 어떠셨나요? | How were your recent picks? |
   | 주 동작 | 보내기 | Send |
   | 주 동작(전송 실패 뒤) | 다시 시도 | Try again |
   | 보조 동작 | 닫기 | Close |
   | 제목 줄 오른쪽 위 | 이번 주 그만 보기 | Not this week |
   | 인라인 에러 | 보내지 못했어요. 다시 시도해주세요 | Couldn't send. Please try again. |
   | 별 낭독 | 별 N개 | 1 star / N stars |
   | 별 줄 낭독 | {제목} 별점 | Rating for {title} |

   - 모양: 공용 확인 다이얼로그(`ConfirmDialog`) 위에 편 1~2개를 목록으로 — 각 행은 썸네일 48(`sm`, 연속 곡률)·제목 2줄, 그 밑 별 1~5(칸 44pt). [이번 주 그만 보기]는 버튼 줄이 아니라 제목 줄 오른쪽 위 작은 회색 글자(재생 확인 팝업 L3와 같은 자리 — design.md §5 "세 번째 선택지"). 별을 하나도 안 매기면 [보내기]는 비활성.
   - 보조 표시 `library_status`("아직 안 들음")는 그리지 않았다 — 필요하면 uiux에서 정한다.
2. **세션 내 1회 규칙**(`features/drip-feedback.md` 미결 "팝업 세션 내 1회 규칙") — FE 정의: **앱 실행(JS 프로세스) × 계정 단위로 판정 조회를 한 번만** 한다. 같은 세션에 라이브러리를 다시 열어도 조회하지 않고, 로그아웃 → 다른 계정 로그인이면 새로 묻는다. 조회 실패도 그 세션의 1회로 친다(다음 실행에 다시).
3. **팝업 순서**(`frontend/architecture.md` 4.4 profile 행 · library 행) — 조회는 라이브러리 진입 때 library가 하고, 그리기는 MainNavigator가 한다(가입 체험 안내 P11과 같은 자리). 순서 규칙은 `app/navigation/launch-dialog-gate.ts`:
   - 별점 팝업은 알림 사전 안내·권장 업데이트·푸시 재생 확인·한도 안내가 없고 **P11이 뜰 차례(active)가 아닐 때** 연다.
   - P11은 종전 조건에 더해 **별점 팝업이 떠 있지 않을 때** 연다.
   - 비대칭이라 서로 기다리다 막히지 않고, 먼저 뜬 쪽이 끝난 뒤 다른 쪽이 뜬다. P11은 `onActiveChange`로 차례 여부만 내보낸다(profile이 library를 import하지 않는다).
   - 4.4 library 행의 의존에 `auth`(계정 id — `useSessionStore`)를 적는다. 도착 배지(`useLibraryArrivalBadge`)가 이미 쓰고 있었는데 표에 빠져 있다.
4. **미전송 보관(오프라인 큐)** — SQLite 큐(architecture.md 5.4)가 아직 없어 별점·닫기·그만 보기의 미전송분을 **SecureStore에 계정별 JSON**(`STORAGE_KEYS.LIBRARY_DRIP_FEEDBACK_OUTBOX` + `.<user_id>`, 최대 10건)으로 둔다. 다음 진입(판정 조회 직전)·포그라운드 복귀에 순서대로 다시 보내고, `DRIP_FEEDBACK_NOT_RATEABLE`·형식 오류는 버리고, 망·5xx면 멈춰 남긴다. 5.4 표에 "추천 별점 — 전부 보존, 순서대로, NOT_RATEABLE 폐기"를, 7.2 표에 이 키를 추가한다. 큐가 생기면 옮긴다.
   - [보내기] 실패 구분: 망 단절·타임아웃 → 보관하고 닫음 / `DRIP_FEEDBACK_NOT_RATEABLE` → 조용히 닫음 / 그 밖(5xx 등) → 인라인 에러 + [다시 시도]. 닫기·그만 보기는 즉시 닫고, 망·5xx면 보관한다.
5. **공용 확인 다이얼로그에 `titleAccessory`** — 제목 줄 오른쪽 위 세 번째 선택지 자리. design.md §5의 "세 번째 선택지는 제목 줄 오른쪽 위" 규칙을 `ConfirmDialog`가 직접 지원한다고 적는다(재생 확인 팝업 L3는 아직 자체 구현).

## 완료 조건

- Given uiux 개정 / When 라이브러리(또는 별점) uiux 문서를 연다 / Then 별점 팝업의 화면 ID·확정 카피(ko·en)·상태(표시·전송 중·인라인 에러)가 있고 코드의 `dripFeedback` 카피와 1:1로 대조된다
- Given `features/drip-feedback.md` / When 미결 사항을 본다 / Then "팝업 세션 내 1회 규칙"이 위 2번 정의로 정리돼 있다
- Given `frontend/architecture.md` / When 4.4·5.4·7.2를 본다 / Then 팝업 순서(별점 ↔ P11 비대칭)·library의 auth 의존·별점 미전송 보관 규칙과 키가 적혀 있다

## 처리 기록

- 2026-10-17 발행(KAN-224 FE 구현 PR #1660과 함께).
