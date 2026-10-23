# 재발행 — 오디오를 바꾸지 않으면 재생 위치를 지우지 않고 `content_version`도 올리지 않는다

| 항목 | 값 |
|---|---|
| 대상 문서 | `docs/spec/api/admin-api.md` 4.10 · `docs/spec/api/player-api.md` 4.1·4.3 · `docs/backend/domain.md` 5.1 · `docs/features/admin.md` 4.3 · `docs/features/player.md` 7 · `docs/spec/api/library-api.md` 4.x(`content.content_version` 필드 설명) |
| 요청 파트 | 백엔드 |
| 발행 날짜 | 2026-10-20 |
| 기한 | 2026-10-23 (Low — 이번 주 금요일. 코드는 이미 반영됨 — 문서가 코드보다 늦다) |
| 선행 | 없음. 코드 반영: `tickets/backend/archive/republish-thumbnail-keeps-progress.md`(KAN-236) — PR `fix(be): keep playback progress on non-audio republish` |
| 발견 시점 | KAN-236 구현 — 시리즈 썸네일 일괄 교체(KAN-229 운영 시리즈 스위치 시점) 준비 |

## 배경

지금 문서는 재발행이 **어떤 파트든**(추천 메타·대본 단독 전송 제외) `content_version`을 1 올리고 그 콘텐츠의 `playback_progresses`를 전부 지운다고 적는다(admin-api 4.10 "재생 위치 폐기" — 2026-09-07 안 A). 위치 폐기의 목적은 **같은 초가 다른 내용을 가리키게 되는 재발행**(콜드오픈 폐지·재편집)에서 낡은 위치가 내려가는 것을 막는 것인데, 썸네일·제목만 바꿔도 똑같이 지워졌다. 시리즈 썸네일 교체(CS 16편·경제 상식 12편부터, 30~46편)를 하면 오디오가 그대로인데 듣던 위치가 전부 0으로 돌아간다.

KAN-236으로 서버를 다음과 같이 바꿨다.

- **오디오(`audio`·`audio_aac`·`audio_lossless`)를 바꾸지 않는 재발행은 재생 위치를 지우지 않고 `content_version`도 올리지 않는다.** 썸네일·제목·설명·출처명·출처·주제만 바꾸는 경우다. 추천 메타·대본 단독 전송이 이미 따르던 규칙과 같다 — **버전은 "같은 초가 같은 내용인가"의 표지**가 된다.
- 오디오를 바꾸는 재발행은 종전대로 버전 +1 · 위치 전부 삭제 · (유효한 `script_file`이 없으면) 대본 삭제 · 임베딩 미갱신이다.
- 감사 로그는 종전처럼 `content.republish`(이전·이후 `content_version`·`changed_parts`)로 남는다 — 오디오 미변경이면 이전·이후 버전이 같다.

### 버전을 올리지 않기로 한 근거 (올리고 삭제만 건너뛰는 안을 버린 이유)

| 쓰는 곳 | 버전을 올리면 | 올리지 않으면 |
|---|---|---|
| 앱 재생 중 감지(`playback.service.ts` — URL 갱신·위치 저장 응답의 버전 대조) | **재생 중이던 사람의 세션 위치를 0으로 폐기하고 0초로 시크한다** — 서버가 위치를 남겨도 앱이 지운다. 설치된 1.1.0·1.2.x 모두 이 코드를 갖고 있다(2026-09-08 도입) | 아무 일도 없다 — 이어서 재생된다 |
| 위치 저장 버전 가드(player-api 4.3) | 재생 중 세션의 다음 저장 1회가 버려진다 | 그대로 저장된다 |
| 임베딩(`has_current_embedding` — 버전 일치 조건) | 승계 갱신이 필요했다(2026-10-13 `carryVersionForward`) | 버전이 같으니 그대로 일치 — 승계 코드가 필요 없어 지웠다 |
| 대본(`content_scripts`) | 버전과 무관(콘텐츠당 1행) | 같다 |
| 썸네일 캐시 | 버전과 무관 — 업로드마다 **새 무작위 키**라 URL 자체가 바뀐다(CloudFront·앱 캐시 1년 `immutable`도 새 URL이라 문제없다. `reprocess-thumbnails.ts`도 같은 이유로 버전을 올리지 않는다) | 같다 |
| 서명 URL·서버 캐시 | 버전을 키로 쓰는 곳 없음 | 같다 |
| 운영→개발계 콘텐츠 동기화(`sync-content-export.sh`) | 지문이 표별 `count`·`max(updated_at)` — 버전을 보지 않는다. 썸네일·제목 교체는 `contents.updated_at`, 주제·출처 교체는 새 행의 `updated_at`이 바꾼다 | 같다 |
| 오프라인 저장(P1 — `offline-download.md`) | 오디오가 같은데 파일 재다운로드를 안내하게 된다 | 파일이 유효한 채 남는다 |

"올리고 삭제만 건너뛰는" 안은 서버의 행은 남겨도 **재생 중이던 앱이 스스로 위치를 0으로 돌려** 요청 목적(이어 듣기 보존)을 달성하지 못한다. 그래서 버전을 올리지 않는다.

## 수정 내용

### 1. `admin-api.md` 4.10

| 위치 | 현재 | 바꿀 것 |
|---|---|---|
| 1장 범위 목록(19행)·3장 엔드포인트 표(57행) | 재발행 — 오디오·메타 교체, `content_version` 증가 | 재발행 — 오디오·메타 교체, **오디오를 바꾸면** `content_version` 증가 |
| 4.10 첫 문단 | 오디오(또는 메타)를 같은 행에서 교체하고 `content_version`을 1 올린다 | …같은 행에서 교체한다. **오디오를 바꾸면 `content_version`을 1 올린다**(KAN-236) |
| `content_version` 불릿 | **파트가 무엇이든 1 증가**한다. 메타만 바뀌어도 올린다 … 예외는 `enrichment_file`·`script_file`만 보내는 전송이다 | **`content_version`은 오디오(`audio` — 3종 한 세트)를 바꿀 때만 1 오른다**(개정 2026-10-20, KAN-236). 썸네일·`payload`(제목·설명·출처명·주제·출처)·`enrichment_file`·`script_file`만 보내는 전송은 버전을 올리지 않고 아래 재생 위치 폐기도 없다 — 오디오가 그대로면 같은 초가 같은 내용이다. 버전은 클라이언트에게 "오디오가 바뀌었다"는 신호이고(`player-api.md` 4.1·4.3 — 바뀌면 재생 중 세션 위치를 폐기한다), 메타만 바꾼 재발행에서 올리면 재생 중이던 사람의 위치가 0으로 돌아간다. 추천 메타·대본 단독 전송의 감사 로그(`content.enrich`·`content.script`) 구분은 그대로이고, 썸네일·메타가 섞인 전송은 `content.republish`로 남는다(이전·이후 버전이 같을 수 있다) |
| 응답 문장 | 200으로 갱신된 `AdminContentItem`(증가한 `content_version` 포함) | 200으로 갱신된 `AdminContentItem`(오디오를 바꿨으면 증가한 `content_version`) |
| 흐름 | 트랜잭션(행 갱신 + `content_version + 1` + 주제·출처 교체) | 트랜잭션(행 갱신 + **오디오 교체 시** `content_version + 1` · 재생 위치 삭제 + 주제·출처 교체) |
| "재생 위치 폐기" 절 | 재발행 트랜잭션에서 그 콘텐츠의 `playback_progresses`를 전부 삭제한다 | **오디오를 바꾸는** 재발행 트랜잭션에서 … 전부 삭제한다. 절 끝에 불릿 추가: "**오디오를 바꾸지 않는 재발행(썸네일·메타만)은 지우지 않는다**(개정 2026-10-20 — KAN-236). 같은 초가 같은 내용이라 낡은 위치가 생기지 않는다 — 시리즈 썸네일 교체가 수십 편의 이어 듣기를 0으로 돌리던 문제" |
| 8장 `has_current_embedding` 설명 끝 | 오디오를 바꾸지 않는 재발행(썸네일·제목 등)은 서버가 임베딩을 새 버전으로 승계해 true가 유지된다 | 오디오를 바꾸지 않는 재발행(썸네일·제목 등)은 버전이 오르지 않아 true가 유지된다 |

### 2. `player-api.md`

- **4.1 `content.content_version` 필드 설명** — "재발행 후 낡은 위치는 서버가 이미 폐기했으므로"를 "**오디오를 바꾼 재발행 후** 낡은 위치는 서버가 이미 폐기했으므로"로. 끝에 한 줄: "**버전은 오디오가 바뀔 때만 오른다**(`admin-api.md` 4.10 — 2026-10-20). 썸네일·제목만 바뀐 재발행에서는 그대로라 재생 중 세션도 그대로 이어진다."
- **4.3 서버 처리 2** — "재발행 전 버전에서 계산된 위치가 새 오디오에 씌워지는 것을 막는다"는 그대로 맞다(버전이 오디오와 같이 움직이므로). 수정 없음.

### 3. `domain.md` 5.1 `content_version` 항

- "**`content_version`은 같은 행의 값을 증가시킨다.**" 뒤에 "**오디오를 바꾸는 재발행에서만 오른다** — 썸네일·메타만 바꾸면 그대로다(2026-10-20, KAN-236 — `admin-api.md` 4.10)."
- 하위 불릿 "클라이언트는 `content_version`이 올라간 것을 보고 저장한 재생 위치·오프라인 파일을 폐기한다(`player.md` 7)" — 그대로 둔다(버전이 오디오와 같이 움직이므로 이제 정확해졌다). 위치 폐기의 주체가 서버라는 점은 `player.md` 7 서술과 맞추는 것으로 충분하다.
- 6.2 `playback_progresses`에는 재발행 삭제 규칙이 적혀 있지 않다(grep 확인) — 수정 없음.

### 4. `features/admin.md` 4.3

- "오디오나 메타를 고칠 때 새 행을 만들지 않고 같은 행의 `content_version`을 올린다" → "…같은 행을 갈아끼운다. **`content_version`은 오디오를 바꿀 때만 올린다**"
- 완료 조건에 한 줄 추가: "Given 재생 위치가 있는 발행 콘텐츠 / When 썸네일만 바꿔 재발행한다 / Then `content_version`과 재생 위치가 그대로고 새 `thumbnail_url`이 내려간다"

### 5. `features/player.md` 7 · `library-api.md` `content.content_version`

- `player.md` 217행 "콘텐츠가 재발행되어 오디오가 교체됨" — 서술은 맞다. "재발행은 `content_id`를 유지한 채 `content_version`만 올린다" 뒤에 "(오디오를 바꾼 재발행만 — 썸네일·메타만 바꾸면 버전도 위치도 그대로다)"를 덧붙인다.
- `library-api.md` 213행 "재발행 판정용. 올라갔으면 …" — "**오디오를 바꾼** 재발행 판정용"으로.

### 참고 — 파이프라인 웹 문구(코드, AI 파트)

문서가 아니라 코드라 이 요청의 범위 밖이지만, 파이프라인 웹이 "메타만 바꿔도 `content_version`이 오른다"고 안내한다 — `pipeline/apps/web/app/publish/[id]/page.tsx`(확인 대화상자 "v→v+1 로 올라가요"·버튼 "(v+1)") · `stale-republish.tsx` 주석 · `republish-button.tsx` 주석 · `lib/ear.ts` 199행 주석. 동작에는 영향이 없다(응답의 `content_version`을 그대로 기록하고, "콘솔 밖 재발행" 판정은 버전이 **올랐을 때만** 켜진다). 문구 정리는 AI 파트에 전달한다.

## 완료 조건

- Given `admin-api.md` 4.10 / When "재생 위치 폐기" 절을 읽는다 / Then 오디오를 바꾸지 않는 재발행은 위치를 지우지 않는다는 예외가 적혀 있다
- Given `admin-api.md` 4.10 / When `content_version` 불릿·응답·흐름을 읽는다 / Then 버전은 오디오를 바꿀 때만 오른다고 적혀 있고 "파트가 무엇이든 1 증가" 문구가 없다
- Given `player-api.md` 4.1 / When `content.content_version` 설명을 읽는다 / Then 버전이 오디오 교체 때만 오른다는 것과 그 근거 문서(4.10)가 적혀 있다
- Given `domain.md` 5.1 · `features/admin.md` 4.3 / When `content_version` 항을 읽는다 / Then 오디오 교체에서만 오른다고 적혀 있다

## 처리 기록

- 2026-10-20 발행(백엔드 — KAN-236 구현과 함께). 코드는 같은 날 PR로 반영됐다 — 이 요청은 문서를 코드에 맞추는 것이다.
- **2026-10-23 반영**(통합 브랜치 `docs(be)/apply-pending-changes`) — 대상 문서 전부 반영, 코드와 대조. 반영 날짜 2026-10-23.
