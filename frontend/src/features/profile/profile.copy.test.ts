import { describe, expect, it } from '@jest/globals';

import { PROFILE_COPY } from './profile.copy';

describe('profile.copy 주간 그래프 값 표기', () => {
  describe('dayValue — 막대 말풍선·스크린리더', () => {
    it('1~59초는 "1분 미만"이다 — 버림하면 "0분"이라 막대가 있는데 안 들은 것처럼 읽혔다(KAN-114)', () => {
      // given — 박준현 개발계 확인 값(토요일 6초)
      expect(PROFILE_COPY.stats.dayValue(6)).toBe('1분 미만');
      expect(PROFILE_COPY.stats.dayValue(59)).toBe('1분 미만');
    });

    it('0초는 종전대로 "0분"이다 — 들은 날과 안 들은 날은 문구로 갈린다', () => {
      expect(PROFILE_COPY.stats.dayValue(0)).toBe('0분');
    });

    it('60초부터는 분 단위 버림 표기다', () => {
      expect(PROFILE_COPY.stats.dayValue(60)).toBe('1분');
      expect(PROFILE_COPY.stats.dayValue(128)).toBe('2분');
    });

    it('60분 이상은 "N시간 N분"이다(profile-uiux.md 4.6)', () => {
      expect(PROFILE_COPY.stats.dayValue(3600)).toBe('1시간 0분');
      expect(PROFILE_COPY.stats.dayValue(4320)).toBe('1시간 12분');
    });
  });

  describe('axisMax — 오른쪽 축 맨 위', () => {
    it('그 주 최대가 1분 미만이면 축도 "1분 미만"이다 — "0분" 축은 막대가 선 이유를 설명하지 못한다', () => {
      expect(PROFILE_COPY.stats.axisMax(6)).toBe('1분 미만');
    });

    it('1분 이상은 분 단위만 적는다(좁은 축 칸)', () => {
      expect(PROFILE_COPY.stats.axisMax(4320)).toBe('72분');
    });

    it('0은 "0분"이다 — 빈 주의 축', () => {
      expect(PROFILE_COPY.stats.axisMax(0)).toBe('0분');
    });
  });

  describe('dayBarA11y — 막대 개별 읽기', () => {
    it('1분 미만도 같은 문구로 읽는다(스크린리더와 말풍선이 어긋나지 않게)', () => {
      expect(PROFILE_COPY.stats.dayBarA11y(5, 6)).toBe('토요일, 1분 미만');
    });
  });
});
