# 구독 UI 노출 조건 — Android 운영 플래그 on

| 항목 | 값 |
|---|---|
| 대상 문서 | `spec/uiux/subscription-uiux.md` 2장 노출 조건 표(플랫폼 행) · 같은 문서 "남은 것" Android(2단계) 항목 |
| 요청 파트 | 프론트엔드 |
| 발행 날짜 | 2026-10-14 |
| 시작 날짜 | 2026-10-14 |
| 기한 | 2026-10-16 (Low — 이번 주 안) |
| 선행 | 없음 |
| 중요도 | Low — 문서의 현재값 표기만 바뀐다(규칙은 그대로) |
| 반영 날짜 | 2026-10-14 |

## 바뀐 것 (코드 반영 완료)

- `EXPO_PUBLIC_SUBSCRIPTION_ANDROID` 운영(production) 값 `off` → **`on`**(2026-10-14, KAN-174). 운영 Play 정기 결제 2개가 생성·활성되고 운영 `plans.store_product_id_android` 에 등록돼(2026-10-12, 박준현) 라이선스 테스터 종단 테스트를 위해 FE 가 열었다. `eas.json` production 과 `eas-update.yml` main 채널 둘 다 `on`.
- 노출 규칙(세 겹: 빌드 플래그 · 결제 네이티브 모듈 유무 · 플랫폼 플래그)은 그대로다. 운영 Android 에서 결제 모듈이 없는 옛 바이너리(rt 31 이하)는 여전히 숨겨진다.

## 문서에 옮겨 적을 것

- subscription-uiux.md 2장 플랫폼 행: "운영(production) `off`(운영 Play 상품 등록 KAN-130 전까지)" → "운영 `on`(2026-10-14 — 운영 Play 상품 등록 뒤, KAN-174)".
- 같은 문서 "남은 것" Android(2단계): Play 상품 ID 확정·`on` 전환은 끝났다고 표시하고, 오퍼 토큰·교체 모드 실기기 확인은 KAN-174 결과로 닫는다.

## 완료 조건

- Given 문서 반영 후 subscription-uiux.md 2장, When 플랫폼 행을 읽으면, Then 개발계·운영 모두 Android 플래그 `on` 이고 전환 날짜·사유(KAN-174)가 적혀 있다

## 처리 기록

- 2026-10-14 반영 — `spec/uiux/subscription-uiux.md` 2장 노출 조건 표 플랫폼 행(운영 `on`, 2026-10-14 KAN-174) · 7장 미결 Android(2단계) 항목(상품 ID·on 전환 완료, 오퍼 토큰·교체 모드 확인은 KAN-174 로 닫음).
