import { ErrorCode } from '@/common/exceptions/error-code.enum';

import { UserOnboardingService } from './user-onboarding.service';
import { UserService } from './user.service';
import { User } from '../entities/user.entity';
import { UserRepository } from '../repositories/user.repository';
import { JOB_CATEGORIES } from '../user.constant';

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
});
