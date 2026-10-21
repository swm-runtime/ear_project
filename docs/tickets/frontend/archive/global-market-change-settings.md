# [FE] 설정 › 콘텐츠 언어(시장) 전환 화면 — 미리보기·동의·토큰 교체 후 재온보딩 (1.3.0 포함)

| 항목 | 값 |
|---|---|
| 대상 | `settings`(콘텐츠 언어 항목·확인 팝업) · 동의 화면(A4 컴포넌트 재사용) · 세션 토큰 교체 · 온보딩 재진입 · A21 변경 불가 문구 · 에러 코드 ko/en |
| 요청 파트 | 프론트엔드 |
| 요청자 | 박준현(테크리드) |
| 담당 | 이주호 |
| Jira | [KAN-228](https://runtime364.atlassian.net/browse/KAN-228) · BE [KAN-227](https://runtime364.atlassian.net/browse/KAN-227) |
| 발행 날짜 | 2026-10-19 |
| 시작 날짜 | 2026-10-19 |
| 기한 | 2026-10-22 (Medium — 발행 +3일. 1.3.0 심사 제출 10-24 전) |
| 선행 | BE [KAN-227](https://runtime364.atlassian.net/browse/KAN-227) 서버 구현 — dev 머지·배포 완료(#1724). 개발계 스위치 `MARKET_CHANGE_ENABLED=true`는 #1725 머지·배포 뒤 |
| 근거 문서 | **`spec/api/global-api.md` 4.11**(미리보기·전환 계약, 바뀌는 것 표, 막는 조건) · 5장(에러 코드) · `changes/pending/global-market-change-error-codes.md` · `changes/pending/global-market-change-other-docs.md` 3번(A21 문구) |
| 중요도 | Medium |
| 상태 | 완료(2026-10-19) — 개발계 실기기 확인 |

> **1.3.0이 국제화 배포이니 시장 전환 기능도 같이 추가한다**(박준현 결정 2026-10-19 — PM 티켓 KAN-227의 "1.3.0 다음 버전"을 바꿨다). 서버는 스위치 뒤에 이미 들어가 있다.

## 왜

가입 때(A21) 고른 콘텐츠 언어가 시장(KR·GLOBAL)을 정하고, 지금은 바꿀 길이 없다. 영어 기기에서 실수로 English를 고른 한국 사용자는 GLOBAL에 갇힌다. PM 결정(2026-10-19)으로 가입 뒤 설정에서 바꿀 수 있게 한다. 규칙(하루 1회·주제 다시 고르기·이전 라이브러리 숨김·연령 재확인)은 서버가 정하고 판정한다 — 앱은 그리기만 한다.

## 무엇을 한다

1. **설정 › "콘텐츠 언어"** 항목 — 현재 시장(`account.market`)을 표시하고 다른 언어를 고르게 한다. 표시 언어(설정 › 언어)와 별개 항목이다.
2. 고르면 **`GET /users/me/market-change/preview?preferred_language=ko|en`**.
   - `available: false` → `blocked_reason`별 안내. `market_unavailable`(지금은 바꿀 수 없음) · `cooldown`(하루 1번 — `retry_after_sec`로 남은 시간을 그릴지는 FE 판단).
3. **확인 팝업** — "관심 주제를 다시 고르고, 이전 언어의 라이브러리는 숨겨져요(돌아오면 다시 보여요)" 류 안내. 이어서 **동의 화면** — `required_consents`를 A4 동의 컴포넌트로 그린다(항목 모양이 가입 재조회 `auth-api.md` 4.14와 같다. 연령 문구 숫자는 `min_age`).
4. **`POST /users/me/market-change { preferred_language, consents }`**
   - 성공: **응답 `access_token`으로 즉시 교체**(시장이 토큰 클레임이다 — 교체하지 않으면 최대 30분간 탐색이 이전 시장을 본다). 리프레시 토큰은 그대로. 응답 `user`로 세션을 갱신하고 `onboarding.steps`대로 온보딩으로 보낸다(앱은 세션 중 `GET /users/me`를 다시 읽지 않으므로 이 응답이 재진입 신호다).
   - `access_token: null` — 이미 그 시장. 아무것도 하지 않는다.
5. **에러**
   - 400 `CONSENT_REQUIRED` · 409 `CONSENT_VERSION_STALE` → **미리보기를 다시 받아** 동의 화면을 다시 그린다(가입 재조회가 아니다).
   - 409 `MARKET_UNAVAILABLE` · 429 `MARKET_CHANGE_COOLDOWN` → 안내만. 두 코드의 ko/en 문구를 추가한다(`common-error-handling.md` 9장 등재 — `changes/pending/global-market-change-error-codes.md`).
6. **재온보딩 중 되돌리기** — 주제를 다 고르기 전에 직전 시장으로 돌아가는 것은 서버가 하루 1회에서 빼 준다(한 번만 — 되돌리기를 다시 되돌리면 429). 온보딩 화면에 "이전 언어로 돌아가기" 진입을 둘지는 FE가 정한다(없으면 설정까지 가야 하는데 온보딩 중이라 설정에 갈 수 없다 — 둘 것을 권한다).
7. **재온보딩 완료 때 GA4 `onboarding_complete`를 다시 보내지 않는다** — 가입 퍼널이 두 번 센다. 서버는 `onboarding_completed_at`을 처음 값으로 유지한다.
8. **A21 "가입한 뒤에는 바꿀 수 없어요"** 문구를 바꾼다(예: "설정에서 바꿀 수 있어요" — 확정 카피는 FE, `auth-uiux.md` 4.2-1).

## 범위 밖

- 서버 규칙(하루 1회·동의·주제 비활성·첫 드립 재실행) — 서버가 한다.
- 운영 스위치 — 1.3.0 출시 뒤 BE가 켠다.

## 완료 조건

- Given KR 계정 / When 설정 › 콘텐츠 언어 English / Then 미리보기 → 국외 이전 포함 동의 → 전환 → 새 토큰으로 GLOBAL 주제 온보딩 화면이 나온다
- Given 전환 직후 / When 탐색·라이브러리 / Then 새 시장 콘텐츠만 보인다(토큰 교체 확인)
- Given 같은 날 두 번째 전환 / Then 하루 1번 안내가 뜨고 전환되지 않는다
- Given 재온보딩 중 / When 직전 언어로 되돌리기 / Then 원래 시장의 주제 단계로 간다
- Given A21 / Then 변경 불가 문구가 바뀌어 있다(ko/en)

## 처리 기록

- 2026-10-19 발행(마크다운 + Jira KAN-228, KAN-227 → KAN-228 blocks 링크).
- 2026-10-19 **코드 반영**(PR `feat(fe)/market-change-settings`). 무엇을 한다 1~8 전부.
  - **진입**: 설정 › **콘텐츠 언어** 섹션(언어 섹션 바로 아래, 한국어 / English 체크 목록 — 체크는 세션 `user.market`). 다른 언어를 누르면 전환 화면(`MarketChange` — auth 소유, MainStack·OnboardingStack 두 곳 등록).
  - **FE 결정 ① 확인 팝업과 동의 화면을 한 화면으로**: 제목 "콘텐츠 언어를 {언어}로 바꿀까요?" + 바뀌는 것 네 줄 + 새 시장 필수 동의(A20과 같은 `ConsentItem`, 연령 숫자는 `min_age`, [보기]는 새 시장 문서) + [바꾸기]. 같은 결정을 두 번 묻지 않는다.
  - **막힘**: 미리보기 `available: false` 또는 POST 409·429면 동의 대신 안내 + [닫기]. **FE 결정 ② 쿨다운 남은 시간을 그린다** — `retry_after_sec`를 시간 단위로 올려 "약 N시간 뒤에"(1시간 이하 "잠시 뒤에").
  - **성공**: `sessionService.switchMarket` — 응답 access token 으로 즉시 교체(refresh 그대로) + 세션 사용자를 응답 `user`로 → `onboardingCompleted: false`라 관문이 온보딩으로. app/bootstrap 리스너가 쿼리 캐시를 통째로 비우고 온보딩 로컬 상태를 초기화한다. `access_token: null`이면 아무것도 안 하고 돌아간다.
  - **동의 400·409**: 토스트 + **미리보기 다시 받기**(가입 재조회 아님) + 체크 초기화.
  - **FE 결정 ③ 재온보딩 되돌리기를 둔다**: 주제 화면 왼쪽 위 뒤로 버튼(낭독 "{언어} 콘텐츠로 되돌리기") → 같은 전환 화면(직전 언어). 한 번만 — 되돌린 뒤엔 버튼 없음(되돌리기를 다시 되돌리면 429). 루트가 시장을 온보딩 스택의 `navigationKey`로 써서 되돌린 뒤 새 시장 재개 지점으로 다시 세운다. 재온보딩 표시는 기기에 저장(`auth.market_change_reonboarding` — 앱을 다시 켜도 유지, 온보딩 종료·로그아웃 때 지움).
  - **GA4**: 재온보딩 완료는 `onboarding_complete`를 보내지 않고 사용자 속성(topic_count)만 갱신한다. 다른 기기에서 이어 끝내면 그 기기는 표시가 없어 한 번 더 보낼 수 있다(드문 경로).
  - **A21 문구**: "나중에 설정에서 바꿀 수 있어요" / "You can change this later in Settings."(`auth-uiux.md` 4.2-1). 설정 › 언어 설명에서 "가입 때 고른"을 뺐다.
  - **에러 코드**: `MARKET_UNAVAILABLE`·`MARKET_CHANGE_COOLDOWN` — `ERROR_CODES`·영어표. `common-error-handling.md` 9장 등재는 `changes/pending/global-market-change-error-codes.md` 그대로.
  - 문서: `settings-uiux.md` 3장 "콘텐츠 언어" 행 신설 · `auth-uiux.md` 4.2-1.
  - 검증: tsc · eslint 통과, jest 전체 통과(`useMarketChangeScreen.test.tsx` 7 · `session.service.test.ts` switchMarket 1 추가, 한국어 카피 스냅숏은 추가·A21 문구·언어 설명만 변경).
  - **주의(운영)**: 운영 스위치 `MARKET_CHANGE_ENABLED`가 꺼져 있는 동안 이 OTA가 운영에 닿으면 설정 › 콘텐츠 언어가 늘 "지금은 이 언어로 바꿀 수 없어요"를 보이고, A21 "나중에 설정에서 바꿀 수 있어요"가 사실과 다르다. 운영 반영(dev→main)과 스위치 켜기를 같은 날에 하거나, 스위치를 먼저 켠다.
  - **남은 것**: 개발계 실기기 — 완료 조건 5개.
- 2026-10-19 **완료 — archive**(반영 날짜 2026-10-19). 개발계 실기기(PM, iPhone · OTA `01a15334` 이후). 개발계 GLOBAL 노출 주제가 0개라 KR→English가 `market_unavailable`로 막혀서(서버 판정 정상) 테스트 동안만 GLOBAL 주제 8개를 노출로 열었다가 끝나고 되돌렸다(BE 데이터 — 원상 복구 확인 `global 0/8`).
  - 조건 1 ✅ KR 계정 › 콘텐츠 언어 English → 국외 이전·연령 포함 동의 → 전환 → GLOBAL 주제 온보딩.
  - 조건 2 — 전환 뒤 새 시장 콘텐츠만: 실기기에서 따로 보지 않았다. 토큰 교체는 `session.service.test.ts`(switchMarket), 캐시 비우기는 bootstrap 리스너로 코드 확인. 개발계 GLOBAL 콘텐츠가 거의 없어 화면으로 가르기 어렵다 — PM 완료 판단.
  - 조건 3 ✅ GLOBAL 재온보딩을 끝낸 계정이 같은 날 다시 바꾸려 하자 "콘텐츠 언어는 하루에 한 번 바꿀 수 있어요 · 약 12시간 뒤"(서버 429 판정 — 되돌리기 예외는 재온보딩 완료 전만).
  - 조건 4 ✅ 재온보딩 주제 화면 `<` → 한국어 전환 화면 → 동의 → [바꾸기] → 한국어 주제 화면(1/2), 되돌린 뒤 `<` 없음. 서버 이력 `is_revert = true` 확인. 화면 테스트 `TopicSelectScreen.test.tsx`(#1733).
  - 조건 5 ✅ A21 "나중에 설정에서 바꿀 수 있어요".
  - **PM 결정(2026-10-19 "그대로 두자")**: 되돌리기 화면의 `<`는 닫기(주제 화면으로)다. "두 번 뒤로 → 설정"(전환 취소)은 서버가 되돌리기 때 이전 주제·온보딩 완료를 복구해야 해서 하지 않는다 — 되돌린 뒤엔 주제를 다시 고른다.
  - 같이 고친 것: GLOBAL 전환 뒤 프로필 관심 주제 원형 사진이 기본 사진 → 이름 표에 GLOBAL 영어 이름 8개(#1733).
  - **운영**: 스위치 `MARKET_CHANGE_ENABLED`를 켜는 날과 이 코드의 dev→main 반영을 맞춘다(KAN-193).
