import { HttpStatus, Injectable, Logger } from '@nestjs/common';

import { BusinessException } from '@/common/exceptions/business.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';

import { UserOnboardingService } from './user-onboarding.service';
import { UserService } from './user.service';
import { User } from '../entities/user.entity';
import {
  JOB_CATEGORIES,
  toYearsOfExperienceRange,
  YEARS_OF_EXPERIENCE_LOWER_BOUND,
} from '../user.constant';
import { CareerView, ReplaceCareerCommand } from '../user.types';

/**
 * career-api.md — 커리어 정보 화면의 조회·전체 교체.
 *
 * 커리어 3필드는 `users` 소유라 이 모듈에 둔다(domain.md 3.1 — C-2, 별도 테이블 없음).
 * 실제 쓰기는 `UserOnboardingService.updateCareer`(커리어 필드의 단일 쓰기 경로)를 재사용하되,
 * **온보딩과 계약이 다르다** — 여기는 세 키 전체 교체이고 `onboarding_step`을 건드리지 않는다.
 * 온보딩 미완료 계정의 호출도 거부하지 않는다(career-api.md 4.2 — 화면 진입 제한은
 * 내비게이션 규칙이고, 이 엔드포인트에는 깨지는 불변식이 없다).
 */
@Injectable()
export class UserCareerService {
  private readonly logger = new Logger(UserCareerService.name);

  constructor(
    private readonly userService: UserService,
    private readonly userOnboardingService: UserOnboardingService,
  ) {}

  async getCareer(userId: string): Promise<CareerView> {
    const user = await this.userService.getById(userId);
    return toCareerView(user);
  }

  /**
   * 세 필드를 받은 그대로 전체 교체한다(last-write-wins — career-api.md 4.2).
   * 한 행의 3컬럼 UPDATE라 별도 트랜잭션 없이도 전부 반영 또는 전부 미반영이다.
   */
  async replaceCareer(
    userId: string,
    command: ReplaceCareerCommand,
  ): Promise<CareerView> {
    // 빈 문자열·공백만인 값은 null로 정규화한다(career-api.md 2장) — 미입력 판정
    // ("입력하면 추천이 정확해져요" 분기)이 null 하나로 수렴해야 화면마다 갈라지지 않는다
    const jobCategory = normalizeText(command.jobCategory);
    const jobTitle = normalizeText(command.jobTitle);

    this.assertJobCategoryAvailable(jobCategory);

    const user = await this.userService.getById(userId);
    const saved = await this.userOnboardingService.updateCareer(user, {
      jobCategory,
      jobTitle,
      yearsOfExperience: command.yearsOfExperience
        ? YEARS_OF_EXPERIENCE_LOWER_BOUND[command.yearsOfExperience]
        : null,
    });

    return toCareerView(saved);
  }

  /**
   * career-api.md 4.3 — 온보딩 2단계와 커리어 정보 화면이 같은 목록을 쓴다.
   * 상수 정의 순서가 곧 노출 순서다.
   */
  getJobCategories(): readonly string[] {
    if (JOB_CATEGORIES.length === 0) {
      // 직군 선택이 불가능해질 뿐 저장·온보딩은 막히지 않지만, 정상 상태가 아니다
      this.logger.error('job category list is empty');
    }

    return JOB_CATEGORIES;
  }

  /**
   * `job_category`는 목록에 있는 값만 허용한다(또는 null). 서버가 임의 문자열을 받으면
   * 같은 컬럼에 목록 밖 값이 쌓여 "서버 제공 목록" 확정이 무의미해진다(career-api.md 4.2).
   */
  private assertJobCategoryAvailable(jobCategory: string | null): void {
    if (jobCategory !== null && !JOB_CATEGORIES.includes(jobCategory)) {
      throw new BusinessException({
        status: HttpStatus.BAD_REQUEST,
        errorCode: ErrorCode.CAREER_JOB_CATEGORY_UNAVAILABLE,
        message: '선택할 수 없는 직군이에요',
      });
    }
  }
}

function toCareerView(user: User): CareerView {
  return {
    jobCategory: user.jobCategory,
    jobTitle: user.jobTitle,
    yearsOfExperience: toYearsOfExperienceRange(user.yearsOfExperience),
  };
}

function normalizeText(value: string | null): string | null {
  if (value === null || value.trim() === '') {
    return null;
  }

  return value;
}
