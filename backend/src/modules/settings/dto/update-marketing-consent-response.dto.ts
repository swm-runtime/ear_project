import { MarketingConsentView } from '../settings.types';

class MarketingConsentDto {
  readonly is_agreed: boolean;
  /** 최신 행의 시각(동의든 철회든). 행이 없으면 `null` */
  readonly agreed_at: string | null;
}

/** settings-api.md 4.3 — 행 추가 뒤의 **현재 상태**(최신 행)를 되돌린다 */
export class UpdateMarketingConsentResponseDto {
  readonly marketing_consent: MarketingConsentDto;
  readonly client_seq: number;

  static from(
    view: MarketingConsentView,
    clientSeq: number,
  ): UpdateMarketingConsentResponseDto {
    return {
      marketing_consent: {
        is_agreed: view.isAgreed,
        agreed_at: view.agreedAt?.toISOString() ?? null,
      },
      client_seq: clientSeq,
    };
  }
}
