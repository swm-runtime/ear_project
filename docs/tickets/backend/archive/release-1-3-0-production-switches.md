# [BE] 1.3.0 출시 후 운영 전환 — 최소 지원 버전 1.3.0 · 시리즈·자동 확장·시장 전환·글로벌 스위치 켜기

| 항목 | 값 |
|---|---|
| 대상 | 운영 `.env.prod` · Secrets Manager `ear/prod/api` — `MIN_SUPPORTED_APP_VERSION_IOS`·`_ANDROID` · `SERIES_EXPLORE_CARDS_ENABLED` · `AUTO_EXPAND_ENABLED` · `MARKET_CHANGE_ENABLED` · `GLOBAL_SIGNUP_ENABLED` · `DRIP_TIMEZONE_GROUPS_ENABLED` |
| 요청 파트 | 백엔드 |
| 요청자 | 박준현(테크리드) — 이번 주 할 일(2026-10-19) |
| 담당 | 박준현 |
| Jira | [KAN-229](https://runtime364.atlassian.net/browse/KAN-229) · 관련 [KAN-193](https://runtime364.atlassian.net/browse/KAN-193) · [KAN-134](https://runtime364.atlassian.net/browse/KAN-134) |
| 발행 날짜 | 2026-10-19 |
| 시작 날짜 | 2026-10-19 |
| 기한 | 2026-10-23 (Low — 이번 주 금요일. 스토어 심사 결과에 따라 밀릴 수 있다 — 밀리면 사유를 처리 기록에 적는다) |
| 선행 | FE [KAN-198](https://runtime364.atlassian.net/browse/KAN-198) 1.3.0 두 OS 심사 통과·공개(Jira blocks) · AI [KAN-204](https://runtime364.atlassian.net/browse/KAN-204) GLOBAL 콘텐츠 운영 발행(글로벌 스위치만 — Jira blocks) · 사람 손: dev → main 운영 릴리스 #1688 머지·배포(대기) · 운영 GLOBAL 주제 노출(대기 — 글로벌 스위치만) |
| 근거 문서 | KAN-198 댓글(2026-10-17·18 출시 순서) · `docs/infra/runbook.md`(스위치·강제 업데이트 절) · `spec/api/global-api.md` 4.11 · `features/drip-scheduling.md` 4.5 |
| 중요도 | Low |
| 상태 | **완료**(2026-10-27) — 3·4·5번 실행(10-24·25)과 완료 조건 확인 끝 |
| 반영 날짜 | 2026-10-27 |

## 왜

1.3.0은 1.2.x가 모르는 응답(탐색 `type: "series"`)과 화면(자동 추가됨 배지·시장 전환)을 함께 싣는다. 서버 스위치를 켜는 순간 **모든 앱 사용자에게** 한 번에 걸리므로, 옛 앱이 사라진 뒤(최소 지원 버전 1.3.0)에만 켤 수 있다. 순서가 바뀌면 다음 문제가 생긴다.

- 최소 지원 버전을 공개보다 먼저 올리면: 강제 업데이트 화면이 갈 스토어 버전이 없다.
- 스위치를 최소 지원 버전보다 먼저 켜면: 1.2.x 탐색에 모르는 카드가 섞이고, 관심사 화면이 "4/3 선택"이 돼 [저장]이 막힌다.

운영 스위치 상태(2026-10-19 실측)는 다섯 개가 전부 꺼져 있고(키 없음·빈 값), 최소 지원 버전은 `1.0.0`이다.

## 무엇을 한다 (순서대로)

1. **(선행)** #1688 dev → main이 머지·배포돼 있다. 스위치는 꺼진 채다.
2. **(선행)** 1.3.0이 iOS·Android 둘 다 공개돼 있다.
3. **최소 지원 버전**: `MIN_SUPPORTED_APP_VERSION_IOS`·`_ANDROID` = `1.3.0`.
4. **스위치**(3번 뒤, 같은 날이어도 된다)
   - `SERIES_EXPLORE_CARDS_ENABLED=true` — 탐색 시리즈 카드(KAN-134 2단계). FE KAN-225는 1.3.0에 포함돼 있다(#1740).
   - `AUTO_EXPAND_ENABLED=true` — 주제 자동 확장. 다음 05:00 배치부터 적용된다. 켠 뒤에는 FE 티켓 `auto-expand-interest-ui.md`의 마지막 완료 조건(운영 앱 실측)을 확인한다.
   - `MARKET_CHANGE_ENABLED=true` — 가입 뒤 시장 전환(KAN-227). FE KAN-228은 1.3.0에 포함돼 있다. KAN-193에 있던 항목을 이 티켓으로 옮겼다.
5. **글로벌 스위치**(KAN-204·운영 GLOBAL 주제 노출 뒤 — 3·4번과 날짜가 달라도 된다)
   - `GLOBAL_SIGNUP_ENABLED=true`
   - `DRIP_TIMEZONE_GROUPS_ENABLED=true`

**바꾸는 법**(runbook)
- `.env.prod`와 Secrets Manager `ear/prod/api`를 **둘 다** 고친다. `push.sh`가 배포 때 SM 값으로 env를 다시 쓰므로, `.env.prod`만 고치면 다음 배포 때 꺼진다.
- `API_IMAGE=$(cat .api-image)`를 붙여 api를 재생성한다. 이것을 빼면 옛 로컬 이미지로 조용히 바뀐다.
- 컨테이너 env와 `Config.Image`를 확인한다.

## 범위 밖

- 스토어 심사·공개 자체(FE KAN-198)
- GLOBAL 콘텐츠 발행(AI KAN-204)
- 스위치를 걷어내는 코드 정리(자리 잡은 뒤 별도 PR)

## 완료 조건

- Given 1.3.0 공개 / When 3번 / Then 1.2.x 앱 콜드 스타트의 `GET /app/version`이 426 `APP_UPDATE_REQUIRED`, 1.3.0은 200
- Given 4번 / Then
  - 탐색 응답에 `type: "series"` 카드가 있다
  - 다음 날 05:00 배치 뒤 `user_interests.source = 'auto_expand'` 행이 생긴다(대상이 있으면)
  - 운영 api 컨테이너 env에 `MARKET_CHANGE_ENABLED=true`가 있다(`docker exec ear-prod-api-1 printenv MARKET_CHANGE_ENABLED`). KR 계정의 KR→GLOBAL 미리보기(`?preferred_language=en`)는 5번 전까지 **계속 `market_unavailable`이다(정상)** — GLOBAL로의 전환은 `GLOBAL_SIGNUP_ENABLED`와 GLOBAL 노출 주제도 요구한다(`UserMarketChangeService.isTargetOpen` · `global-api.md` 4.11 "막는 조건")
- Given KAN-204 완료 · 운영 GLOBAL 주제 노출 / When 5번 / Then
  - A21에서 **English를 고른** 신규 가입이 `market: global`이다(시장은 요청 `locale.preferred_language`로 정한다 — 기기 언어는 A21의 기본 선택값일 뿐이다, `global-api.md` 2.1)
  - KR 계정의 미리보기 `GET /users/me/market-change/preview?preferred_language=en`이 `market_unavailable` 외의 응답(`available: true` 또는 `cooldown`)을 준다
  - GLOBAL 계정이 그룹 배치로 편성된다(`drip_batch_runs`에 europe·americas 행 · 로그 `drip batch finished`의 `group` — runbook 4장 드립 시간대 그룹 스위치)
- 각 단계의 실행 날짜·확인 결과가 처리 기록에 있다

## 처리 기록

- 2026-10-19 발행(마크다운 + Jira KAN-229 — 시작 날짜·기한·blocks 링크 KAN-198·KAN-204, relates KAN-193·KAN-134). 운영 스위치 5개 꺼짐·최소 지원 `1.0.0` 실측.
- 2026-10-20 완료 조건 정정(i18n 검증) — 4번의 "미리보기가 `market_unavailable` 외의 응답"은 4번만으로는 만족할 수 없었다(`isTargetOpen`이 GLOBAL 대상에 `GLOBAL_SIGNUP_ENABLED`를 요구 — 운영에 GLOBAL 계정이 없어 KR→GLOBAL만 시험할 수 있다). 4번은 컨테이너 env 확인으로, 미리보기 확인은 5번으로 옮겼다. 5번의 "영어 기기 가입"은 A21 English 선택(`preferred_language`)으로 바로잡았다. runbook 4장에 `MARKET_CHANGE_ENABLED`·`DRIP_TIMEZONE_GROUPS_ENABLED` 절을 더했다(브랜치 `docs(be)/i18n-runbook-tickets`).
- 2026-10-24 16:34 KST **`GLOBAL_SIGNUP_ENABLED=true` 먼저 켬**(1.3.0 심사 제출 전 — 영어 스토어 설명과 심사관 English 가입 결과를 맞추려고). 근거: 최근 14일 운영 가입 1,226건 전부 `language_code` 없음 — 1.2.x 는 locale 을 보내지 않아 기본값 `kr`로 가입한다(켜도 1.2.x 는 전원 KR). `.env.prod`만 수정(SM `ear/prod/api`에 이 키 없음 — 배포 뒤 유지), 백업 `.env.prod.bak-20261024-global`, `API_IMAGE` 고정 재생성(`d248bbe0`), 헬스 200.
- 2026-10-24 **`MARKET_CHANGE_ENABLED=true` 먼저 켬**(심사 메모에 "설정 > 콘텐츠 언어에서 바꿀 수 있다"를 넣어 심사관이 눌렀을 때 동작해야 해서). 1.2.x 에는 전환 화면이 없어 영향 없음. `.env.prod`만, 백업 `.env.prod.bak-20261024-market`, `d248bbe0` 고정 재생성, 헬스 200·ERROR 0.
- 2026-10-25 19:13 KST **3·4·5번 실행** — 두 스토어 1.3.0 공개(10-24 저녁) 뒤 운영 `.env.prod`를 한 번에 바꿈: `MIN_SUPPORTED_APP_VERSION_IOS/ANDROID=1.3.0` · `LATEST_APP_VERSION_IOS/ANDROID=1.3.0` · `SERIES_EXPLORE_CARDS_ENABLED` · `AUTO_EXPAND_ENABLED` · `DRIP_TIMEZONE_GROUPS_ENABLED`=true. SM 에 키 없음, 백업 `.env.prod.bak-20261025-release`, `d248bbe0` 고정 재생성, 헬스 200.
- 2026-10-27 **완료 조건 확인 → 완료.**
  - 강제 업데이트 ✅(10-25): `/app/version` 1.2.1·1.2.0(iOS·Android) → 426 `APP_UPDATE_REQUIRED`, 1.3.0 → 200. 재시작 뒤 1분 실제 426 5건, ERROR 0.
  - 탐색 시리즈 카드 ✅(10-27): 운영 앱에서 탐색 `type: "series"` 카드 확인(박준현 직접).
  - 자동 확장 ✅: 10-26 이후 운영 로그 `auto expanded` 5건.
  - 시장 전환 스위치 ✅(10-24). KR→GLOBAL 미리보기: 운영 로그에 KR→GLOBAL 전환(되돌리기) 성공 2건(10-26 · 10-27) — 전환은 미리보기와 같은 "옮겨 갈 시장이 열려 있는가"(`isTargetAvailable`) 판정을 통과해야 하므로 `market_unavailable`이 아니다.
  - English 가입 → `global` ✅: 10-24 이후 가입 시장 판정(`source: preferred`) 로그에 `global` 5건 · `kr` 35건(같은 시각 요청 로그가 섞여 정확한 가입자 수는 아니다).
  - 그룹 배치 ✅: 운영 `drip batch finished`가 10-26부터 asia 05:00 · europe 14:00 · americas 19:00 매일.
  - 참고: 운영 시장 전환 6건 — GLOBAL→KR 4건(그중 2건은 몇 분 안에 되돌림). 동남아 그룹(#2071)은 이 티켓 밖 — 릴리스 #2081.
