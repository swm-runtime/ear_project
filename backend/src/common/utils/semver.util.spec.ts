import { isVersionLowerThan } from './semver.util';

describe('semver.util', () => {
  describe('isVersionLowerThan', () => {
    it('major가 낮으면 낮은 버전이다', () => {
      // given / when / then
      expect(isVersionLowerThan('1.9.9', '2.0.0')).toBe(true);
    });

    it('minor가 낮으면 낮은 버전이다', () => {
      // given / when / then
      expect(isVersionLowerThan('1.3.0', '1.4.0')).toBe(true);
    });

    it('patch가 낮으면 낮은 버전이다', () => {
      // given / when / then
      expect(isVersionLowerThan('1.4.0', '1.4.1')).toBe(true);
    });

    it('같은 버전은 낮지 않다', () => {
      // given / when / then
      expect(isVersionLowerThan('1.4.0', '1.4.0')).toBe(false);
    });

    it('높은 버전은 낮지 않다', () => {
      // given — 스토어 반영 전 내부 빌드가 최신보다 높을 수 있다
      expect(isVersionLowerThan('1.5.0', '1.4.0')).toBe(false);
    });

    it('자리수를 문자열이 아니라 숫자로 비교한다', () => {
      // given — 문자열 비교면 "10" < "9"가 되어 판정이 뒤집힌다
      expect(isVersionLowerThan('1.9.0', '1.10.0')).toBe(true);
      expect(isVersionLowerThan('1.10.0', '1.9.0')).toBe(false);
    });

    it('형식이 깨진 값은 낮다고 판정하지 않는다', () => {
      // given — 판정 불가를 "업데이트 필요"로 읽으면 그 클라이언트에 배지가 영구히 붙는다
      expect(isVersionLowerThan('1.4', '1.4.0')).toBe(false);
      expect(isVersionLowerThan('v1.4.0', '1.5.0')).toBe(false);
      expect(isVersionLowerThan('1.0.0-beta', '1.0.0')).toBe(false);
    });
  });
});
