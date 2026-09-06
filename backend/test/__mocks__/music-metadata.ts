/**
 * E2E 전용 `music-metadata` 대역.
 *
 * `music-metadata@11`은 `"type": "module"`이고 `exports`에 `require` 조건이 없다. Node 24의
 * `require(esm)`은 `module-sync`로 읽어 런타임(`nest build`·`start:dev`)은 정상이지만,
 * CommonJS로 도는 jest(ts-jest)는 해석하지 못한다. `AppModule`을 통째로 올리는 E2E는
 * `admin.module` → `audio-probe`를 거치므로 스위트가 시작조차 못 한다.
 *
 * 이 대역은 `test/jest-e2e.json`의 `moduleNameMapper`로만 연결된다 — 운영 코드와 단위 테스트
 * 설정은 건드리지 않는다. E2E는 관리자 업로드의 오디오 길이 추출을 검증하지 않으므로
 * 고정 길이를 돌려주는 것으로 충분하다. 길이 추출 자체는 `audio-probe`의 단위 테스트가
 * 맡을 몫이다(별도 티켓).
 */

/** 대역이 돌려주는 고정 재생 길이(초). 값 자체에 의미는 없다. */
export const MOCK_DURATION_SEC = 180;

export function parseBuffer(): Promise<{ format: { duration: number } }> {
  return Promise.resolve({ format: { duration: MOCK_DURATION_SEC } });
}
