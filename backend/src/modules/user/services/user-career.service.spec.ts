import { BusinessException } from '@/common/exceptions/business.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';

import { UserCareerService } from './user-career.service';
import { UserOnboardingService } from './user-onboarding.service';
import { UserService } from './user.service';
import { User } from '../entities/user.entity';
import { YearsOfExperienceRange } from '../user.enum';
import { UpdateCareerCommand } from '../user.types';

const USER_ID = '11111111-1111-4111-8111-111111111111';

function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: USER_ID,
    jobCategory: null,
    jobTitle: null,
    yearsOfExperience: null,
    ...overrides,
  } as User;
}

describe('UserCareerService', () => {
  let service: UserCareerService;
  let userService: jest.Mocked<UserService>;
  let userOnboardingService: jest.Mocked<UserOnboardingService>;
  let user: User;

  beforeEach(() => {
    user = buildUser();

    userService = {
      getById: jest.fn().mockImplementation(() => Promise.resolve(user)),
    } as unknown as jest.Mocked<UserService>;

    userOnboardingService = {
      updateCareer: jest
        .fn()
        .mockImplementation((target: User, command: UpdateCareerCommand) => {
          if ('jobCategory' in command) {
            target.jobCategory = command.jobCategory ?? null;
          }
          if ('jobTitle' in command) {
            target.jobTitle = command.jobTitle ?? null;
          }
          if ('yearsOfExperience' in command) {
            target.yearsOfExperience = command.yearsOfExperience ?? null;
          }
          return Promise.resolve(target);
        }),
    } as unknown as jest.Mocked<UserOnboardingService>;

    service = new UserCareerService(userService, userOnboardingService);
  });

  describe('getCareer', () => {
    it('저장된 하한값을 구간 라벨로 되돌려 조회한다', async () => {
      // given
      user = buildUser({
        jobCategory: '개발',
        jobTitle: '백엔드 엔지니어',
        yearsOfExperience: 4,
      });

      // when
      const career = await service.getCareer(USER_ID);

      // then
      expect(career).toEqual({
        jobCategory: '개발',
        jobTitle: '백엔드 엔지니어',
        yearsOfExperience: YearsOfExperienceRange.FOUR_TO_SIX,
      });
    });

    it('미입력 사용자는 세 값이 전부 null이다', async () => {
      // given / when / then — 404가 아니라 정상 상태다
      await expect(service.getCareer(USER_ID)).resolves.toEqual({
        jobCategory: null,
        jobTitle: null,
        yearsOfExperience: null,
      });
    });
  });

  describe('replaceCareer', () => {
    it('세 필드를 전체 교체하고 구간 라벨을 하한값으로 환산해 저장한다', async () => {
      // given / when
      const result = await service.replaceCareer(USER_ID, {
        jobCategory: '개발',
        jobTitle: '백엔드 엔지니어',
        yearsOfExperience: YearsOfExperienceRange.FOUR_TO_SIX,
      });

      // then — 세 키가 전부 커맨드에 실린다(부분 유지 없음)
      expect(userOnboardingService.updateCareer).toHaveBeenCalledWith(user, {
        jobCategory: '개발',
        jobTitle: '백엔드 엔지니어',
        yearsOfExperience: 4,
      });
      expect(result.yearsOfExperience).toBe(YearsOfExperienceRange.FOUR_TO_SIX);
    });

    it('세 null 저장으로 미입력 상태로 되돌린다', async () => {
      // given — [초기화] 후 저장 (career.md 4.1)
      user = buildUser({
        jobCategory: '개발',
        jobTitle: '백엔드 엔지니어',
        yearsOfExperience: 7,
      });

      // when
      const result = await service.replaceCareer(USER_ID, {
        jobCategory: null,
        jobTitle: null,
        yearsOfExperience: null,
      });

      // then
      expect(result).toEqual({
        jobCategory: null,
        jobTitle: null,
        yearsOfExperience: null,
      });
    });

    it('빈 문자열과 공백만인 값은 null로 정규화해 저장한다', async () => {
      // given / when — 미입력 판정이 null 하나로 수렴해야 한다 (career-api.md 2장)
      const result = await service.replaceCareer(USER_ID, {
        jobCategory: '',
        jobTitle: '   ',
        yearsOfExperience: null,
      });

      // then
      expect(result.jobCategory).toBeNull();
      expect(result.jobTitle).toBeNull();
    });

    it('직군 목록에 없는 값은 거부한다', async () => {
      // given / when / then — 시트 UI만 믿으면 임의 문자열이 컬럼에 쌓인다
      await expect(
        service.replaceCareer(USER_ID, {
          jobCategory: '우주비행사',
          jobTitle: null,
          yearsOfExperience: null,
        }),
      ).rejects.toMatchObject({
        errorCode: ErrorCode.CAREER_JOB_CATEGORY_UNAVAILABLE,
      });
      await expect(
        service.replaceCareer(USER_ID, {
          jobCategory: '우주비행사',
          jobTitle: null,
          yearsOfExperience: null,
        }),
      ).rejects.toBeInstanceOf(BusinessException);
      expect(userOnboardingService.updateCareer).not.toHaveBeenCalled();
    });

    it('직군 null은 목록 검증 없이 통과한다', async () => {
      // given / when
      const result = await service.replaceCareer(USER_ID, {
        jobCategory: null,
        jobTitle: '프리랜서',
        yearsOfExperience: YearsOfExperienceRange.ZERO_TO_ONE,
      });

      // then — 직군만 비운 저장도 허용된다(선택 안 함)
      expect(result.jobCategory).toBeNull();
      expect(result.jobTitle).toBe('프리랜서');
      expect(result.yearsOfExperience).toBe(YearsOfExperienceRange.ZERO_TO_ONE);
    });
  });

  describe('getJobCategories', () => {
    it('온보딩과 공용인 직군 목록을 정의 순서대로 돌려준다', () => {
      // given / when
      const categories = service.getJobCategories();

      // then — FE 온보딩이 저장해 온 값이 포함돼야 기존 사용자의 재저장이 막히지 않는다
      expect(categories.length).toBeGreaterThan(0);
      expect(categories).toContain('개발');
      expect(categories).toContain('기타');
    });
  });
});
