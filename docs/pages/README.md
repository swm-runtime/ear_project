# 기능 명세서 인덱스

`docs/prd/ear_root_prd.md`의 기능 요구사항(FR-01 ~ FR-38)을 기능 단위로 나눈 명세서 모음입니다.
모든 문서는 `docs/prd/next_doing.md` 2장의 **8항목 템플릿**을 따릅니다.

> 1. 목적 & 연결 / 2. 진입 조건 / 3. 입력값 / 4. 처리 로직 / 5. 화면 상태 / 6. 데이터 모델 / 7. 예외 상황 / 8. 완료 조건(Given-When-Then)

서버·백그라운드 기능(파이프라인·편성·파트너 통제)은 5번 항목을 **"상태 전이 · 운영 노출"** 로 대체했습니다. 사용자 화면이 없는 대신 상태 머신과 운영 콘솔이 그 자리를 차지합니다.

## ⚠️ 데이터 모델은 여기 없습니다

**모든 문서의 6번 항목은 [`docs/backend/domain.md`](../backend/domain.md)를 참조만 합니다.** 스키마를 명세서마다 복사해두면 컬럼 하나 바꿀 때 17곳을 고쳐야 하고, 실제로는 몇 군데를 빠뜨려 어긋납니다.

- 테이블·컬럼을 바꿔야 하면 **`domain.md`를 먼저 고칩니다.**
- 기능 명세에는 "어떤 테이블을 왜 쓰는가"와 **동작 규칙**만 남깁니다.
- 코드의 Entity도 `domain.md` 기준입니다(`convention.md` 4.1).

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
| [profile.md](profile.md) | 프로필 — 관심사·커리어 설정, 이메일 인증, 현재 플랜 표시 | FR-02, FR-04, FR-05, FR-28 |
| [interest-management.md](interest-management.md) | 관심 주제 일괄 편집, 커리어 수정, 자동 확장 토글 | FR-05, FR-06, FR-04 |
| [notification.md](notification.md) | 드립 도착 푸시, 권한 요청, 수신 설정 | FR-19 |
| [offline-download.md](offline-download.md) | 오프라인 저장 **(P1 이연 확정 — MVP 비대상)** | FR-26, FR-33 |
| [common-error-handling.md](common-error-handling.md) | 횡단 규칙 — 오류 분류, 재시도, 오프라인 큐, 에러 코드 | FR-36 |

### 서버 · 운영

| 문서 | 범위 | 주요 FR |
|---|---|---|
| [admin.md](admin.md) | **관리자 페이지 — 콘텐츠 업로드(=발행), 주제 관리, 회수 대행, 운영 현황** | FR-37, FR-38 |
| [content-pipeline.md](content-pipeline.md) | 수급 → 대본 생성 → QA 대조 → TTS → 발행 **(자동화는 P1 — MVP는 수작업 + 관리자 업로드)** | FR-07 ~ FR-13 |
| [drip-scheduling.md](drip-scheduling.md) | 드립 편성, 스코어링, 소비 신호 반영, 콜드스타트, 자동 확장 | FR-14 ~ FR-18 |
| [partner-control.md](partner-control.md) | 제외 지정·회수, 재배포 방지, 성과 리포팅 | FR-32 ~ FR-34 |

## FR 커버리지

| FR | 문서 | FR | 문서 |
|---|---|---|---|
| FR-01 | auth | FR-19 | notification, drip-scheduling, settings |
| FR-02 | auth, settings, profile | FR-20 | library |
| FR-03 | onboarding, interest-management | FR-21 | explore |
| FR-04 | onboarding, interest-management, profile | FR-22 | explore |
| FR-05 | interest-management, profile | FR-23 | player |
| FR-06 | interest-management, settings | FR-24 | player, library |
| FR-07 | content-pipeline | FR-25 | player |
| FR-08 | content-pipeline | FR-26 | offline-download |
| FR-09 | content-pipeline | FR-27 | explore, player |
| FR-10 | content-pipeline | FR-28 | subscription, paywall, profile |
| FR-11 | content-pipeline | FR-29 | paywall |
| FR-12 | content-pipeline, player | FR-30 | paywall, subscription |
| FR-13 | content-pipeline | FR-31 | subscription, settings |
| FR-14 | drip-scheduling | FR-32 | partner-control, library, offline-download |
| FR-15 | drip-scheduling, explore, player | FR-33 | partner-control, player, offline-download |
| FR-16 | drip-scheduling, library | FR-34 | partner-control |
| FR-17 | drip-scheduling, onboarding | FR-35 | splash |
| FR-18 | drip-scheduling | FR-36 | common-error-handling, splash |
| | | FR-37 | admin, content-pipeline |
| | | FR-38 | admin, interest-management, onboarding |
| | | FR-39 | auth, profile, settings |

FR-01 ~ FR-39 전부 커버됨.

## 명세를 쓰면서 드러난 PRD 결정 포인트

`next_doing.md`가 예상한 대로, 명세를 채우는 과정에서 PRD 단계에서는 보이지 않던 결정 사항이 나왔습니다. **아래는 개발 착수 전에 팀이 확정해야 합니다.**

### ✅ 확정된 것 — 이전 충돌 6건은 모두 해소됨

| # | 항목 | 결정 | 관련 문서 |
|---|---|---|---|
| 1 | **티어 명칭** | **라이트 / 데일리 / 프로. 라이트가 무료 티어다** ("베이직" 폐기) | paywall, subscription |
| 2 | **오프라인 저장 범위** | **P1 이연 확정.** 서버 테이블·`plans` 컬럼도 지금 만들지 않는다 | offline-download |
| 3 | **무료 티어 드립** | **무료 티어도 온보딩 초기 적립과 일일 드립을 모두 받는다.** "무료: 드립 없음" 폐기 | onboarding, drip-scheduling, paywall |
| 4 | **드립 편수** | **무료 = 하루 2편 확정.** 유료는 시범 운영 후 결정(`plans` 값만 변경) | drip-scheduling |
| 5 | **탈퇴 시 데이터 처리** | 즉시 파기 / 5년 분리 보존을 법령 근거와 함께 확정 | auth, `domain.md` 12장 |
| 6 | **콘텐츠 공급 방식** | **MVP는 자동 파이프라인 없음.** 팀이 제작 → 관리자 업로드 = 즉시 발행 | admin, content-pipeline |

### 🟡 아직 남은 것

| # | 항목 | 내용 | 관련 문서 |
|---|---|---|---|
| 7 | **유료 티어 값** | 데일리·프로의 재생 한도·드립 편수·가격. 시범 운영 후 결정 — `plans` 행의 값만 채우면 되고 마이그레이션 불필요 | subscription, paywall |
| 8 | **P0/P1 최종 확정** | 특히 FR-18(자동 확장), FR-19(푸시), FR-22(검색)의 MVP 포함 여부 | 전체 |
| 9 | **아카이브 보존 범위** | `archived_users`에 전자우편주소·제공자 ID만 보존. 그 이상이 필요한지 법무 확인 | auth, `domain.md` 15.1 |

### 🟢 명세 작성 중 새로 나온 결정 포인트

| # | 항목 | 잠정 결정 | 관련 문서 |
|---|---|---|---|
| 10 | **재생 카운트 시점** | 재생 버튼 탭이 아니라 **재생 시작 시점**. 같은 날 같은 콘텐츠 재생은 1회만 카운트(`play_records` 유니크가 보장) | paywall 4.2 |
| 11 | **완청 판정 기준** | 90% 도달. 단 시크로 점프한 경우는 제외(`max_reached_sec` 사용) | player 4.4, library 4.3 |
| 12 | **수동 완료 표시** | **기능 자체를 삭제했다.** 상태는 실제 재생 결과로만 바뀐다 | library 4.3, player 4.4 |
| 13 | **드립 재적립 제외 범위** | 담기 해제·라이브러리 삭제·재생·적립을 **경로 구분 없이 전부 영구 제외** | drip-scheduling 4.2, library 4.4, explore 4.3 |
| 14 | **실제 청취 시간** | 도달 위치가 아니라 재생기가 소리를 낸 시간을 별도 기록(정산 근거) | player 4.4-1, partner-control 4.6 |
| 15 | **미청취 재고 상한** | 5편 이상 쌓이면 그날 드립을 건너뜀 | drip-scheduling 4.1 |
| 16 | **통계 집계 단위** | 주간·월간·전체. 순위·리포팅은 **직전 확정 구간** 사용(5월엔 4월 집계) | partner-control 4.6, explore 4.1 |
| 17 | **파트너 발행 전 검수** | **MVP 범위 제외.** 업로드 즉시 발행이므로 검수 대기 상태가 없다 | partner-control 4.2, admin |
| 18 | **오프라인 라이선스 상한** | 30일 — 회수 반영 지연의 상한이자 파트너 계약 명시 대상 (P1) | offline-download, partner-control |
| 19 | **파트너 포털 구축 여부** | MVP는 운영자가 관리자 페이지에서 대행. **회수 반영 로직 자체는 P0** | partner-control, admin |
| 20 | **무료 티어 광고 형태** | PRD 4.1의 "광고 제공"이 오디오 프리롤인지 배너인지 미정 → 플레이어 명세에 영향 | paywall, player |

## 개발 착수 순서 제안

`next_doing.md` 1장의 순서를 따릅니다.

1. ~~PRD 내부 충돌 확정~~ → **완료.** 위 표의 6건이 모두 결정됐고 `domain.md`에 반영됐다
2. **[admin.md](admin.md) 선행 착수** — 콘텐츠가 없으면 나머지 화면을 검증할 수 없다. 자동 파이프라인이 빠지면서 **업로드가 유일한 발행 경로**가 됐으므로 이게 가장 먼저다
3. **[subscription.md](subscription.md) 즉시 병행** — 스토어 심사·테스트 계정 준비가 항상 예상보다 오래 걸린다
4. **화면 개발 병렬 진행** — 명세가 다 끝나지 않아도 확정된 화면부터 착수 (3인 팀이므로 병렬이 속도)
   - 진입 흐름: splash → auth → onboarding
   - 핵심 루프: library → player → explore
   - 수익화: paywall
   - 부가: settings → profile → interest-management → notification
5. **[common-error-handling.md](common-error-handling.md)는 첫 화면 개발과 함께** — 나중에 붙이면 화면마다 오류 처리가 제각각이 된다
6. **[content-pipeline.md](content-pipeline.md)는 MVP 구현 대상이 아니다** — 다만 4.2~4.5의 제작 기준(분할·환각 금지·출처 고지)은 **사람이 콘텐츠를 만들 때 그대로 지켜야 하는 규칙**이므로 제작 착수 전에 읽어야 한다
