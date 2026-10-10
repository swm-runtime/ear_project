# [FE] 콘텐츠 로딩 스피너를 스켈레톤 UI로 교체

| 항목 | 값 |
|---|---|
| 대상 | 아래 "교체 대상" 표의 화면·컴포넌트 · `frontend/src/shared/ui/`(공용 스켈레톤 블록) · `spec/uiux/`(해당 화면의 로딩 상태) · `frontend/design.md`(스켈레톤 규칙) |
| 요청 파트 | 프론트엔드 |
| 요청자 | 이주호(PM) |
| 담당 | 이주호 |
| Jira | [KAN-140](https://runtime364.atlassian.net/browse/KAN-140) |
| 발행 날짜 | 2026-10-05 |
| 시작 날짜 | 2026-10-05 |
| 기한 | 2026-10-09 (Low — 이번 주 안) |
| 선행 | 없음 |
| 근거 문서 | `features/common-error-handling.md` "로딩" 행(스켈레톤(목록) / 스피너(액션), 0.3초 미만 미표시) · `frontend/design.md` · 기존 스켈레톤(`LibraryItemSkeleton` · `ExploreSkeleton` · `ContentDetailSkeleton`) |
| 중요도 | Low — PM 발행(2026-10-05). 중요도 미지정이라 이번 주 마감으로 잡았다 — 바꾸려면 Jira·이 표를 함께 고친다 |
| 상태 | 완료 — 반영 2026-10-06, PR #1143 |

## 무엇을 한다

화면이나 영역의 **내용을 불러오는 동안** 빙글빙글 도는 스피너 대신, 곧 나타날 레이아웃 모양의 **스켈레톤**을 보여준다. 스켈레톤은 "무엇이 올지"를 미리 보여줘 체감 대기 시간을 줄이고, 내용이 들어올 때 화면이 덜 튄다.

**구분 원칙** — `common-error-handling.md`의 "스켈레톤(목록) / 스피너(액션)"을 목록 밖 콘텐츠 영역까지 일관되게 적용한다.

| 상황 | 표현 |
|---|---|
| 화면·영역의 **내용**을 불러오는 중 | **스켈레톤** |
| 버튼을 누른 뒤 **액션**이 진행 중(저장·제출·결제 등 — 버튼 안 스피너) | 스피너 그대로 |
| 목록 끝 다음 페이지 불러오기(무한 스크롤 하단) | 스피너 그대로(작은 하단 표시) |
| 의도된 대기 화면(첫 드립 준비 `FirstDripWaitingScreen`) | 그대로 — 기다림 자체를 안내하는 화면이다 |

## 교체 대상 (코드 조사 2026-10-05 — `ActivityIndicator` 사용처 중 내용 로딩)

| 화면·컴포넌트 | 지금 | 바꿀 모양 |
|---|---|---|
| `app/navigation/OnboardingNavigator.tsx` | 온보딩 진입 전 전체 화면 큰 스피너 | 첫 온보딩 단계(주제 선택) 레이아웃 스켈레톤 |
| `features/onboarding/screens/CareerScreen.tsx` | 직군 칩 줄 로딩 스피너(`isJobCategoriesLoading`) | 칩 모양 블록 여러 개 |
| `features/player/components/PlayerQueuePanel.tsx` | 대기열 로딩 스피너 | 대기열 행 스켈레톤(썸네일·제목 2줄) |
| `features/player/components/PlayerScriptStatus.tsx` | 대본(자막) 로딩 스피너 | 대본 줄 모양 블록 |
| `features/library/components/TopicFilterSheet.tsx` | 주제 목록 로딩 스피너 | 주제 행 스켈레톤 |
| `features/explore/screens/ExploreSearchScreen(.ios).tsx` | 첫 검색 결과 로딩 스피너(`isFirstSearchLoading`) | 검색 결과 행 스켈레톤(탐색 목록 스켈레톤 재사용) |

이미 스켈레톤인 곳: 라이브러리(`LibraryItemSkeleton`) · 탐색(`ExploreSkeleton`) · 콘텐츠 상세(`ContentDetailSkeleton`). 프로필·설정·관심 주제 관리 등 위 표에 없는 화면도 구현하면서 내용 로딩에 스피너가 남아 있으면 같은 원칙으로 바꾼다.

## 구현 규칙

- **공용 블록 하나로** — 기존 세 스켈레톤의 모양(색·모서리·반짝임 유무)을 확인해 `shared/ui/`에 공용 스켈레톤 블록(사각·원·텍스트 줄)을 두고, 화면별 스켈레톤은 그 조합으로 만든다. 기존 세 개도 공용 블록으로 옮겨 모양을 맞춘다
- **0.3초 미만이면 표시하지 않는다**(깜빡임 방지 — 기존 규칙 그대로)
- 다크 모드·플레이어 전용 색(`playerColor`)에서도 대비가 맞아야 한다
- 모션 줄이기 설정이면 반짝임(shimmer) 애니메이션을 끈다
- 접근성: 스켈레톤은 읽기 대상에서 숨기고, 영역에 "불러오는 중" 라벨 하나만 둔다
- `design.md`에 스켈레톤 규칙(언제 쓰는가 · 모양 · 모션)을 적는다 — UI 를 바꾸면 같은 PR 에서 문서도 고친다

## 완료 조건

- Given 위 표의 각 화면 / When 내용을 불러오는 중이다(0.3초 이상) / Then 스피너가 아니라 최종 레이아웃 모양의 스켈레톤이 보인다
- Given 버튼 액션(저장·제출 등) 진행 중 / When 화면을 본다 / Then 버튼 안 스피너는 종전과 같다
- Given 응답이 0.3초 안에 온다 / When 화면을 연다 / Then 스켈레톤이 번쩍이지 않고 바로 내용이 뜬다
- Given 모션 줄이기 설정 / When 스켈레톤이 보인다 / Then 반짝임 애니메이션이 없다
- Given `frontend/design.md` / When 스켈레톤을 찾는다 / Then 쓰는 상황·모양·모션 규칙이 적혀 있다
- Given `ActivityIndicator` 사용처 / When grep 한다 / Then 남은 것은 액션 버튼·하단 페이지 로딩·의도된 대기 화면뿐이다

## 처리 기록 (2026-10-06)

| 항목 | 값 |
|---|---|
| 반영 날짜 | 2026-10-06 |
| 반영 PR | #1143 |
| 배포 | dev 머지 → 개발계 OTA(JS 만, runtimeVersion 변경 없음 · 빌드 없음) |

**공용 블록** — `frontend/src/shared/ui/Skeleton.tsx`: `SkeletonGroup`(로딩 영역 하나 — `progressbar` 역할 + 라벨 하나 + `busy`, 블록 색 context, 영역 단위 숨쉬기 루프 하나) · `SkeletonBlock` · `SkeletonLine` · `SkeletonCircle`. 기존 세 스켈레톤은 반짝임이 없는 `surface` 면 + `sm` 연속 곡률이었다 — 그 색·모서리를 그대로 기본값으로 삼고, 반짝임은 불투명도 1 ↔ 0.5 왕복(0.8초씩 easeInOut, 네이티브 드라이버)을 새로 넣었다. 동작 줄이기는 `shared/hooks/useReduceMotion`(신규 — 종전에는 스플래시만 직접 읽었다), 0.3초 미표시는 기존 `useDelayedVisible` 재사용. 플레이어용 블록 색 토큰 `playerColor.skeleton`(반투명 흰색) 신설.

**스피너 → 스켈레톤으로 바꾼 곳**

| 위치 | 모양 |
|---|---|
| `app/navigation/OnboardingNavigator.tsx` | 주제 선택(O1) 전체 레이아웃 — `onboarding/components/TopicSelectSkeleton.tsx` |
| `onboarding/screens/CareerScreen.tsx` 직군 칩 줄 | 폭이 다른 알약 6개(0.3초 전에는 칩 한 줄 높이 빈 자리) |
| `player/components/PlayerQueuePanel.tsx` | 대기열 행 5개(썸네일 48 + 제목·보조 2줄), `playerColor.skeleton` |
| `player/components/PlayerScriptStatus.tsx` | 대본 문단 3개(화자·시각 줄 + 본문 2~3줄), 라벨 "대본을 불러오는 중" |
| `library/components/TopicFilterSheet.tsx` | 주제 알약 5개 |
| `explore/screens/ExploreSearchScreen(.ios).tsx` 첫 검색 | `ExploreSkeleton` 격자 행 재사용(훅에 `showFirstSearchSkeleton` 추가) |

**공용 블록으로 옮긴 기존 스켈레톤** — `LibraryItemSkeleton` · `ExploreSkeleton` · `ContentDetailSkeleton` · `ProfileSkeleton` · `SettingsTopSkeleton` 과 화면 안 인라인 스켈레톤(주제 선택 · 담기 · 관심 주제 관리 · 공지 목록/상세 · 커리어 정보 · 이메일 인증 · 탈퇴 안내 · 주간 청취 카드 — 카드가 `surface` 라 블록은 `border` 색).

**스피너를 일부러 남긴 곳**

| 위치 | 사유 |
|---|---|
| 버튼 안 — 로그인·약관·재동의·이메일 전송/재전송·커리어 정보/관심 주제 저장·온보딩 [다음]/[건너뛰기]/완료 재시도·콘텐츠 상세 담기/제거·플레이어 버튼·`ConfirmDialog`·`FullScreenError` [다시 시도] | 액션 진행 |
| `WithdrawalScreen` A8 처리 중 · `CompleteScreen` 완료 요청 인플라이트 · `LoadingOverlay`(로그인) · `EmailVerificationScreen` 코드 자동 검증(`isVerifying`) | 액션 진행 화면 — 내용 로딩이 아니다 |
| 라이브러리·탐색·검색·공지 목록 footer | 하단 페이지 로딩 |
| `ExploreSearchScreen(.ios)` `isShowingStaleResults` 인라인 표시 | 직전 결과를 흐리게 둔 채 다음 질의를 받는 **갱신** — 스켈레톤으로 바꾸면 보던 결과가 지워진다(explore-uiux 4.6) |
| `FirstDripWaitingScreen` | 의도된 대기 화면 |

**테스트** — `useDelayedVisible.test.tsx`(0.3초 미만 미표시 · 이상 표시 후 즉시 거둠) · `Skeleton.test.tsx`(동작 줄이기 켬 → 루프 미시작 · 끔 → 시작 · 라벨 하나 + 블록 낭독 숨김) · `ExploreSearchScreen.test.tsx`(첫 검색 로딩에 `ExploreSkeleton`, `ActivityIndicator` 0개). tsc · eslint · jest(45 suites / 275) 통과. 스피너를 기대하던 기존 테스트·스냅샷은 없었다.

**문서** — `frontend/design.md` §5 "스켈레톤" 신설(§4·§8 동작 줄이기 줄 갱신) · `frontend/architecture.md` 8.3 · `spec/uiux/` explore 4.6 · player PL6·PL12 · onboarding O4·O5 · library L2. `features/common-error-handling.md` 의 "스켈레톤(목록)" 문구 확장은 `changes/archive/loading-skeleton-content-regions.md` 로 요청했다(features 는 직접 고치지 않는다).

**남은 사람 손(실기기)**
- 라이트 화면에서 블록 대비 — 흰 바탕의 `surface` 면, 설정 그룹·주간 청취 카드 안
- 플레이어 — 대기열·대본 스켈레톤이 어두운 커버·밝은 커버 양쪽에서 보이는지(`playerColor.skeleton` 0.14 는 실물 튜닝 대상)
- 다크 모드 — 앱은 라이트 고정(`userInterfaceStyle: light`)이라 어두운 맥락은 플레이어뿐이다. 다크 모드 도입 시 `SkeletonGroup` 기본 색만 토큰으로 바꾸면 된다
- iOS "동작 줄이기" · Android "애니메이션 삭제" 켬/끔에서 숨쉬기 유무
- VoiceOver·TalkBack 에서 로딩 영역이 "불러오는 중" 한 번만 읽히는지
- 느린 네트워크(0.3초 이상)에서 각 영역이 스켈레톤 → 내용으로 튀지 않고 넘어가는지
