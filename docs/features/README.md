# 기능 명세서 인덱스

`docs/prd/ear_root_prd.md`의 기능 요구사항(FR-01 ~ FR-39)을 기능 단위로 나눈 명세서 모음입니다.
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
| [auth.md](auth.md) | 소셜 로그인(네이버·카카오·구글·애플), 로그아웃, 회원 탈퇴 | FR-01, FR-02 |
| [onboarding.md](onboarding.md) | 관심 주제 선택, 커리어 입력, 첫 콘텐츠 담기, 알림 권한 | FR-03, FR-04, FR-17 |

### 클라이언트 — 핵심 소비 루프

| 문서 | 범위 | 주요 FR |
|---|---|---|
| [library.md](library.md) | 메인 화면. 드립·담기 통합 목록, 상태 관리, 삭제, 이어듣기 | FR-20, FR-24, FR-16 |
| [explore.md](explore.md) | 추천 피드, 주제 필터, 검색, 담기, 공유 | FR-21, FR-22, FR-27 |
| [player.md](player.md) | 즉시 재생, 배속·구간 이동, 스크립트, 수면 타이머, 출처 고지 | FR-23, FR-24, FR-25, FR-12 |
| [content-detail.md](content-detail.md) | 콘텐츠 상세 — 더보기 시트 [상세 정보] 진입, 메타데이터 + [재생]·[담기/삭제](신설 2026-08-23) | FR-40, FR-12 |

### 클라이언트 — 수익화

| 문서 | 범위 | 주요 FR |
|---|---|---|
| [paywall.md](paywall.md) | 무료 하루 2편 제한, 페이월 트리거, 결제 후 복귀 | FR-29, FR-30 |
| [subscription.md](subscription.md) | 3티어 관리, 인앱 결제, 요금제 변경·해지, 구매 복원 | FR-28, FR-30, FR-31 |

### 클라이언트 — 설정·부가

| 문서 | 범위 | 주요 FR |
|---|---|---|
| [settings.md](settings.md) | 설정 허브 — 계정·구독·콘텐츠·재생·알림·정보 | FR-02, FR-05, FR-06, FR-19 |
| [profile.md](profile.md) | 프로필 — 요약 카드(플랜·이메일·관심 주제·커리어), 청취 통계, 이메일 인증 | FR-02, FR-04, FR-05, FR-28 |
| [interest-management.md](interest-management.md) | 관심 주제 일괄 편집, 자동 확장 토글 | FR-05, FR-06 |
| [career.md](career.md) | 커리어 정보 입력·수정 — 관심사 관리에서 분리(합의 2026-08-06) | FR-04 |
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
| FR-04 | onboarding, career, profile | FR-22 | explore |
| FR-05 | interest-management, career, profile | FR-23 | player |
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
| FR-16 | drip-scheduling, library | FR-34 | partner-control, player |
| FR-17 | drip-scheduling, onboarding | FR-35 | splash |
| FR-18 | drip-scheduling | FR-36 | common-error-handling, splash |
| FR-40 | content-detail, library, explore | FR-37 | admin, content-pipeline |
| | | FR-38 | admin, interest-management, onboarding |
| | | FR-39 | auth, paywall, subscription, profile, settings |

FR-01 ~ FR-40 전부 커버됨.

## 명세를 쓰면서 드러난 PRD 결정 포인트

`next_doing.md`가 예상한 대로, 명세를 채우는 과정에서 PRD 단계에서는 보이지 않던 결정 사항이 나왔습니다. **아래는 개발 착수 전에 팀이 확정해야 합니다.**

### ✅ 확정된 것 — 이전 충돌 6건은 모두 해소됨 (+ 계정·이메일 2건 · 화면·온보딩 6건 추가 확정)

| # | 항목 | 결정 | 관련 문서 |
|---|---|---|---|
| 1 | **티어 명칭** | **라이트 / 데일리 / 프로. 라이트가 무료 티어다** ("베이직" 폐기) | paywall, subscription |
| 2 | **오프라인 저장 범위** | **P1 이연 확정.** 서버 테이블·`plans` 컬럼도 지금 만들지 않는다 | offline-download |
| 3 | **무료 티어 드립** | **무료 티어도 온보딩 초기 적립과 일일 드립을 모두 받는다.** "무료: 드립 없음" 폐기 | onboarding, drip-scheduling, paywall |
| 4 | **드립 편수** | **전 티어 하루 2편 확정**(합의 2026-08-06). 티어는 드립 편수가 아니라 재생 한도를 가른다. 조정이 필요하면 `plans.daily_drip_count` 값만 바꾼다 | drip-scheduling 4.1, subscription 4.1 |
| 5 | **탈퇴 시 데이터 처리** | **결제 이력이 있으면** 즉시 파기 + 5년 분리 보존, **없으면 전량 즉시 파기.** 거래가 없으면 전자상거래법 시행령 제6조의 보존 대상이 성립하지 않으므로 개인정보보호법 제21조 제1항의 파기 원칙이 적용된다. 판정 기준은 `subscriptions` 행의 존재 여부 | auth 4.3, `domain.md` 12.2·12.3 |
| 6 | **콘텐츠 공급 방식** | **MVP는 자동 파이프라인 없음.** 팀이 제작 → 관리자 업로드 = 즉시 발행 | admin, content-pipeline |
| 7 | **소셜 이메일의 인증 여부** | **`users.is_email_verified`로 분리 저장.** 카카오는 `is_email_valid`·`is_email_verified`가 **둘 다 true**일 때만 인증으로 보고, `is_email_valid = false`(마스킹 주소)면 `email = null`. 미인증 주소는 결제 직전에 인증하거나 다른 주소로 바꾼다 | auth 4.1·4.4, `domain.md` 3.1 |
| 8 | **이메일 인증 발송 제한** | **이메일 주소당 5회**(계정 단위 아님), 재발송 쿨다운 **30초**, 소진 후 1시간 뒤 초기화. 오타 복구용 **[메일 다시 입력]** 제공 | auth 4.5, `domain.md` 3.7 |
| 9 | **잔여 재생 횟수 표시** | **한도가 있는 티어에 상시 노출.** 소진 시에만 띄우던 것을 상시로 바꿨고, **카드가 아니라 화면당 한 곳**이다(라이브러리는 앱바 우측, 탐색은 검색창 우측). 무제한 티어는 표시하지 않고, 0일 때는 숨기지 않고 탭하면 페이월. 문구는 `"오늘 재생 N/M 남음"` 한 문자열만 쓰며 `M`을 2로 하드코딩하지 않는다 | paywall 5, library 4.1-2, explore 4.4-1 |
| 10 | **재생 확인 팝업 억제** | **[오늘은 그만 보기]** — 누르면 팝업을 닫고 **그대로 재생**하며, 오늘의 서비스 날짜(04:00 KST 경계) 동안 **이 팝업만** 억제한다. 차감·페이월·판정은 그대로다. **기기 로컬 상태**이며 서버 컬럼을 만들지 않는다 | paywall 4.2·4.6, library 4.3, explore 4.4 |
| 11 | **드립 탭 이름** | **[추천] → "이어 PICK".** 탐색의 추천 피드와 단어가 겹쳐 같은 말이 두 화면에서 다른 것을 가리키던 문제를 해소 | library 4.1-1 |
| 12 | **온보딩 3단계 표본 부족 대응** | **변경(2026-08-06): 랜덤 배치 폐기.** 표본 크기와 무관하게 같은 선정 기준으로 정렬한 상위를 노출한다(explore 4.1의 인기 섹션과 동일 기준). 섹션 제목·시드 고정 규칙도 함께 폐기 | onboarding 4 |
| 13 | **온보딩 0건 담기 처리** | 하나도 담지 않으면 **자동 드립 트리거가 발동하고, 편성이 끝나야 완료 화면을 띄운다.** 그동안 로딩 화면을 노출하며, 실패 시 `common-error-handling.md` 4.2의 재시도 규약을 따르고 소진·타임아웃 시에는 **사용자를 세워두지 않고** 완료 화면으로 보낸 뒤 서버 비동기 큐에 넘긴다 | onboarding 4, drip-scheduling 8 |
| 14 | **카피에 쓰는 수치의 근거** | 알림 사전 안내의 하드코딩된 "20%"를 `N%`로 교체. **개발자가 출처 있는 통계를 찾아 입력**하고 근거를 카피 리소스와 명세 양쪽에 기록한다. 못 찾으면 **정성 표현으로 폴백**하고, 출시 후 자체 측정값으로 대체한다 | onboarding 4 |

### 🟡 아직 남은 것

| # | 항목 | 내용 | 관련 문서 |
|---|---|---|---|
| 15 | **유료 티어 값** | 데일리·프로의 재생 한도·가격. 시범 운영 후 결정 — `plans` 행의 값만 채우면 되고 마이그레이션 불필요 (드립 편수는 전 티어 2편으로 확정 — #4) | subscription, paywall |
| 16 | **P0/P1 최종 확정** | 특히 FR-18(자동 확장), FR-19(푸시)의 MVP 포함 여부. FR-22(검색)는 **재개정 — MVP 포함 격상**(합의 2026-08-23, #46 — 종전 "P1 유지·검색창 비활성"(2026-08-06) 폐기). FR-27은 확정 — **MVP 제외**(#42). FR-34는 **원천 로그 수집은 MVP부터, 리포팅은 P1**(분리 확정 필요 — partner-control 미결, player 4.4-1) | 전체 |
| 17 | **계정 단위 발송 상한(백스톱) — P0** | 발송 제한을 주소 단위로 바꾸면서(#8) **계정 단위 총량 제한이 사라졌다.** 주소를 갈아 끼우면 한 계정의 발송량에 상한이 없어 메일 발송기로 악용될 수 있다. 상한을 둘지 결정 필요 — 발신 도메인 평판이 걸린 문제라 메일 인프라 선택보다 먼저 정하는 편이 좋다 | auth 미결, `domain.md` 15.1-3 |
| 18 | **결제 이력 없는 사용자의 동의 이력 파기 — 법무 확인** | #5에 따라 `archived_consents`도 함께 파기한다. 동의 획득의 입증 책임은 사업자에게 있어, 탈퇴자가 나중에 동의 사실을 다투면 반박 근거가 없다. **입증 책임과 제21조 제1항 중 어느 쪽이 우선하는지 확인 필요** | auth 4.3, `domain.md` 15.1-2 |
| 19 | **아카이브 보존 범위** | `archived_users`에 전자우편주소·제공자 ID만 보존. 그 이상이 필요한지 법무 확인. #5·#7로 **아카이브 대상이 결제자로 좁혀지고 전원 인증된 이메일을 갖게 되므로, 식별 수단이 없는 행은 생기지 않는다**(`email`을 `NOT NULL`로 확정) | auth, `domain.md` 11.3·15.1 |
| 20 | ~~알림 사전 안내 재노출 경로~~ | → **확정(2026-08-06): (b) 설정 알림 섹션에 유도 배너 상시 노출.** OS 권한 미결정 동안 노출, 권한 결정 시 숨김 | notification 4.1, settings 4.3 |
| 21 | **무료 티어에서 확인 팝업을 유지할지** | #9·#10이 함께 들어오면서 팝업의 역할이 상당 부분 겹쳤다. 무료는 하루 2편이라 억제 없이도 마찰이 최대 2회였고, **첫 재생에서 억제하면 팝업은 사용자당 사실상 한 번만** 뜬다. 잔여 횟수가 상시 노출되는 지금은 **무료 티어에서 팝업을 빼고 유료 한도 티어에만 두는 쪽**이 더 단순할 수 있다. #15(유료 티어 한도 값)와 함께 판단한다 | paywall 미결, library 4.3 |

### 🟢 명세 작성 중 새로 나온 결정 포인트

| # | 항목 | 잠정 결정 | 관련 문서 |
|---|---|---|---|
| 22 | **재생 카운트 시점** | 재생 버튼 탭이 아니라 **재생 시작 시점**. 같은 날 같은 콘텐츠 재생은 1회만 카운트(`play_records` 유니크가 보장) | paywall 4.3 |
| 23 | **완청 판정 기준** | `max_reached_sec` 90% **도달 순간 즉시 판정**(확정 2026-08-10 — 재생 종료를 기다리지 않는다). 시크로 점프한 경우는 제외 | player 4.4, library 4.4 |
| 24 | **수동 완료 표시** | **기능 자체를 삭제했다.** 상태는 실제 재생 결과로만 바뀐다 | library 4.4, player 4.4 |
| 25 | **드립 재적립 제외 범위** | 담기 해제·라이브러리 삭제·재생·적립을 **경로 구분 없이 전부 영구 제외** | drip-scheduling 4.2, library 4.5, explore 4.3 |
| 26 | **실제 청취 시간** | 도달 위치가 아니라 재생기가 소리를 낸 시간을 별도 기록(정산 근거) | player 4.4-1, partner-control 4.6 |
| 27 | **미청취 재고 상한** | 5편 이상 쌓이면 그날 드립을 건너뜀 | drip-scheduling 4.1 |
| 28 | **통계 집계 단위** | 주간·월간·전체. 순위·리포팅은 **직전 확정 구간** 사용(5월엔 4월 집계) | partner-control 4.6, explore 4.1 |
| 29 | **파트너 발행 전 검수** | **MVP 범위 제외.** 업로드 즉시 발행이므로 검수 대기 상태가 없다 | partner-control 4.2, admin |
| 30 | **오프라인 라이선스 상한** | 30일 — 회수 반영 지연의 상한이자 파트너 계약 명시 대상 (P1) | offline-download, partner-control |
| 31 | **파트너 포털 구축 여부** | MVP는 운영자가 관리자 페이지에서 대행. **회수 반영 로직 자체는 P0** | partner-control, admin |
| 32 | **무료 티어 광고 형태** | PRD 4.1의 "광고 제공"이 오디오 프리롤인지 배너인지 미정 → 플레이어 명세에 영향 | paywall, player, library, explore |
| 33 | **프로필 청취 통계** | **도입 확정(2026-08-06).** 누적 3지표(완청 콘텐츠 수·청취 시간·연속 일수) · 주간 요일별 그래프(이전 주 탐색) · 주제 분포 원형 그래프. PRD 4.1의 프로필 구성(4항목)에 없던 추가 — ~~PRD 개정 필요~~ → PRD 4.1 반영 완료(개정 2026-08-06, 확인 2026-08-10) | profile 4.5~4.7 |
| 34 | **탐색 재생 자동 적립** | 탐색에서 재생 시작 시 라이브러리 자동 적립(`source = save`), 이미 담긴 콘텐츠는 재적립 없음(합의 2026-08-06). PRD 5.3에 없던 추가 — ~~PRD 개정 필요~~ → PRD 5.3 반영 완료(개정 2026-08-06, 확인 2026-08-10) | explore 4.4 |
| 35 | **최상위 티어 소진 처리** | 페이월 대신 한도 안내만 띄우고, 그 외 한도 티어(무료 포함)는 페이월(시트 안에 같은 한도 안내 문구 포함)(합의 2026-08-06) — **FR-29 개정 필요** | paywall 4.1 |
| 36 | **스킵 신호 제거** | 확정(2026-08-10) — 스킵 신호를 기록하지 않는다(종전 "20% 미만 이탈 = skip" 잠정값 폐기). `domain.md` 6.4 enum·PRD 10 지표·드립 스코어링까지 반영 완료(이탈 감점 재도입 여부만 drip-scheduling 미결) — `changes/archive/player-skip-signal-removal(fe).md` | player 4.4 |
| 37 | **온보딩 추천 구성** | 관심 주제 6건 + 인기 3건 = 9건 (onboarding 확정표 기존 기록의 등재) | onboarding 4 |
| 38 | **프리미엄 팩 MVP 비범위 확정** | PRD의 "0~1개 테스트"도 하지 않는다(합의 2026-08-06). ~~PRD 4.2 개정 필요~~ → PRD 4.2·11장 마일스톤 반영 완료(2026-08-10) | subscription 미결 |
| 39 | **버전 체크 fail-open 확정** | 가용성 우선 트레이드오프 확정(합의 2026-08-06) — 신규 설치+서버 장애 조합에서 강제 업데이트가 지연될 수 있음을 감수 | splash 7 |
| 40 | **관리자 도구 범위** | 앱 내 + 업로드·주제 관리·회수 대행·운영 현황 대시보드 포함 확정 — ~~PRD 4.1 범위 초과분 개정 필요~~ → PRD 4.1 반영 완료(개정 2026-08-06, 확인 2026-08-10) | admin |
| 41 | **드립 고갈 시 대체 없이 스킵** | 자동 확장(P1) 도입 전까지 그날 적립을 건너뛴다(합의 2026-08-06). 인기 대체 편성은 콜드스타트(FR-17) 전용 | drip-scheduling 7 |
| 42 | **공유(FR-27) MVP 제외** | 더보기 시트에 공유 항목을 노출하지 않고, P1 도입 시 활성화(합의 2026-08-06) | explore 4.6 |
| 43 | **재청취 창 15일** | 차감일로부터 15일간 재청취는 차감·차단 없음(확정 2026-08-10). 기준은 완청이 아니라 차감 발생 — 계약·스키마 파급은 백엔드 협의 | paywall 4.3-1 |
| 44 | **더보기 시트 [원문 보기] 통일** | 라이브러리·탐색·플레이어 세 화면 더보기 모두 [원문 보기]를 둔다(확정 2026-08-10). `source_url` 있는 콘텐츠만, 클릭은 `source_link_clicks` 기록 | library 3, explore 4.3, player 3 |
| 45 | **이메일 계정 단위 발송 상한** | 1시간 20회 / 하루 50회 백스톱(확정 2026-08-10). 클라이언트 비노출 — 서버 판정 | auth 4.5 |
| 46 | **검색 MVP 격상** | FR-22를 P1에서 MVP(P0)로 격상(합의 2026-08-23). 검색창 비활성 노출 폐기 — spec/api(`/explore/search` 배포)·spec/uiux(E1·E6·E7)의 P1 표기 개정과 백엔드 공유 필요 | explore 4.5, PRD FR-22 |
| 47 | **콘텐츠 상세 화면 도입** | **세 화면(라이브러리·탐색·플레이어) 더보기 시트**에 [상세 정보] 추가(합의 2026-08-23, FR-40 신설). 구성: 헤더(썸네일·제목·태그·**[재생]·[담기]/[삭제]** — 표시 전용 폐기, 개정 2026-08-23) / 소개 / 메타(길이 **초 단위 표기**·발행일·시리즈(조건부)) / 출처. 출처는 origin 분기 — partner: 저자·제공·[원문 보기] / ai_generated: **소스 전수 나열 — 제목·저자 표시, 항목 탭 = 링크(URL 문자열·"외 N건" 금지)**. 청취 상태·파일 크기는 두지 않는다. **소스 목록은 스키마에 없어 백엔드 티켓 발행**(`tickets/backend/pending/content-sources-structured-list.md`) | content-detail 4.2~4.4, library 3, explore 3, player 3 |

## 개발 착수 순서 제안

`next_doing.md` 1장의 순서를 따릅니다.

1. ~~PRD 내부 충돌 확정~~ → **완료.** 위 표의 14건이 모두 결정됐고 `domain.md`에 반영됐다. #20(알림 사전 안내 재노출)도 (b)안으로 확정됐다(2026-08-06)
2. **[admin.md](admin.md) 선행 착수** — 콘텐츠가 없으면 나머지 화면을 검증할 수 없다. 자동 파이프라인이 빠지면서 **업로드가 유일한 발행 경로**가 됐으므로 이게 가장 먼저다
3. **[subscription.md](subscription.md) 즉시 병행** — 스토어 심사·테스트 계정 준비가 항상 예상보다 오래 걸린다
4. **화면 개발 병렬 진행** — 명세가 다 끝나지 않아도 확정된 화면부터 착수 (3인 팀이므로 병렬이 속도)
   - 진입 흐름: splash → auth → onboarding
   - 핵심 루프: library → player → explore
   - 수익화: paywall
   - 부가: settings → profile → interest-management → career → notification
5. **[common-error-handling.md](common-error-handling.md)는 첫 화면 개발과 함께** — 나중에 붙이면 화면마다 오류 처리가 제각각이 된다
6. **[content-pipeline.md](content-pipeline.md)는 MVP 구현 대상이 아니다** — 다만 4.2~4.5의 제작 기준(분할·환각 금지·출처 고지)은 **사람이 콘텐츠를 만들 때 그대로 지켜야 하는 규칙**이므로 제작 착수 전에 읽어야 한다
