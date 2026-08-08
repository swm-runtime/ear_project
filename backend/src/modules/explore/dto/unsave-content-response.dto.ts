/**
 * explore-api.md 4.4.
 *
 * **`client_seq` 하나뿐이다.** 영구 제외 사실을 응답으로 알리지 않으며(`library.md` 4.5 —
 * 가벼운 조작에 무거운 고지를 붙이지 않는다), 해제 대상이 없던 경우와 실제로 해제된 경우를
 * 구분해 주지도 않는다 — 클라이언트 동작이 같고, 구분하면 남의 라이브러리 구성을 탐지할
 * 여지가 생긴다.
 */
export class UnsaveContentResponseDto {
  readonly client_seq: number;

  static from(clientSeq: number): UnsaveContentResponseDto {
    return { client_seq: clientSeq };
  }
}
