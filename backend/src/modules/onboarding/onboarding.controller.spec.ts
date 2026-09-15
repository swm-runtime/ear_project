import { plainToInstance } from 'class-transformer';

import { YearsOfExperienceRange } from '@/modules/user/user.enum';

import { UpdateOnboardingCareerRequestDto } from './dto/update-onboarding-career-request.dto';
import { toCareerPatch } from './onboarding.controller';

/**
 * 실제 요청은 전역 `ValidationPipe`가 `plainToInstance`로 만든 DTO 인스턴스로 들어온다.
 * 컴파일된 클래스 필드 선언 때문에 보내지 않은 키도 own property(`undefined`)로 존재하므로,
 * plain object를 넘기는 Orchestrator 스펙으로는 이 경계를 검증할 수 없다 — 여기서 고정한다.
 */
describe('OnboardingController toCareerPatch', () => {
  it('보내지 않은 필드는 patch에 넣지 않는다 — PATCH가 전체 교체가 되지 않는다', () => {
    // given — 연차만 고친 요청
    const request = plainToInstance(UpdateOnboardingCareerRequestDto, {
      years_of_experience: YearsOfExperienceRange.TWO_TO_THREE,
    });

    // when
    const patch = toCareerPatch(request);

    // then
    expect(Object.keys(patch)).toEqual(['yearsOfExperience']);
    expect(patch.yearsOfExperience).toBe(YearsOfExperienceRange.TWO_TO_THREE);
  });

  it('빈 본문([건너뛰기])은 빈 patch다 — 저장된 커리어를 비우지 않는다', () => {
    // given
    const request = plainToInstance(UpdateOnboardingCareerRequestDto, {});

    // when
    const patch = toCareerPatch(request);

    // then
    expect(patch).toEqual({});
  });

  it('null을 보낸 필드는 비우기로 patch에 실린다', () => {
    // given
    const request = plainToInstance(UpdateOnboardingCareerRequestDto, {
      job_title: null,
    });

    // when
    const patch = toCareerPatch(request);

    // then
    expect(patch).toEqual({ jobTitle: null });
  });
});
