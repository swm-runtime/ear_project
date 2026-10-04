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

describe('profile.copy 가입 체험(KAN-119)', () => {
  describe('plan.trial — 헤더 플랜 줄', () => {
    it('체험 중인 무료 계정은 "무료 체험 중 · N월 N일까지 무제한"이다', () => {
      // given — 서버 last_free_date(무제한 마지막 날)
      // when
      const text = PROFILE_COPY.plan.trial('2026-10-09');
      // then
      expect(text).toBe('무료 체험 중 · 10월 9일까지 무제한');
    });
  });

  describe('signupTrialNotice — P11 가입 체험 안내 팝업', () => {
    it('제목에 무제한 마지막 날을 그대로 적는다 — ends_at에서 계산하지 않는다', () => {
      expect(PROFILE_COPY.signupTrialNotice.title('2026-10-09')).toBe(
        '10월 9일까지 무제한으로 들을 수 있어요',
      );
    });

    it('본문의 이후 한도는 서버 값이다 — 2를 하드코딩하지 않는다', () => {
      expect(PROFILE_COPY.signupTrialNotice.body(3)).toBe(
        '작은 선물을 준비했어요. 이후에는 하루 3편씩 들을 수 있어요.',
      );
    });

    it('이후 한도가 null(체험 중인 프로 구독자)이면 이후에도 제한이 없다고 적는다', () => {
      expect(PROFILE_COPY.signupTrialNotice.body(null)).toBe(
        '작은 선물을 준비했어요. 이후에도 지금처럼 제한 없이 들을 수 있어요.',
      );
    });

    it('신규 가입자와 체험 도입 전 가입자가 같은 문구를 본다 — 가입을 말하지 않는다(KAN-121)', () => {
      expect(PROFILE_COPY.signupTrialNotice.body(2)).not.toContain('가입');
      expect(PROFILE_COPY.signupTrialNotice.body(null)).not.toContain('가입');
    });
  });
});
