# [BE] 추천 온라인 평가 — 어제 추천 별점 수집 + 알고리즘 버전별 평점 집계

| 항목 | 값 |
|---|---|
| 요청 파트 | backend |
| 요청자 | 박준현 — 2026-09-30 (KAN-108 논의 중 "내가 생각한 건 이거였다") |
| 담당 | 박준현 |
| 발행 날짜 | 2026-09-30 |
| 시작 날짜 | 2026-09-30 |
| 기한 | 2026-10-03 (Medium — 3일 안) |
| 선행 | 없음. FE 팝업은 BE 완료 후 FE 티켓 발행(별도) |
| Jira | [KAN-116](https://runtime364.atlassian.net/browse/KAN-116) (담당: 박준현) |
| 중요도 | Medium |
| 상태 | **진행 중** |
| 관련 | KAN-108(배포 **전** 오프라인 평가 — `backend/recommendation-evaluation.md`)의 짝. 이 티켓은 배포 **후** 실사용자 평가다 |

## 요청

추천 알고리즘 **자체**를 실사용자 평가로 잰다.

1. 사용자가 앱에 들어오면 **"어제 추천 어떠셨나요?"** — 어제 정규 편성분(드립 2편)을 보여주고 **별 1~5**를 받는다. **[이번 주 그만 보기]** 를 둔다.
2. 편성분마다 **알고리즘 버전**을 남겨 별점을 **버전별**로 집계한다.
3. 어드민(admin.earcast.co.kr)에 **버전 순으로 평가 수·평균 평점(·분포)** 을 보인다 — 알고리즘을 바꿔 가며 평점이 어떻게 움직이는지 본다.
4. **별점은 추천 입력에 반영하지 않는다.** 알고리즘 평가용 측정값이다 — 반영하면 "평점이 오른 게 알고리즘 덕인지 반영 덕인지" 구분이 안 된다(PM 결정 2026-09-30).

## 완료 조건

- Given 어제(직전 서비스 날짜) 정규 편성분이 있는 사용자 / When `GET /users/me/drip-feedback/prompt` / Then 아직 평가하지 않은 어제 편성분(최대 2편)과 `show=true`가 온다. 그만 보기 중이거나 편성분이 없거나 전부 평가했으면 `show=false`
- Given 별점을 보낸다(`POST /users/me/drip-feedback`) / Then `drip_feedbacks`에 편성 시점의 알고리즘 버전과 함께 저장되고, 같은 콘텐츠 재전송은 덮어쓴다(멱등)
- Given [이번 주 그만 보기] / Then 이번 서비스 주(월 04:00 KST 시작)가 끝날 때까지 `show=false`
- Given 어드민 `GET /admin/drip-feedback/versions` / Then 버전별 편성 수·평가 수·평균·별점 분포가 버전 역순으로 온다
- Given 스코어링 코드를 바꾼다 / Then 버전 상수(`DRIP_ALGORITHM_VERSION`)를 올리는 규칙이 문서에 있고, 편성분마다 그 값이 `library_items.algorithm_version`에 남는다

## 처리 기록

### 2026-09-30 — BE·문서 완료(PR 대기). FE 팝업·어드민 표는 후속 티켓

- 문서: `features/drip-feedback.md`(신설) · `spec/api/drip-feedback-api.md`(신설) · `admin-api.md` 4.19 · `domain.md` 6.1(`algorithm_version`)·6.7(`drip_feedbacks`)·3.5(`drip_feedback_muted_until`)·12.3 · PRD FR-41 · `features/README.md` #54 · `drip-scheduling.md` 4.6·5장
- BE: `drip-feedback` 모듈 — `GET /users/me/drip-feedback/prompt`(어제 정규 편성분 중 미평가분, 서버 판정) · `POST /users/me/drip-feedback`(별 1~5 upsert, 내 편성분·7일 접수 기간 검증, 전부 아니면 거부) · `POST …/mute`(다음 서비스 주 월요일까지) · `GET /admin/drip-feedback/versions`(버전 역순 편성 수·평가 수·평균·분포). 편성 적립이 `DRIP_ALGORITHM_VERSION`('2026-09-30.1')을 `library_items.algorithm_version`에 남긴다. 마이그레이션 `1787900000000-AddDripFeedbacks`
- 별점은 추천 입력에 반영하지 않는다(어떤 스코어링도 `drip_feedbacks`를 읽지 않음). 추천 테스트 콘솔 초기화가 별점도 지운다
- 검증: 서비스 spec 10건 + 전체 suite 통과, tsc·eslint·prettier 클린
- **FE 티켓 후보**(발행 대기): 라이브러리 진입 팝업("어제 추천 어떠셨나요?" 카드 2·별 1~5·[보내기]·[이번 주 그만 보기]) + `library-uiux.md` 개정. **어드민 웹 후보**: 추천 검증 콘솔에 "알고리즘 버전별 별점" 탭
- 남은 것: 운영 첫 별점 뒤 어드민 표 확인 → archive

