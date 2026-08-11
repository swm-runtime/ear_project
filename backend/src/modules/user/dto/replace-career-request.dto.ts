import { IsEnum, IsString, MaxLength, ValidateIf } from 'class-validator';

import { YearsOfExperienceRange } from '../user.enum';

/**
 * career-api.md 4.2 — 3필드 **전체 교체**. 온보딩(부분 수정)과 달리 **세 키가 모두 있어야
 * 한다.** 키 누락을 "유지"로 해석하면 PATCH가 몰래 되살아나 다중 기기 병합 문제가 돌아온다.
 * 비움은 키 생략이 아니라 `null`이다.
 *
 * `@IsOptional()`을 쓰지 않는 이유 — 그것은 `undefined`(키 누락)도 통과시킨다.
 * `@ValidateIf(v => v !== null)`만 두면 `null`은 검증을 건너뛰고, 키가 없으면
 * `undefined`가 `@IsString`/`@IsEnum`에 걸려 `VALIDATION_FAILED`가 된다.
 */
export class ReplaceCareerRequestDto {
  /** 직군 목록(`GET /job-categories`)의 `name` 값 — 목록 소속 판정은 Service가 한다 */
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  @MaxLength(50)
  readonly job_category: string | null;

  @ValidateIf((_object, value) => value !== null)
  @IsString()
  @MaxLength(100)
  readonly job_title: string | null;

  /** 구간 라벨이다. 정수 연차를 받지 않는다 */
  @ValidateIf((_object, value) => value !== null)
  @IsEnum(YearsOfExperienceRange)
  readonly years_of_experience: YearsOfExperienceRange | null;
}
