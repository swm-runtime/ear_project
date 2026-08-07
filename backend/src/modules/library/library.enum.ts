/** domain.md 6.1 — 어느 경로로 라이브러리에 들어왔는가 */
export enum LibraryItemSource {
  DRIP = 'drip',
  SAVE = 'save',
  ONBOARDING = 'onboarding',
}

export enum LibraryItemStatus {
  UNPLAYED = 'unplayed',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
}

/**
 * library-api.md 4.1 — 상단 탭 3개. 서로 배타적이며 한 번에 하나만 선택된다.
 *
 * **상태만 가른다.** 출처는 `LibraryItemSourceFilter`가 맡는다 — 두 축이 한 enum에서
 * 배타적으로 경쟁하면 "미청취 + 이어 PICK" 같은 AND 조합을 표현할 수 없다.
 */
export enum LibraryItemFilter {
  ALL = 'all',
  /** `unplayed` + `in_progress` — 듣다 만 것도 사용자에게는 아직 안 들은 것이다 */
  UNPLAYED = 'unplayed',
  COMPLETED = 'completed',
}

/**
 * library-api.md 4.1 — 필터 시트의 출처 섹션. 단일 선택이며 미선택(`null`)은 출처를
 * 가리지 않는다.
 *
 * **화면 라벨은 [이어 PICK] · [내가 담은 콘텐츠]이지만 전송 값은 `drip` · `save`다.**
 * 라벨은 화면 문구이고 값은 `library_items.source` 계열 값이다(domain.md 6.1) — 라벨은
 * 앞으로도 바뀔 수 있지만 `source` enum은 스키마다.
 */
export enum LibraryItemSourceFilter {
  /** `source = drip` */
  DRIP = 'drip',
  /**
   * `source IN (save, onboarding)` — **온보딩 적립분을 포함한다.**
   * 온보딩의 [담기]도 사용자가 직접 고른 것이며, `onboarding`을 따로 기록하는 것은
   * 유입 경로 분석용이지 제3의 출처를 보여주기 위해서가 아니다.
   */
  SAVE = 'save',
}

/** `library_items.added_at` 기준 정렬 */
export enum LibraryItemSort {
  ADDED_DESC = 'added_desc',
  ADDED_ASC = 'added_asc',
}
