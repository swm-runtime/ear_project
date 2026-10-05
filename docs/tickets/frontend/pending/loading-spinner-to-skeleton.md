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
| 상태 | 대기 |

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
