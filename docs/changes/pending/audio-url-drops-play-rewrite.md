# 오디오 재생 URL — `/play/<contentId>` 재작성 폐기 (계정 SCP 제약)

| 항목 | 값 |
|---|---|
| 발행 날짜 | 2026-08-31 |
| 발행자 | BE (infra 브랜치) |
| 대상 문서 | `backend/domain.md` 5.1 · `backend/architecture.md` 9.4 · `features/partner-control.md` 4.3(확인만) |
| 관련 코드 | `backend/src/modules/playback/cloudfront-audio-url.signer.ts` · `modules/admin/` |

## 배경 — 강제된 변경이다

운영 AWS 계정이 조직(SW마에스트로 지원) 계정으로 확정됐는데(639177726357), 조직 **SCP가
CloudFront KeyValueStore 데이터 플레인(Get/Put/DescribeKeyValueStore)을 명시적 거부**한다
(정책 `p-5soyo0ar` — 실측 2026-08-31, CLI·EC2 인스턴스 롤 모두 거부). KVS에 `contentId → S3 키`
매핑을 넣을 수 없으므로 viewer-request Function의 `/play/<contentId>` 재작성안이 성립하지 않는다.

## 변경 내용

재생 URL이 **무작위 저장소 키를 직접 서명**하는 방식으로 바뀌었다.

| | 종전 (2026-08-30) | 현재 (2026-08-31) |
|---|---|---|
| 재생 URL | `https://<cdn>/play/<contentId>?<서명>` | `https://<cdn>/audio/<무작위 hex 32>.<ext>?<서명>` |
| 매핑 | CloudFront KVS + Function 재작성 | 없음 (서버가 `audio_path`로 직접 서명) |
| 회수 시 | 발급 중단 + KVS 키 삭제 | 발급 중단 + 기존 URL 5분 만료 소멸 |

## 문서에 반영해 달라

1. **`domain.md` 5.1** — "`audio_path`는 어떤 응답에도 실리지 않는다"의 **완화**:
   "응답 본문·목록에 실리지 않는다. 단 재생용 서명 URL의 경로에는 실린다 — 키가 무작위
   hex라 제목·순서 등 의미가 새지 않고, URL 자체가 5분 만료 서명이다." 원 규칙의 목적
   (제목 유출 방지·URL 재사용 방지)은 무작위 키 + 만료가 그대로 달성한다.
2. **`architecture.md` 9.4** — CloudFront 구현 설명에서 KVS·Function 서술 제거, 위 표의
   "현재" 열로 교체. 근거로 SCP 제약(`docs/infra/architecture.md` 3.2) 링크.
3. **`partner-control.md` 4.3** — 변경 불필요 확인: 처리 순서 2 "신규 발급 중단 + 기존
   발급분은 짧은 만료로 자연 소멸"이 이미 현재 구현과 일치한다(KVS 삭제는 추가 방어였음).

## 완료 조건

- Given 개정된 domain.md 5.1 / When `cloudfront-audio-url.signer.ts`와 대조한다 / Then 서명
  URL 경로에 `audio_path`가 실리는 것이 문서와 모순되지 않는다
- Given 회수된 콘텐츠 / When 회수 5분 뒤 기존 재생 URL을 연다 / Then 만료로 403이다
