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
| 상태 | 대기 |

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
