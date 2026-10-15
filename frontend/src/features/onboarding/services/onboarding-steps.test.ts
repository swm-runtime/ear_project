import { describe, expect, it } from '@jest/globals';

import {
  DEFAULT_ONBOARDING_STEPS,
  nextOnboardingStep,
  normalizeOnboardingSteps,
  onboardingStepPosition,
  resumeOnboardingTarget,
} from './onboarding-steps';

describe('onboarding-steps', () => {
  describe('normalizeOnboardingSteps', () => {
    it('steps 가 없으면 종전 단계(주제 → 커리어)로 본다', () => {
      // given / when
      const steps = normalizeOnboardingSteps(undefined);

      // then
      expect(steps).toEqual(['topic', 'career']);
    });

    it('KR 배열은 그대로 쓴다', () => {
      // given / when
      const steps = normalizeOnboardingSteps(['topic', 'career']);

      // then
      expect(steps).toEqual(['topic', 'career']);
    });

    it('GLOBAL 배열(topic 만)은 커리어를 넣지 않는다', () => {
      // given / when
      const steps = normalizeOnboardingSteps(['topic']);

      // then
      expect(steps).toEqual(['topic']);
    });

    it('모르는 단계 이름과 중복은 건너뛰고 순서는 서버 배열을 따른다', () => {
      // given / when
      const steps = normalizeOnboardingSteps(['topic', 'pick', 'language', 'topic', 42, 'career']);

      // then
      expect(steps).toEqual(['topic', 'career']);
    });

    it('걸러서 하나도 남지 않으면 종전 단계로 본다', () => {
      // given / when
      const steps = normalizeOnboardingSteps(['language']);

      // then
      expect(steps).toEqual([...DEFAULT_ONBOARDING_STEPS]);
    });
  });

  describe('nextOnboardingStep', () => {
    it('KR 은 주제 다음이 커리어다', () => {
      // given / when / then
      expect(nextOnboardingStep(['topic', 'career'], 'topic')).toBe('career');
    });

    it('KR 은 커리어 다음이 없어 완료 대기로 간다(null)', () => {
      // given / when / then
      expect(nextOnboardingStep(['topic', 'career'], 'career')).toBeNull();
    });

    it('GLOBAL 은 주제 다음이 없어 커리어를 건너뛰고 완료 대기로 간다(null)', () => {
      // given / when / then
      expect(nextOnboardingStep(['topic'], 'topic')).toBeNull();
    });

    it('배열에 없는 단계에서는 다음 단계가 없다', () => {
      // given / when / then
      expect(nextOnboardingStep(['topic'], 'career')).toBeNull();
    });
  });

  describe('onboardingStepPosition', () => {
    it('KR 주제는 1/2, 커리어는 2/2 다', () => {
      // given / when / then
      expect(onboardingStepPosition(['topic', 'career'], 'topic')).toEqual({ current: 1, total: 2 });
      expect(onboardingStepPosition(['topic', 'career'], 'career')).toEqual({
        current: 2,
        total: 2,
      });
    });

    it('GLOBAL 주제는 1/1 이다', () => {
      // given / when / then
      expect(onboardingStepPosition(['topic'], 'topic')).toEqual({ current: 1, total: 1 });
    });

    it('배열에 없는 단계는 마지막 칸으로 보여 분자가 분모를 넘지 않는다', () => {
      // given / when / then
      expect(onboardingStepPosition(['topic'], 'career')).toEqual({ current: 1, total: 1 });
    });
  });

  describe('resumeOnboardingTarget', () => {
    it('재개 지점이 배열에 있으면 그 단계에서 시작한다', () => {
      // given / when / then
      expect(resumeOnboardingTarget('topic', ['topic', 'career'])).toBe('topic');
      expect(resumeOnboardingTarget('career', ['topic', 'career'])).toBe('career');
    });

    it('pick·done 은 완료 대기로 간다', () => {
      // given / when / then
      expect(resumeOnboardingTarget('pick', ['topic'])).toBe('finish');
      expect(resumeOnboardingTarget('done', ['topic', 'career'])).toBe('finish');
    });

    it('재개 지점이 배열에 없는 커리어면(GLOBAL) 커리어 화면을 띄우지 않고 완료 대기로 간다', () => {
      // given / when / then
      expect(resumeOnboardingTarget('career', ['topic'])).toBe('finish');
    });
  });
});
