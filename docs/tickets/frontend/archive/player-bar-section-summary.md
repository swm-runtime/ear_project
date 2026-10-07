# [FE] 플레이어 바 위에 지금 듣는 부분 요약 표시

| 항목 | 값 |
|---|---|
| 대상 | `features/player.md`(규칙 먼저) · `spec/uiux/player-uiux.md` · 미니 플레이어 · 요약 데이터 출처(파이프라인·백엔드 — 필요하면 별도 티켓) |
| 요청 파트 | 프론트엔드(PM) |
| 요청자 | 이주호(PM) |
| 담당 | 이주호 |
| Jira | [KAN-127](https://runtime364.atlassian.net/browse/KAN-127) |
| 발행 날짜 | 2026-10-05 |
| 시작 날짜 | 2026-10-05 |
| 기한 | 2026-10-09 (Low — 이번 주 안) |
| 선행 | KAN-137(`tickets/ai/pending/section-summary-generation.md` — 구간 요약 생성·표시 디자인, 박수헌). 구현은 그 뒤 — 이번 주 목표인 데이터 출처 결정은 선행 없이 한다 |
| 근거 문서 | `features/player.md` · `backend/domain.md` 5.3 `content_scripts`(자막 세그먼트) · `frontend/design.md` |
| 중요도 | Low — PM 발행(2026-10-05). 이번 주에는 규칙·데이터 출처 확정까지가 목표다 — 구현은 데이터가 준비된 뒤 |
| 상태 | 완료 — 반영 2026-10-07 |

## 무엇을 한다

재생 중 **플레이어 바(미니 플레이어) 위에 지금 듣고 있는 구간의 한 줄 요약**을 보여준다. 중간부터 들었거나 잠깐 놓친 사람이 맥락을 바로 잡게 한다.

## 먼저 정할 것

1. **요약 데이터 출처** — 지금 `content_scripts.segments`에는 `start_sec`·`end_sec`·`speaker`·`text`(대사)만 있고 **요약이 없다.**
   - (a) 파이프라인이 대본을 구간(주제 단위)으로 나눠 구간별 한 줄 요약을 만들고, 발행 때 함께 싣는다 → AI·BE 티켓 필요, `domain.md` 스키마 변경
   - (b) 요약 없이 지금 대사 일부를 보여준다(자막에 가까움) → FE만으로 가능하지만 "요약"이 아니다
2. **구간 단위** — 대사(턴)마다 바뀌면 너무 자주 바뀐다. 주제 단위(한 편에 4~8구간)를 기본으로 본다
3. **표시** — 위치(미니 플레이어 위 vs 전체 플레이어), 길이(한 줄 말줄임), 바뀔 때 전환, 요약 없는 콘텐츠의 처리(영역 숨김)
4. 규칙은 `features/player.md`에, 카피·상태는 `spec/uiux/player-uiux.md`에 먼저 적는다(문서 → 코드)

## 완료 조건

- Given 이번 주 / When 이 티켓을 본다 / Then 데이터 출처(a/b)와 구간 단위가 결정돼 처리 기록에 적혀 있다
- Given 데이터가 파이프라인·백엔드에 걸리는 결정 / When 요청 문서를 본다 / Then AI·BE 티켓이 발행돼 이 티켓의 선행으로 걸려 있다
- Given 구현 후 요약이 있는 콘텐츠 재생 / When 구간이 바뀐다 / Then 플레이어 바 위 요약이 그 구간 것으로 바뀐다
- Given 요약이 없는 콘텐츠 / When 재생한다 / Then 요약 영역이 나타나지 않고 플레이어 바는 종전과 같다

## 처리 기록 — 반영 2026-10-07

**결정**
- 데이터 출처: **(a) 파이프라인 구간** — KAN-137(박수헌)이 대본 단락 제목을 구간으로 만들고(`인트로` → `도입` → 단락 제목 → `마무리`, 한 편 7~11개), KAN-144(백엔드)가 발급 응답 `sections: [{ start_sec, title }]`로 싣는다(운영 v1.2.0). 요약을 따로 만들지 않고 단락 제목을 쓴다
- 구간 단위: 대본 단락(주제) 단위 — 대사(턴) 단위가 아니다
- **위치(PM 2026-10-07): 전체 플레이어 시크바 바로 위 한 줄. 미니플레이어에는 두지 않는다**(티켓 제목 "플레이어 바 위"에서 변경 — KAN-137 박수헌 결정과 같다)
- 표시: "지금 · {구간 제목}" 14pt 한 줄 말줄임, 바뀔 때 교차 페이드(동작 줄이기면 즉시), 구간 없으면 줄 없음, 재생 목록이 열리면 걷힘, 누르는 동작 없음

**반영**
- 규칙 `features/player.md` 4.6-1 · 화면 `spec/uiux/player-uiux.md` 4.1·6장·7장 · `player-api.md` 설명 문구는 `changes/pending/player-api-sections-display-location(fe).md`
- 코드: 발급 DTO `sections` → `AudioIssueResult.sections` → 세션 `sections`(`playback.service.ts`), `player.section.ts` `currentSectionOf`(테스트), `components/PlayerCurrentSection.tsx`, `PlayerScreen` 컨트롤 영역 시크바 위. mock 발급에 구간 6개
- 검증: `tsc` · `eslint` · `jest`

**완료 조건 중 확인 못 한 것**
- "구간이 바뀌면 요약이 바뀐다"는 유닛(`currentSectionOf`)으로만 — 실기기 확인 필요. 기존 발행분은 재발행 전까지 `sections: []`라 줄이 안 보인다(정상 — 빈 상태 조건). 새로 발행된 편으로 확인한다
- JS 만이라 OTA 로 나가지만 runtime 32 라 1.2.0 빌드부터 보인다

### 후속 — 2026-10-07 (PM 미리보기, 바탕화면 `KAN127_구간카드_*.png`)

- **한 줄 → 카드**: 라벨 "지금 듣는 구간"(12pt) + 구간 제목 최대 2줄(15pt 굵게, 한글 단어 단위 줄바꿈), 면 `playerColor.surface` · 12 연속 곡률. 제목 칸은 늘 두 줄 높이(카드 높이 고정 — 컨트롤 위치 유지)
- **재생·일시정지 = 플랫폼 기본 기호, 원 없음**(PM "애플 자체 플레이 아이콘, 중지 아이콘 쓰자"): `expo-symbols` 추가 — iOS SF Symbols `play.fill`·`pause.fill`, Android Material Symbols. 전체 플레이어(44pt, 누르는 자리 64 유지)·미니플레이어·전환 레이어 모두. **네이티브 모듈이라 rt 32 묶음 빌드에 싣는다**(rt 32 빌드가 아직 없어 runtimeVersion 은 그대로)
- 웹 미리보기는 SF Symbols 를 그리지 못한다 — 기호 모양은 iOS 실기기에서 확인
