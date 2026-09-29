import { IsEnum, IsString, MaxLength, ValidateIf } from 'class-validator';

import { YearsOfExperienceRange } from '@/modules/user/user.enum';

/** `PUT /admin/recommend-test/career` — 커리어 화면(`career-api.md`)과 같은 본문 */
export class RecommendTestCareerRequestDto {
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  @MaxLength(50)
  readonly job_category: string | null;

  @ValidateIf((_object, value) => value !== null)
  @IsString()
  @MaxLength(100)
  readonly job_title: string | null;

  @ValidateIf((_object, value) => value !== null)
  @IsEnum(YearsOfExperienceRange)
  readonly years_of_experience: YearsOfExperienceRange | null;
}
