import { ErrorCode } from '@/common/exceptions/error-code.enum';

import { UserOnboardingService } from './user-onboarding.service';
import { UserService } from './user.service';
import { User } from '../entities/user.entity';
import { UserRepository } from '../repositories/user.repository';
import { JOB_CATEGORIES } from '../user.constant';
import { OnboardingStep } from '../user.enum';

function buildUser(): User {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    jobCategory: null,
    jobTitle: null,
    yearsOfExperience: null,
  } as User;
}

describe('UserOnboardingService', () => {
  let service: UserOnboardingService;
  let userRepository: jest.Mocked<UserRepository>;

  beforeEach(() => {
    userRepository = {
      save: jest.fn((user: User) => Promise.resolve(user)),
    } as unknown as jest.Mocked<UserRepository>;

    service = new UserOnboardingService(userRepository, {} as UserService);
  });

  describe('updateCareer', () => {
    it('목록에 있는 직군은 저장한다', async () => {
      // given
      const [jobCategory] = JOB_CATEGORIES;

      // when
      const saved = await service.updateCareer(buildUser(), { jobCategory });

      // then
      expect(saved.jobCategory).toBe(jobCategory);
    });

    it('목록 밖 직군은 온보딩 경로에서도 거부한다 — 커리어 화면과 같은 판정', async () => {
      // when
      const updating = service.updateCareer(buildUser(), {
        jobCategory: '목록에 없는 직군',
      });

      // then
      await expect(updating).rejects.toMatchObject({
        errorCode: ErrorCode.CAREER_JOB_CATEGORY_UNAVAILABLE,
      });
      expect(userRepository.save).not.toHaveBeenCalled();
    });

    it('빈 문자열·공백만인 값은 null로 정규화한다 — 미입력 판정이 한 값으로 수렴한다', async () => {
      // when
      const saved = await service.updateCareer(buildUser(), {
        jobCategory: '   ',
        jobTitle: '',
      });

      // then
      expect(saved.jobCategory).toBeNull();
      expect(saved.jobTitle).toBeNull();
    });

    it('본문에 없는 필드는 건드리지 않는다', async () => {
      // given
      const user = { ...buildUser(), jobTitle: '백엔드 개발자' } as User;

      // when
      const saved = await service.updateCareer(user, { yearsOfExperience: 2 });

      // then
      expect(saved.jobTitle).toBe('백엔드 개발자');
      expect(saved.yearsOfExperience).toBe(2);
    });
  });

  describe('complete · restartForMarketChange — 시장 전환 뒤 재온보딩(global-api 4.11)', () => {
    const FIRST_COMPLETED_AT = new Date('2026-09-01T00:00:00.000Z');
    const NOW = new Date('2026-10-19T03:00:00.000Z');

    it('시장 전환은 온보딩을 주제 단계로 되돌리고 처음 완료 시각과 커리어는 남긴다', () => {
      // given
      const user = {
        ...buildUser(),
        jobCategory: JOB_CATEGORIES[0],
        onboardingCompleted: true,
        onboardingStep: OnboardingStep.DONE,
        onboardingCompletedAt: FIRST_COMPLETED_AT,
      } as User;

      // when
      service.restartForMarketChange(user);

      // then
      expect(user).toMatchObject({
        onboardingCompleted: false,
        onboardingStep: OnboardingStep.TOPIC,
        onboardingCompletedAt: FIRST_COMPLETED_AT,
        jobCategory: JOB_CATEGORIES[0],
      });
    });

    it('재완료는 처음 완료 시각을 덮어쓰지 않는다 — 가입 퍼널의 완료일이 옮겨 가지 않게', async () => {
      // given
      const user = {
        ...buildUser(),
        onboardingCompleted: false,
        onboardingStep: OnboardingStep.TOPIC,
        onboardingCompletedAt: FIRST_COMPLETED_AT,
      } as User;

      // when
      const saved = await service.complete(user, NOW);

      // then
      expect(saved.onboardingCompleted).toBe(true);
      expect(saved.onboardingCompletedAt).toBe(FIRST_COMPLETED_AT);
    });

    it('처음 완료는 지금 시각을 남긴다', async () => {
      // given
      const user = { ...buildUser(), onboardingCompletedAt: null } as User;

      // when
      const saved = await service.complete(user, NOW);

      // then
      expect(saved.onboardingCompletedAt).toBe(NOW);
    });
  });
});
