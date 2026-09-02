import { ConsentType } from '../user.enum';
import { ConsentState } from '../user.types';

export class ConsentItemDto {
  readonly consent_type: ConsentType;
  readonly version: string | null;
  readonly is_agreed: boolean;
  readonly agreed_at: string;
}

export class UpdateConsentsResponseDto {
  readonly consents: ConsentItemDto[];

  static from(states: ConsentState[]): UpdateConsentsResponseDto {
    return {
      consents: states.map((state) => ({
        consent_type: state.consentType,
        version: state.version,
        is_agreed: state.isAgreed,
        agreed_at: state.agreedAt.toISOString(),
      })),
    };
  }
}
