import { AuthUserDto } from '@/modules/auth/dto/auth-user.dto';

import { GetMeResponseDto } from './get-me-response.dto';
import { User } from '../entities/user.entity';
import {
  ConsentType,
  OnboardingStep,
  SocialProvider,
  UserRole,
  UserTier,
} from '../user.enum';

const FIXTURE_USER = {
  id: '11111111-1111-4111-8111-111111111111',
  nickname: '닉네임',
  email: 'user@example.com',
  isEmailVerified: true,
  provider: SocialProvider.KAKAO,
  tier: UserTier.LIGHT,
  role: UserRole.USER,
  onboardingCompleted: true,
  onboardingStep: OnboardingStep.DONE,
} as User;

describe('GetMeResponseDto', () => {
  it('user 객체가 로그인 응답(4.1)의 user와 필드 구성이 같다 — 갈리면 관문 판정이 갈린다', () => {
    // given / when
    const loginUser = AuthUserDto.from(FIXTURE_USER);
    const meUser = GetMeResponseDto.from(FIXTURE_USER, []).user;

    // then — 필드 집합과 값 모두 일치해야 한다(session-restore-endpoint.md 요청 1)
    expect(Object.keys(meUser).sort()).toEqual(Object.keys(loginUser).sort());
    expect(meUser).toEqual(loginUser);
  });

  it('pending_consents를 4.1과 같은 모양으로 함께 내려준다', () => {
    // given / when
    const response = GetMeResponseDto.from(FIXTURE_USER, [
      {
        consentType: ConsentType.AGE_CONFIRMATION,
        version: null,
        isRequired: true,
      },
    ]);

    // then
    expect(response.pending_consents).toEqual([
      { consent_type: 'age_confirmation', version: null, is_required: true },
    ]);
  });
});
