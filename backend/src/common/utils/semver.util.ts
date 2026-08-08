/**
 * semver 비교. **비교를 서버가 한다**(`settings-api.md` 4.1) — 클라이언트마다 semver 비교를
 * 재작성하면 같은 버전 쌍에 다른 판정이 나온다.
 *
 * 도메인 지식이 없는 순수 함수라 `common/utils`에 둔다(convention.md 2.2). 설정 화면의
 * 업데이트 안내와 스플래시의 강제 업데이트 판정(`splash.md`)이 같은 함수를 쓴다.
 *
 * **`major.minor.patch` 세 자리만 다룬다.** 프리릴리스·빌드 메타데이터(`1.0.0-beta+build`)는
 * 스토어에 올라가는 버전 형식이 아니라서 지원하지 않는다 — 받아들이면 비교 규칙(프리릴리스가
 * 정식보다 낮다)까지 구현해야 하는데, 쓰지 않을 규칙이다.
 */
export const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/;

/** 형식이 맞지 않으면 `null`. 호출부가 판정을 포기할지 정한다 */
function parse(version: string): number[] | null {
  if (!SEMVER_PATTERN.test(version)) {
    return null;
  }

  return version.split('.').map(Number);
}

/**
 * `a`가 `b`보다 낮은 버전인가.
 *
 * **형식이 깨진 값은 `false`다** — 판정 불가를 "업데이트 필요"로 읽으면, 버전 문자열이
 * 이상한 클라이언트에게 영구히 배지가 붙는다. 모를 때는 알리지 않는 쪽이 안전하다.
 */
export function isVersionLowerThan(a: string, b: string): boolean {
  const left = parse(a);
  const right = parse(b);

  if (!left || !right) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return left[index] < right[index];
    }
  }

  return false;
}
