# [AI] 글로벌 6 — 글로벌 인스턴스 인프라: Supabase 프로젝트·S3 버킷·스키마·주제 시딩·글로벌 콘솔·서버 워커

| 항목 | 값 |
|---|---|
| 대상 | 두 번째 Supabase 프로젝트(`schema.sql` + 마이그레이션 전부) · 글로벌 S3 버킷·버킷 정책 · `topics` 8개 시딩 · `settings`(자동 승인 끔·발행 준비 연쇄 끔·템플릿) · 글로벌 콘솔 배포(서브도메인) · 서버 워커 두 번째 프로세스(`PIPELINE_LOCALE=en` · `CAPABILITIES=ai,io` · OpenAI 실행기) |
| 요청 파트 | AI 파이프라인 |
| 요청자 | 박수헌 |
| 담당 | 박수헌 |
| 발행 날짜 | 2026-10-14 |
| Jira | [KAN-208](https://runtime364.atlassian.net/browse/KAN-208) |
| 시작 날짜 | 2026-10-14 |
| 기한 | 2026-10-17 (Medium) |
| 선행 | 없음. 사람 손: **Supabase Free 플랜에서 두 번째 프로젝트 가능 여부 확인**(안 되면 비용 0 원칙의 예외 결정 — 명세 10장 #13) · **AI 서버(t4g.small) 메모리 여유 확인**(콘솔 동거 여부 — #10) · 서버 env·SG·DNS 변경은 사용자가 직접 실행 |
| 관련 | [KAN-201](https://runtime364.atlassian.net/browse/KAN-201) `PIPELINE_LOCALE` 분기 — 워커는 분기가 들어간 코드로 띄운다 · [KAN-202](https://runtime364.atlassian.net/browse/KAN-202) 생산이 이 티켓에 막힌다 · 에픽 [KAN-186](https://runtime364.atlassian.net/browse/KAN-186) |
| 근거 문서 | **`docs/ai/global/PIPELINE.md` 4.1·4.4·8장·9장 G1** |
| 심각도 | 중 |
| 중요도 | Medium |
| 상태 | 대기 |

## 문제

글로벌판은 한국판과 **코드는 공유하고 인스턴스는 분리**한다(명세 4.2). 한국판 DB·버킷·자산에 글로벌 행을 넣지 않으므로, 글로벌 인스턴스가 쓸 DB·버킷·콘솔·워커가 따로 있어야 한다. 묶음 티켓을 나눌 때 이 작업이 어느 티켓에도 들어가지 않았다.

## 요청 내용

1. **DB** — 별도 Supabase 프로젝트에 한국판과 같은 스키마(`schema.sql` + 마이그레이션 전부)를 적용한다.
2. **저장소** — 별도 S3 버킷. 한국판과 같은 계정·자격증명 모델(EC2 인스턴스 역할 · 웹 서명 URL), 버킷 정책만 추가한다.
3. **시딩** — `topics` 8개(명세 2장 — 이름·slug), `settings.automation.auto_approve` 끔, 비평 뒤 발행 준비 연쇄 끔(명세 7장 파일럿).
4. **글로벌 콘솔** — 주소 **`admin-global.earcast.co.kr`**(2026-10-14 확정). 같은 EC2에 둘지는 메모리 여유를 보고 정한다.
   - DNS: `admin-global` A 레코드를 AI 서버 고정 IP로 추가(사용자 실행)
   - 코드: Caddyfile에 글로벌 사이트 블록, compose에 글로벌 콘솔·워커 서비스, 서버에 글로벌 env 파일
   - GCP: 구글 로그인 "승인된 JavaScript 원본"에 `https://admin-global.earcast.co.kr` 등록
   - env: 알림 링크 기본 URL은 새 주소, 발행 SSO 키는 한국판과 같은 값(발행처가 같은 제품 서버)
   - 화면 상단에 `GLOBAL` 표시(분기는 KAN-201)
5. **서버 워커** — 글로벌 인스턴스 env로 두 번째 워커 프로세스를 띄운다(`PIPELINE_LOCALE=en` · `CAPABILITIES=ai,io` · OpenAI 실행기). 한 워커는 한 인스턴스만 본다. 노트북 워커는 두지 않는다(명세 4.4).
6. 알림 — Slack `#dev-ai` 공유, 큐 비움 요약 머리에 `[GLOBAL]`.

## 완료 조건

- Given `https://admin-global.earcast.co.kr` / When 구글 로그인한다 / Then 한국판과 다른 DB의 빈 백로그와 주제 8개가 보이고, 상단에 `GLOBAL` 표시가 있다
- Given 글로벌 서버 워커 기동 / When 저장소 접근 확인이 돈다 / Then 글로벌 버킷 읽기·쓰기가 통과하고 한국판 버킷에는 쓰지 않는다
- Given 글로벌 `settings` / Then 자동 승인과 발행 준비 연쇄가 꺼져 있다
- Given 한국판 콘솔·워커 / Then 글로벌 인스턴스를 띄운 뒤에도 동작이 같다

## 처리 기록
- 2026-10-14 발행 — 묶음 티켓 분할(KAN-200~204)에서 빠진 명세 G1 작업을 따로 뗐다.
- 2026-10-14 콘솔 주소 확정: `admin-global.earcast.co.kr`(하위 도메인 방식, 경로 방식은 쓰지 않음).
