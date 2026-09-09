# [BE] `npm run lint`가 검사가 아니라 수정을 한다 — CI가 위반을 잡지 못한다

| 항목 | 값 |
|---|---|
| 대상 | `backend/package.json`의 `scripts.lint` |
| 요청 파트 | 백엔드 |
| 발행 날짜 | 2026-09-09 |
| 발견 시점 | `ci-runs-tests-before-api-deploy` 구현 중 — 배포 전 검증에 `npm run lint`를 넣으면서 스크립트를 열어 보다 발견 |
| 근거 문서 | `backend/convention.md` 7장(테스트) · `frontend/convention.md`의 lint 규약 |
| 심각도 | **하** — 지금 당장 깨지는 것은 없다. 다만 **CI에 lint 단계를 넣어 둔 의미가 절반 사라진다** |
| 상태 | 대기 |

## 문제

```json
"lint": "eslint \"{src,apps,libs,test}/**/*.ts\" --fix"
```

`--fix`가 붙어 있다. **자동 수정 가능한 위반을 고쳐 놓고 종료 코드 0으로 통과시킨다.**

로컬에서는 편한 기본값이다. 그런데 2026-09-09부터 `deploy-api.yml`의 검증 job이 이 스크립트를
그대로 부른다(`ci-runs-tests-before-api-deploy`). 러너에서는 고친 결과를 아무도 가져가지
않으므로, **자동 수정 가능한 위반은 CI에서 영원히 발견되지 않는다.** 잡히는 것은 수동 수정이
필요한 위반뿐이다.

CI의 lint는 **검사**여야 한다. 고치는 것은 개발자의 로컬에서 할 일이다.

## 요청 내용

`lint`를 검사 전용으로 두고, 고치는 것은 별도 스크립트로 가른다. 예:

```json
"lint": "eslint \"{src,apps,libs,test}/**/*.ts\"",
"lint:fix": "eslint \"{src,apps,libs,test}/**/*.ts\" --fix"
```

- **`deploy-api.yml`의 검증 job은 손댈 필요가 없다** — 같은 `npm run lint`를 계속 부르면 된다.
- 프론트엔드(`frontend/package.json`)의 `lint`도 같은 문제가 있는지 함께 확인한다.
- 바꾼 직후 첫 CI에서 **그동안 가려져 있던 위반이 한꺼번에 드러날 수 있다.** 그 정리까지가
  이 티켓의 범위다.

## 완료 조건

- Given 자동 수정 가능한 lint 위반이 있는 커밋 / When CI 검증 job이 돈다 / Then **실패한다**
- Given 같은 위반 / When 로컬에서 `npm run lint:fix`를 돌린다 / Then 고쳐진다
- Given 저장소 현재 상태 / When `npm run lint`를 돌린다 / Then 통과한다(가려져 있던 위반이 남아 있지 않다)
