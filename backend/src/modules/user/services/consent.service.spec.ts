import { ErrorCode } from '@/common/exceptions/error-code.enum';

import { ConsentService } from './consent.service';
import { Consent } from '../entities/consent.entity';
import { ConsentRepository } from '../repositories/consent.repository';
import { CURRENT_CONSENT_VERSIONS_BY_MARKET } from '../user.constant';
import { ConsentType, UserMarket } from '../user.enum';

/** 동의 판정 대상 — 지역을 모르는 사용자(연령 기준 18) */
const KR_USER = { market: UserMarket.KR, regionCode: null };
const GLOBAL_USER = { market: UserMarket.GLOBAL, regionCode: null };

/** 기존 테스트는 KR 사용자 기준이다 */
const KR_CONSENT_VERSIONS = CURRENT_CONSENT_VERSIONS_BY_MARKET[UserMarket.KR];

const USER_ID = '11111111-1111-4111-8111-111111111111';
const NOW = new Date('2026-09-09T05:00:00.000Z');

describe('ConsentService', () => {
  let service: ConsentService;
  let repository: jest.Mocked<ConsentRepository>;

  beforeEach(() => {
    repository = {
      create: jest.fn((value: Partial<Consent>) => value as Consent),
      saveAll: jest.fn((values: Consent[]) => Promise.resolve(values)),
      findAllByUserId: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<ConsentRepository>;

    service = new ConsentService(repository);
  });

  describe('recordConsents', () => {
    it('기록되는 버전은 클라이언트 값이 아니라 서버의 현행 버전이다', async () => {
      // given — 버전을 비워 보낸 마케팅 동의와 현행 버전의 약관 동의
      const saved = await service.recordConsents(
        USER_ID,
        KR_USER,
        [
          { consentType: ConsentType.MARKETING, version: null, isAgreed: true },
          {
            consentType: ConsentType.TERMS,
            version: KR_CONSENT_VERSIONS[ConsentType.TERMS],
            isAgreed: true,
          },
        ],
        NOW,
      );

      // then
      expect(saved.map((consent) => consent.version)).toEqual([
        KR_CONSENT_VERSIONS[ConsentType.MARKETING],
        KR_CONSENT_VERSIONS[ConsentType.TERMS],
      ]);
    });

    it('낡은 버전을 보내면 가입 경로와 같은 코드로 거부한다 — 법적 이력에 임의 버전을 남기지 않는다', async () => {
      // when
      const recording = service.recordConsents(
        USER_ID,
        KR_USER,
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
        KR_USER,
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

    it('필수 동의의 철회(is_agreed: false)는 가입 경로와 같은 코드로 거부한다 — 약관을 버리는 경로는 탈퇴다', async () => {
      // when
      const recording = service.recordConsents(
        USER_ID,
        KR_USER,
        [
          {
            consentType: ConsentType.TERMS,
            version: KR_CONSENT_VERSIONS[ConsentType.TERMS],
            isAgreed: false,
          },
        ],
        NOW,
      );

      // then
      await expect(recording).rejects.toMatchObject({
        errorCode: ErrorCode.CONSENT_REQUIRED,
      });
      expect(repository.saveAll).not.toHaveBeenCalled();
    });

    it('마케팅 동의의 철회는 false 행 추가로 기록한다', async () => {
      // when
      const saved = await service.recordConsents(
        USER_ID,
        KR_USER,
        [
          {
            consentType: ConsentType.MARKETING,
            version: null,
            isAgreed: false,
          },
        ],
        NOW,
      );

      // then
      expect(saved).toHaveLength(1);
      expect(saved[0]).toMatchObject({
        consentType: ConsentType.MARKETING,
        isAgreed: false,
      });
    });

    it('KR 사용자가 GLOBAL 버전으로 재동의해도 낡은 버전으로 거부한다 — 판정은 양방향이다', async () => {
      // when
      const recording = service.recordConsents(
        USER_ID,
        KR_USER,
        [
          {
            consentType: ConsentType.TERMS,
            version: 'global-0.1',
            isAgreed: true,
          },
        ],
        NOW,
      );

      // then
      await expect(recording).rejects.toMatchObject({
        errorCode: ErrorCode.CONSENT_VERSION_STALE,
      });
    });

    it('GLOBAL 사용자가 KR 버전으로 재동의하면 낡은 버전으로 거부한다 — 다른 시장 문서의 동의를 남기지 않는다', async () => {
      // when
      const recording = service.recordConsents(
        USER_ID,
        GLOBAL_USER,
        [{ consentType: ConsentType.TERMS, version: '0.1', isAgreed: true }],
        NOW,
      );

      // then
      await expect(recording).rejects.toMatchObject({
        errorCode: ErrorCode.CONSENT_VERSION_STALE,
      });
      expect(repository.saveAll).not.toHaveBeenCalled();
    });

    it('GLOBAL 사용자는 국외 이전 동의를 철회할 수 없다 — 그 시장의 필수 동의다(KAN-215)', async () => {
      // when
      const recording = service.recordConsents(
        USER_ID,
        GLOBAL_USER,
        [
          {
            consentType: ConsentType.CROSS_BORDER_TRANSFER,
            version: null,
            isAgreed: false,
          },
        ],
        NOW,
      );

      // then
      await expect(recording).rejects.toMatchObject({
        errorCode: ErrorCode.CONSENT_REQUIRED,
      });
      expect(repository.saveAll).not.toHaveBeenCalled();
    });
  });

  describe('findPendingConsents', () => {
    /** 약관·개인정보·연령 확인을 그 시장의 현행 버전으로 동의한 이력 — 국외 이전 동의 도입 전 가입자 */
    function agreedBeforeCrossBorder(versionsOf: UserMarket): Consent[] {
      return [
        ConsentType.TERMS,
        ConsentType.PRIVACY,
        ConsentType.AGE_CONFIRMATION,
      ].map(
        (consentType) =>
          ({
            consentType,
            version:
              CURRENT_CONSENT_VERSIONS_BY_MARKET[versionsOf][consentType],
            isAgreed: true,
            agreedAt: NOW,
          }) as Consent,
      );
    }

    it('GLOBAL 기존 가입자는 국외 이전 동의를 한 번 요구받는다', async () => {
      // given
      repository.findAllByUserId.mockResolvedValue(
        agreedBeforeCrossBorder(UserMarket.GLOBAL),
      );

      // when
      const pending = await service.findPendingConsents(USER_ID, GLOBAL_USER);

      // then
      expect(pending).toEqual([
        {
          consentType: ConsentType.CROSS_BORDER_TRANSFER,
          version: null,
          isRequired: true,
        },
      ]);
    });

    it('KR 기존 가입자는 같은 이력이어도 재동의가 없다 — 국외 이전 동의는 KR 필수가 아니다', async () => {
      // given
      repository.findAllByUserId.mockResolvedValue(
        agreedBeforeCrossBorder(UserMarket.KR),
      );

      // when
      const pending = await service.findPendingConsents(USER_ID, KR_USER);

      // then
      expect(pending).toEqual([]);
    });

    it('GLOBAL 사용자가 KR 버전 약관에 동의한 이력이면 GLOBAL 약관·처리방침에 다시 동의해야 한다(KAN-212)', async () => {
      // given — 시장별 버전 도입 전에 가입한 GLOBAL 계정(개발계)
      repository.findAllByUserId.mockResolvedValue([
        ...agreedBeforeCrossBorder(UserMarket.KR),
        {
          consentType: ConsentType.CROSS_BORDER_TRANSFER,
          version: null,
          isAgreed: true,
          agreedAt: NOW,
        } as Consent,
      ]);

      // when
      const pending = await service.findPendingConsents(USER_ID, GLOBAL_USER);

      // then
      expect(pending).toEqual([
        {
          consentType: ConsentType.TERMS,
          version: 'global-0.1',
          isRequired: true,
        },
        {
          consentType: ConsentType.PRIVACY,
          version: 'global-0.1',
          isRequired: true,
        },
      ]);
    });
  });

  describe('buildSignUpConsents', () => {
    it('KR 가입 목록은 종전과 같다 — 필수 3종 + 선택 마케팅', () => {
      // when
      const requirements = service.buildSignUpConsents(KR_USER);

      // then
      expect(
        requirements.map(({ consentType, isRequired }) => [
          consentType,
          isRequired,
        ]),
      ).toEqual([
        [ConsentType.TERMS, true],
        [ConsentType.PRIVACY, true],
        [ConsentType.AGE_CONFIRMATION, true],
        [ConsentType.MARKETING, false],
      ]);
    });

    it('약관·처리방침 버전은 시장의 문서 버전이다 — KR 0.1 · GLOBAL global-0.1(KAN-212)', () => {
      // when
      const versionsOf = (market: UserMarket) =>
        service
          .buildSignUpConsents({ market, regionCode: null })
          .filter(
            ({ consentType }) =>
              consentType === ConsentType.TERMS ||
              consentType === ConsentType.PRIVACY,
          )
          .map(({ version }) => version);

      // then
      expect(versionsOf(UserMarket.KR)).toEqual(['0.1', '0.1']);
      expect(versionsOf(UserMarket.GLOBAL)).toEqual([
        'global-0.1',
        'global-0.1',
      ]);
    });

    it('GLOBAL 가입 목록에는 국외 이전 동의가 필수로 있다', () => {
      // when
      const requirements = service.buildSignUpConsents(GLOBAL_USER);

      // then
      expect(requirements).toContainEqual({
        consentType: ConsentType.CROSS_BORDER_TRANSFER,
        version: null,
        isRequired: true,
      });
      expect(requirements.filter((r) => r.isRequired)).toHaveLength(4);
    });
  });

  describe('연령 확인 기준 연령(KAN-220)', () => {
    /** 약관·처리방침·국외 이전은 현행으로 동의하고 연령 확인만 `ageVersion`으로 한 GLOBAL 이력 */
    function globalHistoryWithAge(ageVersion: string | null): Consent[] {
      return [
        ConsentType.TERMS,
        ConsentType.PRIVACY,
        ConsentType.AGE_CONFIRMATION,
        ConsentType.CROSS_BORDER_TRANSFER,
      ].map(
        (consentType) =>
          ({
            consentType,
            version:
              consentType === ConsentType.AGE_CONFIRMATION
                ? ageVersion
                : CURRENT_CONSENT_VERSIONS_BY_MARKET[UserMarket.GLOBAL][
                    consentType
                  ],
            isAgreed: true,
            agreedAt: NOW,
          }) as Consent,
      );
    }

    it('가입 목록의 연령 항목에 기준 연령과 그 연령을 담은 버전이 실린다 — 싱가포르 16', () => {
      // when
      const requirements = service.buildSignUpConsents({
        market: UserMarket.GLOBAL,
        regionCode: 'SG',
      });

      // then
      expect(
        requirements.find(
          ({ consentType }) => consentType === ConsentType.AGE_CONFIRMATION,
        ),
      ).toEqual({
        consentType: ConsentType.AGE_CONFIRMATION,
        version: 'age-16',
        isRequired: true,
        minAge: 16,
      });
    });

    it('KR 가입 목록의 연령 항목은 18이고 버전은 종전처럼 null이다', () => {
      // when
      const requirements = service.buildSignUpConsents(KR_USER);

      // then
      expect(
        requirements.find(
          ({ consentType }) => consentType === ConsentType.AGE_CONFIRMATION,
        ),
      ).toEqual({
        consentType: ConsentType.AGE_CONFIRMATION,
        version: null,
        isRequired: true,
        minAge: 18,
      });
    });

    it('연령 외 항목에는 기준 연령을 싣지 않는다', () => {
      // when
      const requirements = service.buildSignUpConsents(GLOBAL_USER);

      // then
      expect(
        requirements
          .filter(
            ({ consentType }) => consentType !== ConsentType.AGE_CONFIRMATION,
          )
          .every((requirement) => !('minAge' in requirement)),
      ).toBe(true);
    });

    it('16세로 확인한 GLOBAL 사용자가 18세 지역으로 옮기면 18세 확인을 한 번 요구받는다', async () => {
      // given
      repository.findAllByUserId.mockResolvedValue(
        globalHistoryWithAge('age-16'),
      );

      // when
      const pending = await service.findPendingConsents(USER_ID, {
        market: UserMarket.GLOBAL,
        regionCode: 'MY',
      });

      // then
      expect(pending).toEqual([
        {
          consentType: ConsentType.AGE_CONFIRMATION,
          version: 'age-18',
          isRequired: true,
          minAge: 18,
        },
      ]);
    });

    it('18세로 확인한 GLOBAL 사용자는 16세 지역으로 옮겨도 다시 묻지 않는다', async () => {
      // given
      repository.findAllByUserId.mockResolvedValue(
        globalHistoryWithAge('age-18'),
      );

      // when
      const pending = await service.findPendingConsents(USER_ID, {
        market: UserMarket.GLOBAL,
        regionCode: 'SG',
      });

      // then
      expect(pending).toEqual([]);
    });

    it('기준 연령이 담기지 않은 옛 이력(null)은 18로 본다 — 18세 지역에서도 다시 묻지 않는다', async () => {
      // given
      repository.findAllByUserId.mockResolvedValue(globalHistoryWithAge(null));

      // when
      const pending = await service.findPendingConsents(USER_ID, GLOBAL_USER);

      // then
      expect(pending).toEqual([]);
    });

    it('KR 사용자의 연령 확인은 null 버전 그대로 기록된다 — KR 이력의 형식이 바뀌지 않는다', async () => {
      // when
      const saved = await service.recordConsents(
        USER_ID,
        { market: UserMarket.KR, regionCode: 'SG' },
        [
          {
            consentType: ConsentType.AGE_CONFIRMATION,
            version: null,
            isAgreed: true,
          },
        ],
        NOW,
      );

      // then
      expect(saved[0]).toMatchObject({
        consentType: ConsentType.AGE_CONFIRMATION,
        version: null,
      });
    });

    it('재동의에서 지금 기준과 다른 연령 버전을 보내면 낡은 버전으로 거부한다 — 화면 숫자와 기록이 어긋나지 않는다', async () => {
      // when — 싱가포르(16) 사용자가 18 버전을 보낸다
      const recording = service.recordConsents(
        USER_ID,
        { market: UserMarket.GLOBAL, regionCode: 'SG' },
        [
          {
            consentType: ConsentType.AGE_CONFIRMATION,
            version: 'age-18',
            isAgreed: true,
          },
        ],
        NOW,
      );

      // then
      await expect(recording).rejects.toMatchObject({
        errorCode: ErrorCode.CONSENT_VERSION_STALE,
      });
    });
  });
});
