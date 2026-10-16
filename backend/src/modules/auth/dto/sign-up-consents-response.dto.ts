import { UserMarket } from '@/modules/user/user.enum';
import { SignUpConsents } from '@/modules/user/user.types';

import {
  ConsentRequirementDto,
  toConsentRequirementDto,
} from './social-login-response.dto';

/**
 * auth-api.md 4.x — `required_consents`는 4.1 `consent_required`와 같은 모양이다.
 * `market`은 이 `locale`로 가입하면 정해질 시장이다. 글로벌 가입이 닫혀 있으면 `en`을 골라도 `kr`이라, 앱은
 * 언어 선택이 아니라 이 값으로 동의 화면(연령 문구·약관 링크)을 그린다.
 */
export class SignUpConsentsResponseDto {
  readonly required_consents: ConsentRequirementDto[];
  readonly market: UserMarket;

  static from(result: SignUpConsents): SignUpConsentsResponseDto {
    return {
      required_consents: result.requiredConsents.map(toConsentRequirementDto),
      market: result.market,
    };
  }
}
