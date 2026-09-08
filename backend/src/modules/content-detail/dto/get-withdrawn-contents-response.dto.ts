/**
 * 회수 동기화 응답 — 배열을 최상위로 두지 않는다(convention.md 5.3).
 * 클라이언트는 목록의 콘텐츠를 로컬 캐시·재생 세션에서 제거하고, 재생 중이면 멈춘다.
 */
export class GetWithdrawnContentsResponseDto {
  readonly content_ids: string[];

  static from(contentIds: string[]): GetWithdrawnContentsResponseDto {
    return { content_ids: contentIds };
  }
}
