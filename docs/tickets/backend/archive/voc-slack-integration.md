# [BE] VoC 슬랙 연동 — 사용자 문의·리뷰를 Slack 채널로 모으기

| 항목 | 값 |
|---|---|
| 대상 | VoC 수집원 → Slack 채널 연동 |
| 요청 파트 | 백엔드 |
| 요청자 | 이주호(PM) |
| 담당 | 박준현 |
| Jira | [KAN-133](https://runtime364.atlassian.net/browse/KAN-133) |
| 발행 날짜 | 2026-10-05 |
| 시작 날짜 | 2026-10-05 |
| 기한 | 2026-10-09 (Low — 이번 주 안) |
| 선행 | 없음 |
| 근거 문서 | `features/settings.md` 4.1(문의하기 — 카카오톡 채널) · CLAUDE.md(사용자 개인정보 공유 금지, 2026-10-04) |
| 중요도 | Low — PM 발행(2026-10-05). 중요도 미지정이라 이번 주 마감으로 잡았다 — 바꾸려면 Jira·이 표를 함께 고친다 |
| 상태 | **완료** (2026-10-06 — 운영에서 새 리뷰 1건이 Slack에 도착) |

## 무엇을 한다

흩어진 사용자 목소리(VoC)를 Slack 한 채널로 모아 팀이 바로 보게 한다.

1. **수집원 조사** — 카카오톡 채널 문의(설정 [문의하기]) · App Store·Google Play 리뷰 · 앱 내 피드백(추천 별점 등). 수집원별 가능한 연동 방식(공식 API · 웹훅 · 주기 폴링)과 제약을 정리한다
2. **범위 확정·구현** — 연동 가능한 수집원부터 Slack 채널로 보낸다
3. **개인정보** — 메시지에 사용자 이름·이메일을 싣지 않는다. 필요하면 `user_id`

## 완료 조건

- Given 조사 결과 / When 처리 기록을 본다 / Then 수집원별 연동 방식·가능 여부가 표로 있다
- Given 연동한 수집원에 새 문의·리뷰 / When 들어온다 / Then 정해진 Slack 채널에 메시지가 올라온다
- Given 그 메시지 / When 내용을 본다 / Then 사용자 이름·이메일이 없다

## 처리 기록

### 2026-10-06 — 수집원 조사(완료 조건 1)

| 수집원 | 가능 여부 | 방식 | 전제 | 비용 | 제약 |
|---|---|---|---|---|---|
| 카카오톡 채널 1:1 문의 | **불가**(공식 API 없음 — 카카오 데브톡 공식 답변 2026-08) / 조건부(상담톡·챗봇) | 상담톡: 딜러사 API · 챗봇: 오픈빌더 폴백 블록 스킬 서버 | 상담톡: 비즈니스 채널 전환(사업자 심사 3~5일) + 딜러사 계약, **관리자센터 1:1 채팅 메뉴가 꺼진다**(현 운영 방식 상실) · 챗봇: 비즈니스 인증 채널, 상담 연결 뒤 대화는 못 본다 | 상담톡 월 고정비(딜러 예시 3.5만~8.5만원/계정)+건당 | 3인 팀 문의량 대비 과함 |
| App Store 리뷰 | **가능** | App Store Connect API 폴링(`GET /v1/apps/{id}/customerReviews`) — 웹훅 없음 | **팀 키**(결제용 In-App Purchase 키와 다름). Customer Support 역할이면 읽기 가능 | 무료 | 키당 3,500req/시간, 날짜 필터 없음(정렬 후 자름), 텍스트 없는 별점만 리뷰 미포함 |
| Google Play 리뷰 | **가능(제한)** | Play Developer API `reviews.list` 폴링 — 웹훅·Pub/Sub 없음 | 결제용 서비스 계정에 Play Console "리뷰 보기·답글" 권한 추가 | 무료 | **최근 1주일치만** · GET 200회/시간 · 텍스트 없는 별점 미포함 |
| 앱 내 추천 별점 | 범위 제외(결정 2026-10-06 박준현) | — | — | — | — |

**결정**: 카카오톡 문의는 범위에서 제외(상담톡 비용·운영 방식 변경 대비 이득 없음). 코드 없이 쓸 수 있는 대안은 채널 관리자센터의 새 채팅 이메일 알림을 팀 메일 → Slack 이메일 앱으로 포워딩하는 것 — 본문 포함 여부는 미확인.

### 2026-10-06 — 구현(완료 조건 2·3)

- `backend/src/modules/voc/` — 15분 간격 `store-review-poll` 스케줄러(스케줄러 워커 1개), App Store·Play 클라이언트, 신규/수정 판정, Slack 한 메시지 묶음(`:speech_balloon: 스토어 리뷰 N건` + 건당 별점·스토어·앱 버전·지역·날짜·제목/본문 500자). **보냈을 때만** `store_reviews`(domain.md 10.4)에 기록해 웹훅이 죽은 주기는 다음 주기에 다시 고른다.
- **첫 실행은 알리지 않는다** — 표가 비어 있으면 현재 리뷰를 기록만 하고(기준선) 그 뒤 새 것·수정분만 알린다. 켜자마자 쌓인 리뷰가 한꺼번에 쏟아지지 않게.
- **개인정보**: 리뷰어 닉네임은 요청 필드에서 빼고(App Store) 버린다(Play). 메시지·DB·로그 어디에도 없다 — 테스트가 공통 모양의 키 목록을 고정한다.
- 전송은 가입·탈퇴 알림과 같은 `modules/alert`의 `SlackAlertService`(같은 웹훅 `SLACK_ERROR_WEBHOOK_URL`).
- env: `APP_STORE_CONNECT_ISSUER_ID` · `APP_STORE_CONNECT_KEY_ID` · `APP_STORE_CONNECT_PRIVATE_KEY_BASE64`(신규, 선택) + 기존 `APP_STORE_APP_APPLE_ID` · `GOOGLE_PLAY_*`. 자격증명이 있는 스토어만 켜진다. 기동 로그 `voc-review=on/off`.
- 검증: 단위 44건(JWT 서명·정규화·판정·메시지), 전체 1,337건 통과. 로컬 마이그레이션 적용·되돌리기 확인.

### 남은 것 — 운영에서 켜려면(사람 손)

1. App Store Connect → 사용자 및 액세스 → 통합 → **팀 키** 발급(Customer Support 이상) → Secrets에 `APP_STORE_CONNECT_*` 3개
2. Play Console → 사용자 및 권한 → 결제용 서비스 계정에 **"리뷰 보기 및 답글"** 추가
3. 재배포 → 15분 뒤 기동 로그 `store reviews baseline recorded without notifying` 확인 → 그 뒤 새 리뷰가 Slack에 오는지 확인(완료 조건 2의 실측). **실제 스토어 응답으로는 아직 돌려 보지 못했다** — 응답 필드명은 공식 문서 기준.

### 2026-10-06 — 운영 반영과 실측 (반영 날짜: 2026-10-06, 릴리스 #1152 `v1.2.0`)

1. **App Store Connect 팀 키**: "사용자 지원"(Customer Support) 권한으로 새 키 발급(키 ID `96Z5PH64C7` — EAS Submit 키와 분리). 운영 Secrets `ear/prod/api`에 `APP_STORE_CONNECT_ISSUER_ID` · `APP_STORE_CONNECT_KEY_ID` · `APP_STORE_CONNECT_PRIVATE_KEY_BASE64` 등록(박준현 직접 실행).
2. **Play 권한**: **추가하지 않았다.** Play Console의 "리뷰에 답하기" 설명에 "이 권한이 없는 사용자도 평점과 리뷰를 볼 수 있다"고 적혀 있어 기본 "앱 정보 보기(읽기 전용)"로 조회가 된다 — 운영 키로 `reviews.list`를 직접 호출해 200을 확인했다. 위 "남은 것" 2번은 불필요한 항목이었다.
3. **운영 배포**(15:28 KST, `v1.2.0`) → 기동 로그 `voc-review=on` → 15:43 `store reviews baseline recorded without notifying`(`recorded_count: 2` — App Store 기존 리뷰 2건, Play 0건).
4. **실측** — 리뷰 폴링 15:58·16:13·…·17:03 정상(실패 없음). 박준현이 두 스토어에 글 리뷰를 남겼으나 한동안 API에 나타나지 않았다:
   - **Play**: 개발자(테스터) 계정으로 남긴 리뷰는 **비공개 피드백**으로 처리돼 공개 리뷰 API에 오지 않는다. 일반 계정으로 다시 남긴 리뷰가 17:07에 API에 나타났고, **17:18 폴링에서 `store reviews notified` 1건 → Slack 도착 확인**(완료 조건 2 실측).
   - **App Store**: 검수 대기로 17:18 시점에도 API에는 기존 2건(최신 10/2)만 보인다. 게시되면 다음 폴링이 알린다 — 코드 경로는 Play 건으로 같은 것이 검증됐다.
5. 운용 메모: Play API는 **프로덕션 트랙 설치자의 글 있는 리뷰**만, App Store API는 **게시된 글 리뷰**만 돌려준다 — 별점만 매긴 것은 둘 다 안 온다. 리뷰 테스트는 일반 계정으로 한다.

**완료 조건 대조**: ① 수집원 조사·범위 확정 ✅(10-06 조사) ② 스토어 리뷰가 Slack에 한 메시지로 ✅(17:18 실측) ③ 신원 값 없음 ✅(리뷰어 닉네임 미수집·미전송). → **archive**.

### 2026-10-07 — 추가 조사: 카카오톡 채널 문의를 챗봇(오픈빌더)으로 받는 경로 — 박준현

"상담톡 없이 i.kakao(챗봇 관리자센터)로 우회할 수 있다"는 말이 있어 공식 문서(kakaobusiness.gitbook.io · cs.kakao.com · devtalk 공식 답변)로 재확인했다. **결론: 조건부 가능.** 10-05의 "조건부(챗봇)" 판단과 같고, 조건이 구체화됐다.

| 항목 | 확인 결과 | 근거 |
|---|---|---|
| 비용 | 챗봇 무료(2020-09 전환). 상담톡 불필요 | cs.kakao.com/helps_html/1073202191 |
| 비즈니스 인증 | 챗봇 연결 자체엔 **불필요**. 미인증 채널은 사용자에게 "사업자 정보 미확인" 경고가 뜸. `appUserId`(앱 사용자 매핑)만 인증 채널+앱 필요 | devtalk.kakao.com/t/topic/150493 |
| 가입 심사 | 과거 OBT 심사 1주. 현 공식 가이드엔 심사 서술 없음 — **가입 화면에서 확인 필요(미확인)** | kakaobusiness.gitbook.io/main/tool/chatbot/start/prepare |
| 수신 경로 | 폴백 블록에 스킬 서버(우리 HTTPS) 연결 → 자유 발화가 `userRequest.utterance`로 POST. `user.id`(botUserKey)·`plusfriendUserKey`는 비식별 키라 앱 user_id 단독 매핑 불가 | …/skill_guide/answer_json_format |
| 응답 제약 | **5초 고정**, 유효한 SkillResponse JSON 필수(simpleText "접수했습니다" 한 줄이면 됨). Slack 전송은 응답 뒤 비동기 | devtalk.kakao.com/t/topic/128246 |
| 이미지 | 공식 설명과 실사용 보고가 어긋남(첫 장만 URL로 옴 / 이미지만 보내면 스킬 미호출). 신뢰하지 말 것 | devtalk 143494·151310 |
| 1:1 채팅과의 관계 | 챗봇 연결 시 자동응답·채팅 리스트 메뉴는 OFF. **1:1 채팅은 ON 유지 가능**(무료)하고 '상담 연결' 버튼으로 전환 → 운영자가 관리자센터/파트너센터 앱에서 답장. 사용자가 **버튼을 눌러야** 전환(발화로 자동 전환 없음). 상담 완료 후 봇 재개 규칙 문서 없음 | cs.kakao.com/helps_html/1073197094 · devtalk 151279 |
| 대안 | 관리자센터엔 웹훅·이메일·API 알림 없음(PC 웹푸시·앱 푸시뿐). 상담톡은 딜러사 계약 월 3.5만~8.5만원+건당 | devtalk 134473 |
| 공개 사례 | "폴백 → Slack 전달" 그대로인 사례는 없음. 인접: kronenz/openclasw-cloud `webhooks.ts`(utterance 파싱+Slack), kakao-aicoursework chat_skill_server | GitHub |

**구현한다면**(약 1~2일 + 가입 대기)
1. 채널: 자동응답·채팅 리스트 OFF, 1:1 채팅 ON, 봇 마스터에 매니저 권한
2. 챗봇 관리자센터 가입·봇 생성·운영 채널 연결(심사 유무 여기서 드러남)
3. `POST /kakao/skill` 등록 → 폴백 블록 연결, 웰컴·폴백 말풍선에 '상담 연결' 버튼. 서명 헤더가 없어 비밀 경로 + `bot.id` 검증
4. NestJS: 발화·botUserKey를 큐에 넣고 즉시 simpleText 응답, Slack은 `SlackAlertService`로 비동기. 이름·이메일 미포함
5. 운영: Slack에서 보고 파트너센터 앱으로 답장

**리스크**: Slack은 수신 전용(답장은 카카오 앱에서) · 사용자가 '상담 연결'을 안 누르면 봇 모드라 답장 경로가 불확실 · 이미지 전달 불안정 · 미인증 경고 노출. **결정은 보류** — 문의량이 늘어 관리자 앱 푸시만으로 놓치기 시작하면 다시 꺼낸다.
