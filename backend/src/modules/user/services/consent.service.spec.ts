import { ErrorCode } from '@/common/exceptions/error-code.enum';

import { ConsentService } from './consent.service';
import { Consent } from '../entities/consent.entity';
import { ConsentRepository } from '../repositories/consent.repository';
import { CURRENT_CONSENT_VERSIONS } from '../user.constant';
import { ConsentType } from '../user.enum';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const NOW = new Date('2026-09-09T05:00:00.000Z');

describe('ConsentService', () => {
  let service: ConsentService;
  let repository: jest.Mocked<ConsentRepository>;

  beforeEach(() => {
    repository = {
      create: jest.fn((value: Partial<Consent>) => value as Consent),
      saveAll: jest.fn((values: Consent[]) => Promise.resolve(values)),
    } as unknown as jest.Mocked<ConsentRepository>;

    service = new ConsentService(repository);
  });

  describe('recordConsents', () => {
    it('기록되는 버전은 클라이언트 값이 아니라 서버의 현행 버전이다', async () => {
      // given — 버전을 비워 보낸 마케팅 동의와 현행 버전의 약관 동의
      const saved = await service.recordConsents(
        USER_ID,
        [
          { consentType: ConsentType.MARKETING, version: null, isAgreed: true },
          {
            consentType: ConsentType.TERMS,
            version: CURRENT_CONSENT_VERSIONS[ConsentType.TERMS],
            isAgreed: true,
          },
        ],
        NOW,
      );

      // then
      expect(saved.map((consent) => consent.version)).toEqual([
        CURRENT_CONSENT_VERSIONS[ConsentType.MARKETING],
        CURRENT_CONSENT_VERSIONS[ConsentType.TERMS],
      ]);
    });

    it('낡은 버전을 보내면 가입 경로와 같은 코드로 거부한다 — 법적 이력에 임의 버전을 남기지 않는다', async () => {
      // when
      const recording = service.recordConsents(
        USER_ID,
        [{ consentType: ConsentType.TERMS, version: '0.0', isAgreed: true }],
        NOW,
      );

      // then
      await expect(recording).rejects.toMatchObject({
        errorCode: ErrorCode.CONSENT_VERSION_STALE,
      });
      expect(repository.saveAll).not.toHaveBeenCalled();
    });

    it('같은 요청에 같은 종류가 두 번 있으면 거부한다 — agreed_at 동률로 현재 상태가 비결정이 된다', async () => {
      // when
      const recording = service.recordConsents(
        USER_ID,
        [
          { consentType: ConsentType.MARKETING, version: null, isAgreed: true },
          {
            consentType: ConsentType.MARKETING,
            version: null,
            isAgreed: false,
          },
        ],
        NOW,
      );

      // then
      await expect(recording).rejects.toMatchObject({
        errorCode: ErrorCode.VALIDATION_FAILED,
        details: { field: 'consents' },
      });
      expect(repository.saveAll).not.toHaveBeenCalled();
    });
  });
});
