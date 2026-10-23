# [FE] 관심사 자동 확장 UI — 자동 추가 주제 빗금 구분 · N/3에서 자동 슬롯 제외 · 자동 확장 토글(설정)

> **결정 변경(2026-10-14, PM 이주호)**: ① 현 관심사 화면은 칩이 아니라 **물리 버블밭**이라, "자동 추가됨"을 텍스트 배지 대신 버블 사진 위 **애플식 빗금 오버레이**("창문 블라인드")로 구분한다(버블은 링·체크 배지를 쓰지 않는 결 — PM 2026-10-09). ② **토글은 설정 화면에 둔다**(버블밭은 토글 자리가 애매) — 요청 3의 "관심사 화면에만" 2026-10-13 결정을 뒤집는다. 아래 요청 0·1·3은 이 결정으로 읽는다.

| 항목 | 값 |
|---|---|
| 대상 | `frontend/src/features/interest/` (`screens/InterestManagementScreen.tsx` · `hooks/useInterestManagementScreen.ts` · `services/interest-edit.ts` · `interest.copy.ts`) · (주석만) `frontend/src/features/settings/screens/SettingsScreen.tsx` |
| 요청 파트 | 프론트엔드 |
| 발행 날짜 | 2026-10-13 |
| 시작 날짜 | 2026-10-13 |
| 기한 | 2026-10-16 |
| 선행 | 없음(티켓 선행 없음). 티켓이 아닌 선행 — `spec/uiux/interest-management-uiux.md` 개정(아래 요청 0, FE 소유 문서, 미착수) |
| 발견 시점 | 2026-10-13 추천 시스템 검증 뒤 운영 자동 확장(`AUTO_EXPAND_ENABLED`)을 켜려고 FE 준비 상태를 확인하던 중 |
| 근거 문서 | `features/interest-management.md` 4.1·4.3·5장 · `features/drip-scheduling.md` 4.5-1 · `spec/api/interest-management-api.md` 4.2(`source`)·저장 상한 판정 · `spec/api/settings-api.md`(`is_auto_expand_enabled`) |
| 심각도 | **중** — 지금은 증상 없음(운영 스위치 꺼짐). 이 티켓이 끝나야 운영에서 자동 확장을 켤 수 있다 |
| 우선순위 | Medium(3일 안) |
| Jira | [KAN-181](https://runtime364.atlassian.net/browse/KAN-181) |
| 상태 | 진행 중 — 코드 dev 머지(#1499)·운영 반영(#1509, 2026-10-14). 남은 것: 운영 `AUTO_EXPAND_ENABLED` 켠 뒤 운영 앱 실측(마지막 완료 조건) |

## 현황 (2026-10-13 확인 — `origin/dev`·`origin/main` 동일)

서버는 행동 기반 자동 확장(`drip-scheduling.md` 4.5-1)을 2026-09-30에 구현했고, 운영은 "앱이 배지·`N/3` 집계·토글을 내보낸 뒤 켠다"(같은 절 마지막 항목)는 조건으로 스위치를 꺼 두었다. FE에는 **응답 필드를 받는 코드만 있고 화면이 없다.**

| 요구 | FE 상태 |
|---|---|
| `source`(`onboarding`·`manual`·`auto_expand`) 수신 | 있음 — `interest.types.ts:26`. 주석(24행)이 "P1이라 MVP 화면은 이 값을 읽지 않는다" |
| "자동 추가됨" 배지 | 없음 — `InterestManagementScreen`이 `source`를 읽지 않는다 |
| `N/3`에서 자동 슬롯 제외 | 없음 — `useInterestManagementScreen.ts:86` `selectedCount = effectiveSelected.length`가 자동 슬롯까지 센다. 상한 판정(`:91`, `interest-edit.ts:43`)도 같다 |
| 자동 확장 토글 | 없음 — `SettingsScreen.tsx:168` "P1 미구현이라 항목을 그리지 않는다". DTO(`settings.dto.ts:54·87` `is_auto_expand_enabled`)는 있다 |

**지금 서버 스위치를 켜면** 자동 슬롯이 붙은 사용자는 아무 조작 없이 관심사 화면에 "4/3 선택"을 보고, 저장 게이트가 막혀 다른 주제를 바꾸지 못한다(서버는 자동 슬롯을 빼고 세므로 허용하는 저장을 앱이 막는다).

## 요청 내용

0. **문서 개정** — ① `spec/uiux/interest-management-uiux.md` 15·37행과 4.8, 278행 미결이 종전 규칙("P1·MVP 미노출·자동 추가분도 3개 상한 포함")이었다. `features/interest-management.md` 2026-09-30 개정 + 2026-10-14 결정에 맞춰 빗금 구분·`N/3` 제외·토글(설정)로 확정한다. ② `features/settings.md`·`spec/api/settings-api.md`에 자동 확장 토글을 **설정 화면 소유**로 명시한다(2026-10-14 결정 — 토글이 설정에 남는다). `interest-management.md`·`interest-management-api.md`의 토글 위치·P1 잔재도 정리한다. API(`is_auto_expand_enabled` PATCH)는 그대로다.
1. **자동 추가 주제 빗금 구분** — `source = auto_expand`인 주제 버블 사진 위에 애플식 빗금("창문 블라인드") 오버레이를 덮고, 낭독기에 "자동 추가됨"을 붙인다. 선택 상태로 보이고, 탭하면 해제된다(해제 후 저장하면 서버가 같은 주제를 다시 자동 추가하지 않는다).
2. **`N/3`과 상한 판정에서 자동 슬롯 제외** — 화면의 N, 3개 초과 사유 문구, [저장] 게이트 모두 **직접 고른 주제(`source != auto_expand`)만** 센다. 게이트식은 서버와 같은 `직접 고른 개수 ≤ max(3, 저장 전 직접 고른 개수)`다(`interest-management.md` 4.2). 자동 슬롯을 해제하면서 직접 고른 것이 4개가 되는 저장은 서버가 `INTEREST_LIMIT_EXCEEDED`로 거부하므로 화면도 같은 게이트로 막는다.
3. **자동 확장 사용 여부 설정(토글)** — 사용자가 이 기능을 쓸지 말지 정하는 설정이다. **설정 화면 콘텐츠 섹션에 둔다**(2026-10-14 PM 결정 — 종전 "관심사 화면에만" 2026-10-13 결정을 뒤집음. 관심사 화면은 버블밭이라 토글 자리가 애매하다).
   - 설정 "주제 자동 확장" 토글 행 — 토글 + 설명 "관심 주제와 가까운 주제도 자동으로 찾아드려요"(`settings.md` 4.1 · `SettingsToggleRow`에 `description` 부제 추가).
   - 값은 `GET /users/me/settings`의 `is_auto_expand_enabled`(서버 기본값 ON — 설정 화면이 이미 받는다), 변경은 즉시 저장 `PATCH /users/me/settings { is_auto_expand_enabled, client_seq }`(낙관적 UI·`client_seq` 연타 규칙은 기존 `saveSettingsField` 그대로).
   - 끄면 서버는 이 사용자에게 **넣지도 빼지도 않는다** — 이미 붙은 자동 슬롯은 유지되고 만료·교체도 멈춘다(사용자가 직접 해제해야 사라진다, `interest-management.md` 4.3). 켜면 다음 배치부터 대상이 된다.
   - 관심사(버블) 화면에는 토글을 두지 않는다 — 자동 추가 주제를 빗금으로 구분하고 `N/3`에서 뺄 뿐이다.
4. `interest.types.ts` 24행의 "P1이라 읽지 않는다" 주석과 `SettingsScreen.tsx`의 "P1 미구현" 주석을 실제 상태로 고친다.

## 완료 조건

- Given 자동 슬롯 1개와 직접 고른 주제 3개를 가진 사용자 / When 관심사 화면을 연다 / Then "3/3 선택"이 보이고 자동 슬롯 주제 버블에 빗금이 덮인다(낭독 "자동 추가됨")
- Given 같은 사용자 / When 직접 고른 주제 하나를 다른 주제로 바꿔 저장한다 / Then 저장이 막히지 않고 성공한다(자동 슬롯은 `auto_expand` 그대로 남는다)
- Given 같은 사용자 / When 자동 슬롯 주제를 해제하고 다른 주제를 하나 더 직접 고른다(직접 고른 것 4개) / Then [저장]이 비활성이고 "관심 주제는 3개까지 선택할 수 있어요"가 보인다
- Given 설정 화면 / When 자동 확장 토글을 끈다 / Then 즉시 `PATCH /users/me/settings`에 `is_auto_expand_enabled: false`가 나가고, 화면을 다시 열어도 꺼져 있다
- Given 관심사(버블) 화면 / When 연다 / Then 자동 확장 토글이 없다(설정 화면에만 있다)
- Given 위 항목이 운영 앱(스토어 빌드 또는 운영 OTA)에 나갔다 / When BE가 운영 `AUTO_EXPAND_ENABLED`를 켠다 / Then 위 동작이 운영에서 그대로 확인된다

## 처리 기록

- 2026-10-14 — 코드·문서 반영(2026-10-14 결정 반영: 빗금·토글 설정).
  - 관심사: `interest.types`·`interest.copy`(자동 낭독 라벨) · `InterestBubble`(react-native-svg 빗금 오버레이 + `isAutoExpanded` prop + 낭독 꼬리말) · `InterestBubbleField`(`BubbleTopic.isAutoExpanded`) · `useInterestManagementScreen`(`autoExpandIds` 파생 → `N`·탭 상한·`isOverLimit`·`overLimitCount`·`isBelowMin`을 직접 고른 개수로, `topics.isAutoExpanded`). diff·저장 본문은 자동 슬롯 포함 전체 그대로.
  - 설정: `SettingsToggleRow`(선택 `description` 부제 추가) · `useSettingsScreen`(`controls.isAutoExpandEnabled`·overlay·`toggleAutoExpand`) · `SettingsScreen`(콘텐츠 섹션 토글 행) · `settings.copy`(autoExpand 라벨·설명)·`settings.types`(주석).
  - 문서: uiux 4.8·§1·§2·§8·§9 / settings.md 2.1·4.1 / settings-api 4.1 / interest-management 1·4.1·5·미결 / interest-management-api 4.1·4.4·6·9 정리.
  - frontend `npm run typecheck`·eslint(변경 파일) 통과. 프론트 CI 게이트는 backend 변경에만 돌아(deploy-api 검증 잡) 이 PR엔 적용 안 됨. 커밋·PR·dev 머지는 이어서.
- 2026-10-15 상태 정정 — PR #1499 dev 머지, 릴리즈 #1509(dev → main, 2026-10-14)로 운영 반영. 앞의 5개 완료 조건은 코드로 충족. **남은 것**: BE 가 운영 `AUTO_EXPAND_ENABLED` 를 켠 뒤 운영 앱에서 빗금·N/3·토글을 실측(마지막 완료 조건) → 확인되면 archive·Jira 완료.
- 2026-10-24 **archive 로 옮김(반영 날짜 2026-10-24)** — Jira KAN-181 은 이미 완료다. 한쪽만 움직인 상태를 맞춘다. 앞의 5개 완료 조건은 코드로 충족(운영 반영 #1509). **남은 마지막 조건(BE 가 운영 `AUTO_EXPAND_ENABLED` 를 켠 뒤 운영 앱 실측 — 1.3.0 출시 순서 ④)은 KAN-198(`pending/global-build-store-submission.md`)로 이관했다.**
