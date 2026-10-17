# 에이전트 판정 — 절차와 기록 형식

> 글로벌판 명세 `PIPELINE.md` 6.10의 실행 절차. 2026-10-16 결정 — 팀에 영어 대본의 질을 판단할 사람이 없어, 한국판의 사람 판정(spec/09 3.1)을 에이전트 판정이 대신한다.
> 이 디렉토리는 `skills/`가 아니다 — DB `prompt_assets`로 시딩하지 않고, 판정을 돌리는 세션(파일럿은 Claude Code)이 직접 읽는다.

## 1. 구성

| 파일 | 읽는 쪽 | 역할 |
|---|---|---|
| `editor.md` | 원어민 편집자 에이전트 | 듣기 경험·영어 구어·말버릇·장면과 소리. 12항목 점수와 비평 플래그·⭐ 판정의 주인 |
| `korea-check.md` | 한국어·사실 검토 에이전트 | 발췌·claims 대조, 한국어 뜻·문화 맥락, 6.4 표기·2.1 배제·원칙 8·9. 필수 수정 재대조의 주인 |
| 이 문서 | 판정을 돌리는 세션 | 순서·병합·저장 |

- 모델은 대본·QA·비평(GPT)과 다른 계열인 Claude를 쓴다.
- 지시문은 모델이 읽는 글이다. 단문·기능 서술로 쓰고, 예시 문장을 넣지 않는다. 고친 이유는 이 문서 끝의 기록에 남긴다.

## 2. 순서

1. **입력 내려받기** — 글로벌 버킷에서 그 편의 `script.md`·`outline.md`·`script-notes.md`·`claims.md`·`sources.md`·`qa-report.md`·`pronunciations.json`·`critic-report-v2.md`를 작업 디렉토리로 받는다. 규칙은 `docs/ai/global/skills/`의 git 사본(활성 버전과 같은지 확인)을 쓴다.
2. **1차 — 눈가림** — 두 검토자를 따로 띄운다. 이때 `critic-report-v2.md`는 주지 않는다. 각자 1차 출력(3장)을 낸다.
3. **2차 — 비평 대조** — 같은 에이전트를 이어서 비평 리포트를 준다. 편집자는 플래그·⭐마다 동의 여부를 매기고, 한국어·사실 검토자는 사실·문화에 걸린 플래그에만 의견을 덧붙인다. 1차 점수는 고치지 않는다 — 고치고 싶으면 사유를 따로 적는다.
4. **병합** — 판정 세션이 두 출력을 합친다.
   - 플래그 판정이 서로 다르면 사실·문화 플래그는 한국어·사실 검토자 쪽을, 나머지는 편집자 쪽을 따르고 다른 쪽 의견을 사유 끝에 붙인다.
   - `must_fix`는 합집합이다. 같은 턴·같은 문제는 하나로 합친다.
   - `publishable`은 둘 다 `true`일 때만 `true`다. 사유는 둘을 이어 적는다.
   - 같은 턴에 두 검토자의 수정안이 있으면 하나로 합쳐 다시 쓰고, 3차 재대조에 넘긴다.
5. **필수 수정 반영** — `must_fix`의 수정안을 대본 턴에 반영한다(S3 덮어쓰기는 버저닝으로 이전 본이 남는다). `human_edits`에 `by: agent:<모델 id>`로 남긴다. 반영 뒤 L0를 다시 돌린다.
6. **3차 — 재대조** — 한국어·사실 검토자에게 수정된 턴만 다시 준다. 통과한 항목을 `fixed`로 넘긴다. 실패한 항목은 `open`으로 남기고 수정안을 다시 받는다. 두 번 실패하면 `publishable: false`로 내린다.
7. **저장** — 4장의 형식으로 `episodes.critic_verdicts`를 쓰고, 한국어 요약 리포트를 `agent-verdict.md`로 에피소드 산출물 옆에 올린다.
8. **보고** — 사용자에게 한국어로 요약을 보고한다: 발행 가능 여부, 필수 수정과 반영 결과, 규칙으로 올릴 후보.

`publishable`의 뜻은 **"필수 수정을 반영하면 발행해도 된다"**이다. 발행 버튼은 `publishable: true`이고 `must_fix`가 전부 `fixed`일 때만 열린다.

## 3. 검토자 출력 (JSON)

두 검토자 모두 마지막에 JSON 블록 하나를 낸다. 사유·문제 설명은 한국어, 대본 인용은 원문 그대로 쓴다.

```json
{
  "phase": 1,
  "scores": { "3.1": { "score": 0, "reason": "" } },
  "findings": [
    { "turn": "E14", "turns": ["E14", "E19"], "quote": "", "problem": "", "kind": "must_fix | should_fix | rule_note", "rule": "규칙 번호·명세 절·QA 항목, 없으면 없음", "evidence": "사실 지적이면 발췌·claims 인용" }
  ],
  "edits": [ { "turn": "E14", "after": "턴 전체 새 문장", "fixes": [0], "reason": "" } ],
  "other_changes": [ { "file": "script.md 소제목 | pronunciations.json", "before": "", "after": "", "fixes": [0], "reason": "" } ],
  "publishable": true,
  "publishable_reason": "",
  "summary_ko": ""
}
```

- `scores`는 편집자만 낸다. 항목 키와 만점은 `skills/critic/rubric-v2.md`의 12항목이다.
- `turns`는 여러 턴에 걸친 패턴일 때만 쓴다. `other_changes`는 턴 밖의 변경(소제목·발음 사전 표제어)이 있을 때만 쓴다.
- `findings[].kind`
  - `must_fix` — 발행 전에 반드시 고친다. 사실 오류, 오해를 부르는 뜻풀이, 깨진 영어, 명세 6.4·2.1·원칙 8·9 위반이 여기에 든다.
  - `should_fix` — 고치면 좋지만 발행을 막지 않는다.
  - `rule_note` — 이 편이 아니라 규칙·프롬프트·L0를 고칠 근거.
- `edits[].fixes`는 그 수정이 해결하는 `findings`의 순번이다. `must_fix`에는 수정안이 있어야 한다. 수정안을 만들 수 없는 `must_fix`(claims에 없는 재료가 필요하다)는 `edits` 없이 두고, `publishable: false`로 판단한다.
- 2차 출력(`"phase": 2`)은 `flags`·`stars`·`missed`를 낸다.
  - `flags`·`stars`는 `{ "<번호>": { "verdict": "동의 | 부분동의 | 비동의", "reason": "" } }` 형식이다.
  - `missed`는 비평이 놓친 문제다. 1차 `findings`의 순번 목록으로 낸다.
- 3차 출력(`"phase": 3`)은 `{ "results": [ { "id": "", "fixed": true, "reason": "" } ] }`이다.

## 4. 저장 형식 — `episodes.critic_verdicts`

사람 판정(판정 화면)과 같은 키를 쓰고, 에이전트 블록을 덧붙인다. 판정 화면이 그대로 읽는다.

```json
{
  "flags":  { "1": { "verdict": "동의", "reason": "" } },
  "stars":  { "1": { "verdict": "부분동의", "reason": "" } },
  "scores": { "3.1": { "human": "6", "reason": "" } },
  "extra": "비평이 놓친 문제 요약 (한국어)",
  "judged_by": "agent:claude-opus-5-5",
  "judged_at": "ISO 시각",
  "agent": {
    "publishable": true,
    "publishable_reason": "",
    "must_fix": [ { "id": "M1", "turn": "E14", "issue": "", "by": "editor | korea", "status": "open | fixed", "edit_at": "ISO 시각 또는 null" } ],
    "report_key": "s3:<에피소드 경로>/agent-verdict.md",
    "reviewers": { "editor": "editor.md 커밋", "korea": "korea-check.md 커밋" }
  }
}
```

- `scores.*.human`은 판정 화면 호환을 위해 이름을 그대로 둔다. 값은 에이전트 점수다. 사람 판정과는 `judged_by`로 가른다.
- 사람이 판정 화면에서 저장하면 `judged_by`가 사람 이메일로 바뀌고 `agent` 블록은 남는다. 발행 조건은 `agent` 블록만 본다.

## 5. 규칙 승격

- 판정 묶음(파일럿은 5편)마다 한국판과 같은 승격 절차를 밟는다. 원천은 플래그 동의율, 기각·부분동의 사유, `findings`의 `rule_note`, 에이전트 직접 수정이다.
- 비평이 틀린 것은 루브릭을 좁히고, 비평이 놓친 것은 guidelines·QA·L0를 신설한다.
- 승격 PR은 사람이 승인한다. 승격안은 한국어로 설명한다.

## 6. 기록

- 2026-10-17 korea-check — 템플릿 인사말(annyeonghaseyo·gamsahamnida)은 뜻풀이·말 단계 지적에서 뺀다(guidelines full-en-v0.7 규칙 48과 같은 예외). G261017-002·003 에서 같은 rule_note 가 반복됐고 템플릿 문구라 대본이 고칠 수 없다.

- 2026-10-16 첫 판 — G261015-001을 두 에이전트에게 검토시켰을 때 QA·비평이 놓친 문제를 찾았다(oppa의 화자 조건 누락, 반말 미표기, 장면·소리 부재). 그 두 역할을 그대로 지시문으로 옮겼다.
- 2026-10-16 시험 운용 반영 — 같은 편 1차 시험에서 두 검토자가 짚은 애매한 점 14개를 정리했다. 점수 기준은 수정 전 대본에 적용, `must_fix` 경계(뜻을 잘못 잡거나 놓치는 줄 · 범위 확대 · 로마자 표기), 여러 턴 패턴의 `turns`, 다른 턴 수정 허용, 턴 밖 변경의 `other_changes`, 규칙이 없으면 `없음`, 말 단계 표시 위치, 발췌 두 개를 엮는 수정 허용, 둘 다 `true`일 때만 발행 가능.
