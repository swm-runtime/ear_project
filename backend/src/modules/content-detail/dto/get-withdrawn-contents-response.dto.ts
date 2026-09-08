/**
 * 회수 동기화 응답 — 배열을 최상위로 두지 않는다(convention.md 5.3).
 * 클라이언트는 목록의 콘텐츠를 로컬 캐시·재생 세션에서 제거하고, 재생 중이면 멈춘다.
 */
export class GetWithdrawnContentsResponseDto {
  readonly content_ids: string[];
  /**
   * 상한에 걸려 잘렸을 때, **이어 받을 때 보낼 `since` 값**. 더 없으면 `null`이다.
   *
   * 발급됐다는 것 자체가 "아직 남았다"는 신호다 — 클라이언트는 `null`이 나올 때까지
   * 이 값을 `since`로 다시 부른다. 무시해도 다음 동기화에서 이어지므로 화면이 깨지지는 않는다.
   */
  readonly next_since: string | null;

  static from(result: {
    contentIds: string[];
    nextSince: string | null;
  }): GetWithdrawnContentsResponseDto {
    return { content_ids: result.contentIds, next_since: result.nextSince };
  }
}
