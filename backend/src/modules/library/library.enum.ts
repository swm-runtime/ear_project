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
 * library-api.md 4.1 — 상단 탭 4개. 서로 배타적이며 한 번에 하나만 선택된다.
 *
 * **`DRIP`의 화면 라벨은 [이어 PICK]이지만 전송 값은 `drip`이다.** 라벨은 화면 문구이고
 * 값은 `library_items.source`의 enum 값이다 — 탭 이름은 앞으로도 바뀔 수 있지만
 * `source` enum은 스키마다.
 */
export enum LibraryItemFilter {
  ALL = 'all',
  /** `unplayed` + `in_progress` — 듣다 만 것도 사용자에게는 아직 안 들은 것이다 */
  UNPLAYED = 'unplayed',
  COMPLETED = 'completed',
  /** `source = drip`. **상태를 가리지 않는다** */
  DRIP = 'drip',
}

/** `library_items.added_at` 기준 정렬 */
export enum LibraryItemSort {
  ADDED_DESC = 'added_desc',
  ADDED_ASC = 'added_asc',
}
