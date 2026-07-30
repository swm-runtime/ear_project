# 기능 명세서 인덱스

`docs/prd/ear_root_prd.md`의 기능 요구사항(FR-01 ~ FR-36)을 기능 단위로 나눈 명세서 모음입니다.
모든 문서는 `docs/prd/next_doing.md` 2장의 **8항목 템플릿**을 따릅니다.

> 1. 목적 & 연결 / 2. 진입 조건 / 3. 입력값 / 4. 처리 로직 / 5. 화면 상태 / 6. 데이터 모델 / 7. 예외 상황 / 8. 완료 조건(Given-When-Then)

서버·백그라운드 기능(파이프라인·편성·파트너 통제)은 5번 항목을 **"상태 전이 · 운영 노출"** 로 대체했습니다. 사용자 화면이 없는 대신 상태 머신과 운영 콘솔이 그 자리를 차지합니다.

## 문서 목록

### 클라이언트 — 진입·계정

| 문서 | 범위 | 주요 FR |
|---|---|---|
| [splash.md](splash.md) | 스플래시, 버전 체크, 강제 업데이트, 진입 분기 | FR-35, FR-36 |
| [auth.md](auth.md) | 소셜 로그인(카카오·구글·네이버), 로그아웃, 회원 탈퇴 | FR-01, FR-02 |
| [onboarding.md](onboarding.md) | 관심 주제 선택, 커리어 입력, 첫 콘텐츠 담기, 알림 권한 | FR-03, FR-04, FR-17 |

### 클라이언트 — 핵심 소비 루프

| 문서 | 범위 | 주요 FR |
|---|---|---|
| [library.md](library.md) | 메인 화면. 드립·담기 통합 목록, 상태 관리, 삭제, 이어듣기 | FR-20, FR-24, FR-16 |
| [explore.md](explore.md) | 추천 피드, 주제 필터, 검색, 담기, 공유 | FR-21, FR-22, FR-27 |
| [player.md](player.md) | 즉시 재생, 배속·구간 이동, 스크립트, 수면 타이머, 출처 고지 | FR-23, FR-24, FR-25, FR-12 |

### 클라이언트 — 수익화

| 문서 | 범위 | 주요 FR |
|---|---|---|
| [paywall.md](paywall.md) | 무료 하루 2편 제한, 페이월 트리거, 결제 후 복귀 | FR-29, FR-30 |
| [subscription.md](subscription.md) | 3티어 관리, 인앱 결제, 요금제 변경·해지, 구매 복원 | FR-28, FR-30, FR-31 |

### 클라이언트 — 설정·부가

| 문서 | 범위 | 주요 FR |
|---|---|---|
| [settings.md](settings.md) | 설정 허브 — 계정·구독·콘텐츠·재생·알림·정보 | FR-02, FR-05, FR-06, FR-19 |
| [interest-management.md](interest-management.md) | 관심 주제 일괄 편집, 커리어 수정, 자동 확장 토글 | FR-05, FR-06, FR-04 |
| [notification.md](notification.md) | 드립 도착 푸시, 권한 요청, 수신 설정 | FR-19 |
| [offline-download.md](offline-download.md) | 오프라인 저장 **(⚠ 범위 충돌 — 아래 참조)** | FR-26, FR-33 |
| [common-error-handling.md](common-error-handling.md) | 횡단 규칙 — 오류 분류, 재시도, 오프라인 큐, 에러 코드 | FR-36 |

### 서버 · 운영

| 문서 | 범위 | 주요 FR |
|---|---|---|
| [content-pipeline.md](content-pipeline.md) | 수급 → 대본 생성 → QA 대조 → TTS → 발행 | FR-07 ~ FR-13 |
| [drip-scheduling.md](drip-scheduling.md) | 드립 편성, 스코어링, 소비 신호 반영, 콜드스타트, 자동 확장 | FR-14 ~ FR-18 |
| [partner-control.md](partner-control.md) | 제외 지정·검수·회수, 재배포 방지, 성과 리포팅 | FR-32 ~ FR-34 |

## FR 커버리지

| FR | 문서 | FR | 문서 |
|---|---|---|---|
| FR-01 | auth | FR-19 | notification, drip-scheduling, settings |
| FR-02 | auth, settings | FR-20 | library |
| FR-03 | onboarding, interest-management | FR-21 | explore |
| FR-04 | onboarding, interest-management | FR-22 | explore |
| FR-05 | interest-management | FR-23 | player |
| FR-06 | interest-management, settings | FR-24 | player, library |
| FR-07 | content-pipeline | FR-25 | player |
| FR-08 | content-pipeline | FR-26 | offline-download |
| FR-09 | content-pipeline | FR-27 | explore, player |
| FR-10 | content-pipeline | FR-28 | subscription, paywall |
| FR-11 | content-pipeline | FR-29 | paywall |
| FR-12 | content-pipeline, player | FR-30 | paywall, subscription |
| FR-13 | content-pipeline | FR-31 | subscription, settings |
| FR-14 | drip-scheduling | FR-32 | partner-control, library, offline-download |
| FR-15 | drip-scheduling, explore, player | FR-33 | partner-control, player, offline-download |
| FR-16 | drip-scheduling, library | FR-34 | partner-control |
| FR-17 | drip-scheduling, onboarding | FR-35 | splash |
| FR-18 | drip-scheduling | FR-36 | common-error-handling, splash |

FR-01 ~ FR-36 전부 커버됨.

## 명세를 쓰면서 드러난 PRD 결정 포인트

`next_doing.md`가 예상한 대로, 명세를 채우는 과정에서 PRD 단계에서는 보이지 않던 결정 사항이 나왔습니다. **아래는 개발 착수 전에 팀이 확정해야 합니다.**

### 🔴 PRD 내부 충돌 — 반드시 확정

| # | 항목 | 충돌 내용 | 관련 문서 |
|---|---|---|---|
| 1 | **티어 명칭** | PRD 4.1은 "베이직(하루 10편)/프로(무제한)", FR-28은 "라이트/데일리/프로" | paywall, subscription |
| 2 | **오프라인 저장 범위** | FR-26은 **P0**, PRD 4.2는 "구현 이연·IA 미반영" | offline-download |
| 3 | **무료 티어 초기 콘텐츠** | PRD 4.1 "무료: 드립 없음" — 그대로면 무료 사용자의 첫 라이브러리가 비게 됨. 온보딩 초기 적립을 예외로 둘지 | onboarding, drip-scheduling |
| 4 | **드립 편수** | PRD 1.3은 "하루 2편 제한", FR-14는 "정해진 편수(시범 운영 후 결정)" | drip-scheduling |

### 🟡 PRD가 "조사 필요"로 남긴 것

| # | 항목 | 내용 | 관련 문서 |
|---|---|---|---|
| 5 | **탈퇴 시 데이터 처리** | FR-02의 "조사 필요". 재생 로그 비식별 보존 범위·기간을 법무 검토로 확정 | auth |
| 6 | **P0/P1 최종 확정** | PRD 6장 서두 "팀 검토로 확정한다" — 특히 FR-18(자동 확장), FR-19(푸시), FR-22(검색)의 MVP 포함 여부 | 전체 |

### 🟢 명세 작성 중 새로 나온 결정 포인트

| # | 항목 | 잠정 결정 | 관련 문서 |
|---|---|---|---|
| 7 | **재생 카운트 시점** | 재생 버튼 탭이 아니라 **재생 시작 시점**. 같은 날 같은 콘텐츠 재생은 1회만 카운트 | paywall 4.2 |
| 8 | **완청 판정 기준** | 90% 도달. 단 시크로 점프한 경우는 제외(`max_reached_sec` 사용) | player 4.4, library 4.3 |
| 9 | **미청취 재고 상한** | 5편 이상 쌓이면 그날 드립을 건너뜀 | drip-scheduling 4.1 |
| 10 | **QA 자동 재생성 한도** | 3회. 초과 시 자동 발행 없이 운영 검토 큐 | content-pipeline 4.4 |
| 11 | **무검수 전환 기준** | 초기 N건(잠정 50건) 인간 병행 검수로 검출률 실측 후 결정 | content-pipeline |
| 12 | **오프라인 라이선스 상한** | 30일 — 회수 반영 지연의 상한이자 파트너 계약 명시 대상 | offline-download, partner-control |
| 13 | **파트너 포털 구축 여부** | MVP는 운영자 대행 + 내부 콘솔 가능. **회수 반영 로직 자체는 P0** | partner-control |
| 14 | **무료 티어 광고 형태** | PRD 4.1의 "광고 제공"이 오디오 프리롤인지 배너인지 미정 → 플레이어 명세에 영향 | paywall, player |

## 개발 착수 순서 제안

`next_doing.md` 1장의 순서를 따릅니다.

1. **위 🔴 4건 확정** — 안 정하면 스펙을 쓰다 PRD로 되돌아온다
2. **[content-pipeline.md](content-pipeline.md) 선행 착수** — 유일하게 검증되지 않은 영역. 이게 흔들리면 화면 스펙도 흔들린다
3. **[subscription.md](subscription.md) 즉시 병행** — 스토어 심사·테스트 계정 준비가 항상 예상보다 오래 걸린다
4. **화면 개발 병렬 진행** — 명세가 다 끝나지 않아도 확정된 화면부터 착수 (3인 팀이므로 병렬이 속도)
   - 진입 흐름: splash → auth → onboarding
   - 핵심 루프: library → player → explore
   - 수익화: paywall
   - 부가: settings → interest-management → notification
5. **[common-error-handling.md](common-error-handling.md)는 첫 화면 개발과 함께** — 나중에 붙이면 화면마다 오류 처리가 제각각이 된다
