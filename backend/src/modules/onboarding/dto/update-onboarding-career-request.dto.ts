import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

import { YearsOfExperienceRange } from '@/modules/user/user.enum';

/**
 * onboarding-api.md 4.4 — 세 필드가 전부 선택 입력이라 **보낸 필드만 반영**한다.
 * [건너뛰기]는 빈 본문(`{}`)으로 같은 엔드포인트를 호출한다.
 *
 * `null`을 보낸 필드는 값을 비운다(PATCH의 기본 의미). `@IsOptional()`만 붙이면
 * `null`도 검증을 건너뛰어 형식 검증이 사라지므로, `null`만 예외로 두고 검증한다.
 */
export class UpdateOnboardingCareerRequestDto {
  @ValidateIf((_object, value) => value !== null)
  @IsOptional()
  @IsString()
  @MaxLength(50)
  readonly job_category?: string | null;

  @ValidateIf((_object, value) => value !== null)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  readonly job_title?: string | null;

  /** 구간값이다. 정수 연차를 받지 않는다 */
  @ValidateIf((_object, value) => value !== null)
  @IsOptional()
  @IsEnum(YearsOfExperienceRange)
  readonly years_of_experience?: YearsOfExperienceRange | null;
}
