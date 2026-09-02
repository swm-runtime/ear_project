---
name: doc-sync
description: 문서 정합화 캐스케이드 — docs/features 전체를 기준으로 prd/ear_root_prd.md → backend/domain.md를 순차 최신화한 뒤, 사용자가 선정한 화면의 spec/api·spec/uiux·wireframe을 병렬로 최신화할 때 사용
arguments: [screen]
argument-hint: [화면 이름 (예: profile) — 생략 시 진행 중 확인]
---

# 문서 정합화 캐스케이드 — features 기준

## 원칙

- **기준은 `docs/features/`다. features 문서는 수정하지 않는다.** features 자체의 오류·문서 간 모순을 발견하면 고치지 말고 사용자에게 보고한다.
- 이 스킬의 호출은 `docs/prd/ear_root_prd.md`·`docs/backend/domain.md`·`docs/spec/*`·`docs/wireframe/*` 수정에 대한 명시적 요청으로 간주한다. 그 외 문서는 참조만 한다.
- **결정이 필요한 충돌은 모아두지 않고 발견 즉시 AskUserQuestion으로 묻는다.** 기계적으로 확정되는 수정은 묻지 않고 진행한다.
- 커밋·푸시는 하지 않는다.

## 절차

### 1. PRD 최신화 (features 전체 기준)

1. `docs/features/` 전체 문서와 `docs/prd/ear_root_prd.md`를 대조한다. `features/README.md`의 결정표(확정 사항 목록)를 먼저 읽어 판단 기준으로 삼는다.
2. features에서 확정된 규칙과 어긋나는 FR·정책 서술을 찾아 PRD를 갱신한다. 개정한 항목에는 `(개정 YYYY-MM-DD)`를 표기한다.
3. features 쪽이 틀렸다고 판단되는 경우는 PRD를 features에 맞추지 말고 사용자에게 묻는다.

### 2. domain.md 최신화 (features + 최신화된 PRD 기준)

1. features 전체의 "데이터 모델" 절과 "백엔드 전달" 주석을 추려 **스키마 영향 목록**을 만든다.
2. `docs/backend/domain.md`를 이 목록 및 1단계 결과와 대조해 갱신한다.
3. 신규 테이블·컬럼·enum 값이 필요해지면 임의로 추가하지 말고 먼저 사용자에게 묻는다 (domain.md는 스키마의 유일한 기준).
4. 스키마 결정이 안 된 항목은 domain.md 15장(결정 항목)에 등재하고, 등재 사실을 사용자에게 알린다.

### 3. 대상 화면 확인

- `$screen` 인자가 있으면 그 화면을 대상으로 한다.
- 없으면 이 시점에 AskUserQuestion으로 어떤 화면을 최신화할지 묻는다 (복수 선택 가능).

### 4. spec·wireframe 병렬 최신화 (선정 화면만)

기준은 `docs/features/$screen.md` 하나로 좁힌다. Agent 도구로 **3개 에이전트를 한 메시지에서 동시에 백그라운드로** 실행한다. 공통 지시:

- 표의 대상 파일 1개만 수정한다. 다른 화면 파일은 건드리지 않는다.
- 판단이 필요한 항목은 수정하지 말고 최종 보고에 **질문 목록**으로 반환한다.
- 다른 에이전트가 나머지 산출물을 병렬로 고치고 있다. **다른 파일의 낡은 상태를 근거로 "미반영·동기화 필요" 기록을 새로 남기지 않는다** (마감 패스에서 일괄 처리).

| 에이전트 | 대상 파일 | 추가 지시 |
|---|---|---|
| api | `docs/spec/api/$screen-api.md` | 2단계 반영이 끝난 domain.md + features 기준으로 엔드포인트·요청/응답 DTO·에러 코드 갱신 |
| uiux | `docs/spec/uiux/$screen-uiux.md` | 화면 ID·상태·접근성 갱신. 사용자 노출 카피는 features 문서와 1:1 대조 |
| wireframe | `docs/wireframe/$screen.html` | uiux 화면 ID 체계와 대응하도록 갱신. 미결 사항은 html의 검증 섹션에 기록 |

에이전트가 도는 동안 질문 목록이 반환되면 즉시 사용자에게 묻고, 답은 SendMessage로 해당 에이전트에 전달하거나 완료 후 직접 반영한다. 화면이 여러 개면 화면별로 같은 구성을 반복한다.

### 5. 마감 패스

1. 세 산출물이 모두 끝나면 상호 참조를 점검한다 — 병렬 작업 탓에 남은 낡은 "미반영/동기화 필요" 표기를 `~~...~~ → 완료(YYYY-MM-DD)` 형식으로 마감한다.
2. 최종 보고에 포함한다: PRD·domain 반영 항목 / 사용자 결정으로 확정된 항목 / 미결 항목과 그 기록 위치(wireframe 검증 섹션·domain 15장).
