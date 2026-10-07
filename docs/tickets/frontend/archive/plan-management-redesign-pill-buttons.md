# [FE] 요금제 관리 화면 개편 + 텍스트 버튼 iOS 알약화(범위 B)

| 항목 | 값 |
|---|---|
| 대상 | `features/subscription/`(SubscriptionScreen · PlanList · PaywallPlansSection · SubscriptionLegalNotice · copy) · `features/settings/`(구독 항목 이름) · 텍스트 버튼이 있는 화면 전부(아래 표) · `shared/ui/`(공용 알약 버튼 스타일 신설) · `spec/uiux/subscription-uiux.md` · `spec/uiux/settings-uiux.md` · `frontend/design.md` |
| 요청 파트 | 프론트엔드 |
| 요청자 | 이주호(PM) |
| 담당 | 이주호 |
| Jira | [KAN-146](https://runtime364.atlassian.net/browse/KAN-146) |
| 발행 날짜 | 2026-10-06 |
| 시작 날짜 | 2026-10-06 |
| 기한 | 2026-10-09 (Medium — 3일 안) |
| 선행 | 없음(티켓). 짝 BE 티켓 KAN-147(`tickets/backend/pending/plan-display-names-free-current.md` — 이름·설명 변경, 무료 요금제 `action=current`)은 선행이 아니다 — 앱은 서버가 준 `action`·`name`을 그대로 그린다. 사람 손: 투명 배경 이어 로고 PNG(NAS `Run-Time/이어/이어_로고/이어_로고_투명_512.png` — 상태: 저장소 반입 대기) |
| 근거 문서 | `spec/uiux/subscription-uiux.md` · `frontend/design.md` §2(모서리·연속 곡률) · `spec/api/subscription-api.md`(`action`) · App Store 심사 3.1.1(구매 복원) |
| 중요도 | Medium — 1.2.0 묶음 빌드(KAN-120 결제 화면 첫 공개) 전에 들어가야 한다. JS 만이라 OTA 로도 나간다 |
| 상태 | 완료 |

## 1. 요금제 관리 화면 (PM 미리보기 확정, 2026-10-06)

바탕화면 미리보기 스크린샷 `KAN120_약관줄중앙.png`가 최종본이다.

1. **헤더** — 상단 제목 "구독 관리" 제거(뒤로가기 버튼만). 본문 맨 위에 **이어 로고 88pt(투명 PNG)** → 8pt → **"요금제 관리"**(28pt 굵게, 가운데) → 요금제 카드
2. **"현재 구독" 섹션 제거, "요금제" 섹션 제목 제거**
3. **요금제 카드** — 이름 · 가격 · 설명 한 줄 · 버튼만. **기능 줄("하루 N편 듣기 · 이어 PICK · 광고") 제거**
4. **이용 중인 카드(`action = current`)는 회색 처리** — 카드 강조 테두리 없음, 이름·가격 `#8E8E93`, 설명 `#AEAEB2`, 버튼 자리에 회색 알약 **[이용 중]**(배경 `#E5E5EA`, 글자 `#8E8E93`, 체크 없음, 누를 수 없음). 색만으로 구분하지 않는다 — "이용 중" 글자가 상태를 말한다
5. **유료 구독자 정보는 이용 중 카드 안으로** — "현재 구독" 섹션이 하던 일(다음 결제일 · 다운그레이드 예약 · [구독 해지] · 해지 예약 "N월 N일까지 이용 가능" + [구독 다시 시작] · 결제 문제 경고 + [결제 수단 확인] · 다른 스토어 구독 안내)을 이용 중 카드 안에 둔다. 카드는 회색이어도 **[구독 해지] 등 누를 수 있는 버튼은 평소 색**이다(해지 경로는 심사 대상)
6. **구매 복원** — 카드 아래 큰 링크 제거, 맨 아래 **"이용약관 · 개인정보처리방침 · 구매 복원"** 한 줄 가운데 정렬, `·` 구분(구분점은 낭독 제외). 필수 안내문(4.5)과 카드 사이 24pt. **페이월 시트도 같은 줄**
7. 화면 제목·진입점 — **설정의 "구독" 항목 이름을 "요금제 관리"로**(진입점과 화면 제목을 같게)

## 2. 텍스트 버튼 알약화 — 범위 B

**글자가 들어간 행동 버튼만** `borderRadius: theme.radius.full` + `borderCurve: 'continuous'`(iOS 연속 곡률, Android 는 원호). 입력창·카드·배너·목록 행·토스트·시트 몸체·아이콘 버튼은 둥근 사각 그대로(iOS 26 문법 — 버튼은 캡슐, 면은 둥근 사각).

**공용 알약 버튼 스타일(주·보조·파괴)을 `shared/ui`에 만들어 아래를 옮긴다** — 지금은 화면마다 따로 정의해 모양이 섞인다.

| 화면 | 파일 → 스타일 키 |
|---|---|
| 공용 확인 다이얼로그(13개 다이얼로그) | `shared/ui/ConfirmDialog.tsx` `button`·`secondaryButton`·`primaryButton`·`primaryDestructive` |
| 전체 화면 오류 | `shared/ui/FullScreenError.tsx` `retry` |
| 재생 확인 팝업 | `player/components/PlayConfirmDialog.tsx` `cancelButton`·`playButton` |
| 한도 안내 시트 | `player/components/LimitNoticeSheet.tsx` `button`·`buttonSecondary` |
| 강제 업데이트 | `app-update/screens/ForceUpdateScreen.tsx` `button` |
| 이메일 인증 | `auth/screens/EmailVerificationScreen.tsx` `primaryButton` |
| 재동의 | `auth/screens/ReconsentScreen.tsx` `submit` |
| 회원 탈퇴 | `auth/screens/WithdrawalScreen.tsx` `submit` |
| 커리어 정보 | `career/screens/CareerInfoScreen.tsx` `save` |
| 관심 주제 관리 | `interest/screens/InterestManagementScreen.tsx` `save` |
| 라이브러리 빈 화면 | `library/components/LibraryEmptyState.tsx` `action` |
| 주제 필터 시트 | `library/components/TopicFilterSheet.tsx` `resetButton`·`applyButton` |
| 콘텐츠 상세 | `content-detail/components/ContentDetailHeader.tsx` `playButton`·`secondaryButton`·`deleteButton` |
| 탐색 빈 화면 | `explore/components/ExploreEmptyState.tsx` `action` |
| 요금제 관리 | `subscription/components/PlanList.tsx` `button`·`buttonSecondary` · `subscription/screens/SubscriptionScreen.tsx` `storeButton` |
| 설정 | `settings/components/EmailRow.tsx` `action` · `settings/screens/SettingsScreen.tsx` `summaryRetry`·`updateButton` |
| 프로필 주간 그래프 | `profile/components/WeeklyChart.tsx` `retryButton` |
| 카드 안 버튼 모양 | `settings/components/PlanSummaryCard.tsx` `freeAction` · `profile/components/CareerCard.tsx` `emptyAction` |
| 이미 알약 — 연속 곡률만 추가 | `auth/screens/TermsConsentScreen.tsx` `submit` · `profile/components/ProfileHeader.tsx` `planCta` |

바꾸지 않는 것: 배경 없는 글자 링크형 버튼([건너뛰기] 등 — 모서리가 안 보인다), 입력창, 카드·타일, 배너, 목록 행, 토스트·스낵바, 시트·다이얼로그 몸체, 썸네일, 아이콘 원형 버튼, 이미 알약인 칩.

## 3. 버그 — 라이브러리 [실행 취소] 스낵바

`library/components/UndoSnackbar.tsx`의 `undoLabel`이 `theme.color.primary`(#000)인데 스낵바 배경이 `textPrimary`(#1A1A1E)라 거의 안 보인다. 플레이어 스낵바처럼 `onPrimary`로.

## 4. 문서

- `spec/uiux/subscription-uiux.md` — SB1 골격(로고·제목, 현재 구독 섹션 제거, 이용 중 카드 회색·안에 구독 정보), SB2 카드(기능 줄 제거), 4.5 링크 줄(구매 복원 포함·가운데), 4.6 페이월 링크 줄
- `spec/uiux/settings-uiux.md` — 항목 이름 "요금제 관리"
- `frontend/design.md` — 버튼 모서리 규칙을 "텍스트 버튼 = 알약(full) + 연속 곡률, 면 = 둥근 사각"으로, 공용 알약 버튼 스타일 위치
- `features/` 문서에 "구독 관리" 화면 이름이 박혀 있으면 `changes/pending/`으로 요청

## 완료 조건

- Given 무료 사용자(서버가 light 를 `current`로 줄 때) / When 요금제 관리를 연다 / Then 로고·"요금제 관리" 아래 Light 카드가 회색 처리되고 [이용 중] 회색 알약이 보이며, Daily·Pro 는 검정 알약 [구독하기]다. 현재 구독 섹션·요금제 제목·기능 줄·광고 표기가 없다
- Given 유료 구독자 / When 요금제 관리를 연다 / Then 이용 중 카드 안에 다음 결제일과 [구독 해지]가 있고 [구독 해지]는 누를 수 있다
- Given 요금제 관리·페이월 / When 맨 아래를 본다 / Then "이용약관 · 개인정보처리방침 · 구매 복원"이 가운데 한 줄이고 [구매 복원]이 동작한다
- Given 설정 / When 항목을 본다 / Then "요금제 관리"로 보인다
- Given 위 표의 버튼 / When 화면을 연다 / Then 알약 모양이고(iOS 연속 곡률) 입력창·카드는 둥근 사각 그대로다
- Given 라이브러리 삭제 후 스낵바 / When 본다 / Then [실행 취소] 글자가 읽힌다
- Given `spec/uiux/`·`design.md` / When 읽는다 / Then 위 변경이 적혀 있다

## 처리 기록

| 항목 | 값 |
|---|---|
| 반영 날짜 | 2026-10-06 |
| PR | [#1177](https://github.com/swm-runtime/ear_project/pull/1177) (`feat(fe)/plan-management-redesign` → `dev`) |
| 반영 내용 | 요금제 관리 화면 개편 · 텍스트 버튼 알약화(범위 B, 표 전부) · [실행 취소] 스낵바 글자색 · 필수 표기 문구 교체 · 문서 |

**1. 요금제 관리 화면**
- `SubscriptionScreen` — 앱바는 뒤로 버튼만, 본문 맨 위 로고 88pt → 8pt → "요금제 관리"(28pt 굵게, 가운데, `header`). "현재 구독" 섹션·"요금제" 섹션 제목·카드 아래 큰 [구매 복원] 제거
- `PlanList` — 기능 줄 제거(이름·가격·설명·버튼). 이용 중 카드(`action = current`)는 강조 테두리 없이 이름·가격 `color.textMuted`(#8E8E93) · 설명 `color.textMutedSecondary`(#AEAEB2) · 회색 알약 [이용 중](`color.fillMuted` #E5E5EA, 체크 없음, 누를 수 없음). 토큰 3개를 `shared/theme` 에 추가(값을 화면에 흩뿌리지 않는다). 카드 요약은 "{이름}, {가격}, {설명}(, 이용 중)" 한 문장으로 읽힌다
- **구독 정보는 이용 중 카드 안**(`components/CurrentSubscriptionDetail.tsx`) — 다음 결제일 · 다운그레이드 예약 · [구독 해지] · 해지 예약 + [구독 다시 시작] · 결제 문제 경고 + [결제 수단 확인] · 다른 스토어 안내 · 조회 실패 + [다시 시도]. 버튼은 평소 색(흰 알약 + 머리카락 선). **서버가 `current` 카드를 주지 않으면**(비활성 요금제·다른 스토어 구독자·요금제 조회 실패) 같은 정보를 목록 바로 아래 별도 면에 플랜명과 함께 그린다 — 해지 경로가 사라지지 않는다. 무료 이용자는 따로 그릴 것이 없다(카드 설명이 한도를 말한다)
- `SubscriptionLegalNotice` — 맨 아래 "이용약관 · 개인정보처리방침 · 구매 복원" 가운데 한 줄(`·` 낭독 제외, 좁으면 줄바꿈해도 가운데), 카드와 24pt. **페이월(`PaywallPlansSection`)도 같은 컴포넌트**라 같은 줄
- **필수 표기 문구 교체(PM 확정 2026-10-06, 작업 중 추가 지시)** — 세 줄 → 새 세 줄. iOS "결제는 구매 확인 시 App Store 결제로 청구되며, 구독은 매월 자동 갱신돼요." / "기간 종료 24시간 전까지 해지하지 않으면 종료 전 24시간 안에 같은 금액이 다시 청구돼요." / "해지는 기기의 설정 › Apple 계정 › 구독에서 할 수 있어요." · Android "결제는 구매 확인 시 Google Play 결제로 청구되며, 구독은 매월 자동 갱신돼요." / "다음 결제일 전까지 해지하지 않으면 같은 금액이 다시 청구돼요." / "해지는 Google Play 스토어 › 결제 및 정기 결제에서 할 수 있어요." App Store 3.1.2(구매 확인 시 청구·자동 갱신·24시간·해지 방법) + 전자상거래법 자동갱신 고지 항목 유지, 가격·기간은 카드. **"·" 글머리 + 내어쓰기**(글머리 고정 폭 칸, 글은 남은 폭 — 둘째 줄이 글 시작에 맞음, 글머리 낭독 제외). 중간에 받은 2줄 안은 이 3줄 안으로 대체됐다. "Apple 계정으로 청구"·"Google Play 계정으로 청구" 문구는 앱 코드에 이 컴포넌트 말고 없었다(문서 `subscription-uiux.md` 4.5 만 — 함께 고침)
- 로고 — `frontend/assets/logo-transparent.png`(512×512 RGBA). 저장소의 `assets/logo.png`(흰 바탕 검정 선)에서 **알파 = 1 − 밝기**(바탕 252 이상 → 0, 검정 → 255, 안티앨리어싱 유지, 색은 순검정)로 뽑은 임시본 — 네 모서리 알파 0 확인. **NAS 공식 투명 파일(`이어_로고_투명_512.png`)이 반입되면 같은 이름으로 바꿔 끼운다**(코드 수정 없음)
- 이름은 서버 값 그대로(티어명 하드코딩 없음). dev mock 을 Light·Daily·Pro + 새 설명, 무료 사용자 light `current` 로 맞춤(subscription·profile·settings mock)
- 설정 섹션 "구독" → **"요금제 관리"**, 낭독 "요금제 관리 열기"(설정·프로필), 탈퇴 안내 문구 "설정 > 요금제 관리"

**2. 알약화(범위 B)** — 공용 `shared/ui/pill-button.styles.ts` `pillButton`(`base` = full + 연속 곡률 + 가운데, 역할 면 `primary`·`secondary`·`destructive`·`destructiveSecondary` + 짝 글자). 모양·역할 색만 공용이고 높이·폭·여백은 화면 값 그대로. 표의 버튼 **전부 이관, 건너뛴 것 없음** — ConfirmDialog(주·보조·파괴) · FullScreenError · PlayConfirmDialog · LimitNoticeSheet · ForceUpdateScreen · EmailVerificationScreen · ReconsentScreen · WithdrawalScreen(파괴 채운 빨강) · CareerInfoScreen · InterestManagementScreen · LibraryEmptyState · TopicFilterSheet · ContentDetailHeader([삭제]는 `destructiveSecondary`) · ExploreEmptyState(테두리 알약 — `base` + 테두리) · PlanList · 요금제 관리 스토어 버튼 · EmailRow · SettingsScreen(요약 재시도·업데이트) · WeeklyChart 재시도 · PlanSummaryCard 칩 · CareerCard 칩 · TermsConsentScreen · ProfileHeader(이미 알약 — 연속 곡률 추가). 회색 면 위의 흰 버튼은 `base` + 화면의 흰 면. 제외 대상(글자 링크·입력창·카드·배너·행·토스트·시트 몸체·아이콘 원·칩)은 손대지 않음

**3. 버그** — `UndoSnackbar` `undoLabel` `primary` → `onPrimary`

**4. 문서** — `spec/uiux/subscription-uiux.md`(SB1 골격·이용 중 카드 안 구독 정보 표·SB2 카드·4.5 문구·글머리·링크 줄·4.6 페이월·접근성) · `settings-uiux.md`(항목 이름) · `profile-uiux.md`·`auth-uiux.md`(목적지 이름) · `frontend/design.md`(§1 회색 단계 토큰, §2 "텍스트 버튼 = 알약, 면 = 둥근 사각" + 공용 스타일 위치, §5 버튼 줄). `features/`·`spec/api/`·`wireframe/auth.html` 의 "구독 관리" 이름은 `changes/pending/plan-management-screen-rename(fe).md` 로 요청

**검증** — `npx tsc --noEmit` · `npx eslint src` · `npx jest`(350 통과). 새 테스트: `PlanList.test.tsx`(이용 중 회색·[이용 중]·검정 알약 [구독하기]·기능 줄/광고 없음·`current` 없으면 [이용 중]·구독 정보 없음) · `CurrentSubscriptionDetail.test.tsx`(구독자 다음 결제일 + 누를 수 있는 [구독 해지]·해지 예약·다른 스토어·무료) · `SubscriptionLegalNotice.test.tsx`(링크 줄 순서·[구매 복원] 동작·`·` 낭독 제외·진행 중 비활성) · `ConfirmDialog.test.tsx`(주·보조·파괴 알약) · `settings.copy.test.ts`. JS 만 — 네이티브·runtimeVersion 변경 없음(OTA), EAS 빌드 없음

**완료 조건 중 확인 못 한 것**
- **무료 사용자 [이용 중]** — 서버가 light 를 `current` 로 줄 때만 보인다. KAN-147 이 이 PR 직전 `dev` 에 머지됐다(#1176 — 이름 Light·Daily·Pro 마이그레이션 + 무료 `current`, 이 PR 에 병합해 `subscription-api.md` 와 맞춤). 운영 서버가 아직 light `none` 이면 [이용 중] 없이 Light 카드가 일반 카드로 그려지고 레이아웃은 그대로다(테스트로 확인). 개발계·운영 서버 배포 후 실기기에서 다시 본다
- **유료 구독자 카드 상태**는 유닛 테스트로만 확인 — 실제 구독 계정(구독 중·해지 예약·결제 문제·다른 스토어)으로 실기기 확인 필요

**남은 사람 손**
- iOS·Android 실기기에서 요금제 관리·페이월 모양(로고·회색 카드·필수 표기 글머리·링크 줄)과 알약 버튼 화면들 확인 — 개발계 runtime 32 빌드가 아직 없어 OTA 가 닿을 실기기가 없다
- 구독 계정으로 이용 중 카드 안 [구독 해지]·[구독 다시 시작]·[결제 수단 확인] 동작 확인
- NAS 공식 투명 로고(`Run-Time/이어/이어_로고/이어_로고_투명_512.png`)로 `frontend/assets/logo-transparent.png` 교체

### 후속 반영 — 2026-10-07 (PM 미리보기 확정, 바탕화면 `KAN146_최종_요금제관리.png`·`KAN146_최종_페이월.png`)

- **카드마다 버튼 → 라디오 선택 + 목록 아래 버튼 하나**("Daily 구독하기"). 카드마다 [구독하기]가 반복되고 [이용 중]만 혼자 버튼 모양이라 어색하다는 PM 지적. 기본 선택은 고를 수 있는 첫 카드(서버 순서 — 티어명 하드코딩 없이 무료 사용자는 Daily)
- **[이용 중] 알약 → 이름 옆 배지**. 이용 중 카드는 라디오 칸을 비워 세 카드의 이름·설명 시작선을 맞추고, 모든 카드에 투명 테두리 2pt
- **요금제 관리 좌우 여백 16 → 32pt**(24·28·32 나란히 비교 후 PM 선택)
- **구독 유의사항 단어 단위 줄바꿈**(iOS `hangul-word`) — 28·32pt 에서 "갱신돼 / 요." 한 글자 떨어짐
- 페이월은 같은 `PlanList` 라 함께 바뀐다. `subscription-uiux.md` SB1·SB2·4.5·접근성 개정
- 검증: `tsc` · `eslint` · `jest`(구독 62 통과 — 기본 선택·선택 후 버튼·다운그레이드 조사·고를 카드 없음 테스트 추가). JS 만(OTA)
