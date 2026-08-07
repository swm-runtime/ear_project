/**
 * library-api.md 4.1 — 무한 스크롤 한 페이지 크기. **상한은 서버가 강제한다**
 * (architecture.md 9.3 — 클라이언트가 `limit`을 무제한으로 지정할 수 없게 한다).
 */
export const DEFAULT_LIBRARY_PAGE_SIZE = 20;
export const MAX_LIBRARY_PAGE_SIZE = 50;

/**
 * 주제 필터로 한 번에 보낼 수 있는 주제 수의 상한.
 *
 * 화면에서 고를 수 있는 주제는 라이브러리에 담긴 콘텐츠의 주제 전부라 상한이 없지만,
 * 서버는 `IN` 절이 무한정 길어지지 않게 막는다(architecture.md 9.3 — 목록 조회의 상한은
 * 서버가 강제한다). 중분류 주제 규모를 크게 웃도는 값이라 정상 사용에는 걸리지 않는다.
 */
export const MAX_LIBRARY_TOPIC_FILTER_SIZE = 50;

/**
 * `library.md` 4.4 — 완청 기준은 **최대 도달 위치가 콘텐츠 길이의 90% 이상**이다.
 *
 * `position_sec`이 아니라 `max_reached_sec`으로 판정한다 — 시크로 끝까지 점프한 것은
 * 완청이 아니고, 2배속으로 끝까지 들은 것은 완청이다(`player.md` 4.4).
 *
 * 기준값의 소유자는 `library.md`이며 여기서 바꾸지 않는다(PRD 10 완청률 지표와 연결).
 */
export const COMPLETION_REACHED_RATIO = 0.9;
