# [BE] 관리자 업로드가 파일 전량을 메모리에 버퍼링한다 (200MB×3 — 단일 EC2 OOM 여지)

| 항목 | 값 |
|---|---|
| 대상 | `backend/src/modules/admin/admin.controller.ts`(`FileFieldsInterceptor` 설정) · `audio-probe.ts` · `content-storage.client.ts` 구현 2종 |
| 요청 파트 | 백엔드 |
| 발행 날짜 | 2026-09-09 |
| 발견 시점 | 백엔드 전수 감사 — 성능 층위 |
| 근거 문서 | `features/admin.md` 3.1 · `features/backend-monitoring.md`(자원 알림 CPU 70%·메모리 80%) |
| 심각도 | **하** — 관리자 1인·저빈도. 다만 200MB 오디오 업로드 한 번이 자원 알림을 울릴 수 있다 |
| 상태 | 대기 |

## 문제

`FileFieldsInterceptor`에 `storage` 미지정 → multer 기본 **메모리 스토리지**. 오디오(≤200MB)·썸네일·
enrichment 파일이 통째로 램에 올라가고, 오디오 버퍼는 `AudioProbe`(길이 추출)와 S3 `PutObject`가 동시에
보유해 요청당 수백 MB가 된다. 단일 EC2(메모리 4GB)에서 동시 업로드 2건이면 위험 구간.

또한 `fileSize` 한도가 **공용 200MB** 하나라 썸네일(5MB 규격)·enrichment(1MB 규격)도 200MB까지 받은 뒤
서비스에서 거부한다 — 검증이 늦다.

## 요청 내용

1. multer **디스크 스토리지**(`/tmp`)로 전환 — `UploadedFileInput`을 buffer → 경로 기반으로 바꾸고
   `AudioProbe`는 파일 경로에서 읽기, 스토리지 클라이언트는 스트림 업로드(`@aws-sdk/lib-storage` `Upload`).
   처리 후 임시 파일 삭제(실패 경로 포함).
2. 파일별 `fileSize` 분리 — 필드별 `limits`가 안 되는 multer 특성상, 인터셉터 한도는 최대값(200MB)으로 두되
   **파일 도착 즉시** 서비스 진입 전에 필드별 상한을 검사해 거부.
3. `MAX_*_FILE_BYTES` 상수는 그대로(`admin.constant.ts`).

## 완료 조건

- Given 200MB 오디오 업로드 / When 처리 중 프로세스 메모리를 본다 / Then 파일 크기만큼 증가하지 않는다(스트리밍)
- Given 6MB 썸네일 / When 업로드한다 / Then 400 `VALIDATION_FAILED`(`details.field = thumbnail`)이 서비스 진입 전에 나온다
- Given 처리 실패(검증·저장 어느 단계든) / When 요청이 끝난다 / Then `/tmp`에 임시 파일이 남지 않는다

## 처리 기록 (반영 날짜: 2026-09-09)

요청 1~3 전부 반영했다.

- multer `diskStorage(os.tmpdir())`로 전환. `UploadedFileInput`은 `buffer` → `path`. `AudioProbe`는 `parseFile`로
  파일에서 직접 읽고, S3 클라이언트는 `@aws-sdk/lib-storage`의 `Upload`(멀티파트 스트림), local 클라이언트는 `copyFile`.
  추천 메타 파일은 상한(1MB) 검사를 통과한 뒤에만 `readFile`한다.
- 컨트롤러가 요청 종료 시(성공·실패 모두) 임시 파일을 `rm`한다. 필드별 상한(썸네일 5MB·추천 메타 1MB)은
  서비스 진입 전 `assertFileSizes`가 400 `VALIDATION_FAILED`(`details.field`)로 거부한다. 상수는 그대로.
- 로컬 실측(local 모드): 정상 업로드 201·`duration_sec` 디스크에서 추출·저장소에 원본 크기 그대로 복사 /
  6MB 썸네일 → 400 `field=thumbnail` / 썸네일 누락·서비스 검증 실패·재발행 어느 경로에서도 `/tmp` 잔여 0.
  **메모리 증가량 실측은 못 했다**(로컬 표본 500KB) — 스트리밍 경로 자체는 코드로 보장. S3 `Upload` 경로는 실서버 첫 업로드 때 확인 필요.
