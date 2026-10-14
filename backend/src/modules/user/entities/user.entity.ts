import { Column, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';

import { BaseEntity } from '@/database/base.entity';

import {
  OnboardingStep,
  SocialProvider,
  UserMarket,
  UserRole,
  UserStatus,
  UserTier,
} from '../user.enum';

/** domain.md 3.1 */
@Entity('users')
@Unique('uq_users_provider_provider_user_id', ['provider', 'providerUserId'])
@Index('idx_users_status', ['status'])
export class User extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'provider', type: 'varchar', length: 20 })
  provider: SocialProvider;

  @Column({ name: 'provider_user_id', type: 'varchar', length: 255 })
  providerUserId: string;

  /** null = 제공자 미제공 또는 마스킹 주소. 유니크가 아니다 — 식별자가 아니라 연락처다 */
  @Column({ name: 'email', type: 'varchar', length: 320, nullable: true })
  email: string | null;

  /** 소유 확인 완료 여부. `email`이 있다고 도달을 보장하지 않으므로 별개 값이다 */
  @Column({ name: 'is_email_verified', type: 'boolean', default: false })
  isEmailVerified: boolean;

  /**
   * null = 아직 정해지지 않음. 제공자가 주면 초기값으로 쓰고, 없으면 비워 둔다.
   * **값은 온보딩의 닉네임 입력 단계에서 채운다** (domain.md 3.1).
   * 기본 문자열을 넣으면 "미정"과 "사용자가 그렇게 정함"이 구분되지 않는다.
   */
  @Column({ name: 'nickname', type: 'varchar', length: 50, nullable: true })
  nickname: string | null;

  /**
   * 제공자 프로필 사진 URL (domain.md 3.1, 2026-09-16). 파일을 받아 두지 않고 제공자
   * CDN 주소만 보관하며, **로그인할 때마다 제공자 값으로 덮어쓴다** — 제공자 쪽에서
   * 사진을 바꾸면 옛 URL이 죽으므로 저장값을 신뢰하지 않는다. null = 제공자가 주지 않음.
   */
  @Column({
    name: 'profile_image_url',
    type: 'varchar',
    length: 2048,
    nullable: true,
  })
  profileImageUrl: string | null;

  @Column({ name: 'role', type: 'varchar', length: 20, default: UserRole.USER })
  role: UserRole;

  /** 비정규화 캐시. 진실의 원천은 `subscriptions`이며 갱신은 SubscriptionService만 한다 */
  @Column({
    name: 'tier',
    type: 'varchar',
    length: 20,
    default: UserTier.LIGHT,
  })
  tier: UserTier;

  /**
   * 가입 체험이 끝나는 시각(배타 경계, 05:00 KST 경계에 맞춰져 있다 — `signup-trial.util.ts`. 2026-10-12 전환 전에 쓴 04:00 값은 전환일에 +1시간 이동, domain.md 1.2).
   * **가입할 때 한 번 쓰고 다시 쓰지 않는다.** `NULL`은 체험을 받지 않은 계정이다(스위치가 꺼져 있을 때
   * 가입했거나 기능 도입 전 가입). 스위치를 꺼도 이미 받은 값은 지우지 않는다 — 가입 때 안내한 날짜가 약속이다.
   */
  @Column({ name: 'trial_ends_at', type: 'timestamptz', nullable: true })
  trialEndsAt: Date | null;

  @Column({
    name: 'status',
    type: 'varchar',
    length: 20,
    default: UserStatus.ACTIVE,
  })
  status: UserStatus;

  @Column({ name: 'onboarding_completed', type: 'boolean', default: false })
  onboardingCompleted: boolean;

  @Column({
    name: 'onboarding_step',
    type: 'varchar',
    length: 20,
    default: OnboardingStep.TOPIC,
  })
  onboardingStep: OnboardingStep;

  @Column({
    name: 'onboarding_completed_at',
    type: 'timestamptz',
    nullable: true,
  })
  onboardingCompletedAt: Date | null;

  /** 커리어 3종은 전부 선택 입력이라 users에 병합한다 (domain.md 3.1 — C-2) */
  @Column({
    name: 'job_category',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  jobCategory: string | null;

  @Column({ name: 'job_title', type: 'varchar', length: 100, nullable: true })
  jobTitle: string | null;

  @Column({ name: 'years_of_experience', type: 'int', nullable: true })
  yearsOfExperience: number | null;

  @Column({ name: 'withdrawn_at', type: 'timestamptz', nullable: true })
  withdrawnAt: Date | null;

  /**
   * 시장(`global-api.md` 2.1). **계정 생성 시 1회** `market.policy.ts`가 정하고 이후 바꾸지 않는다 —
   * 로그인·기기 등록이 다른 로케일을 보내도 그대로다. 기존 가입자는 마이그레이션 기본값 `kr`.
   */
  @Column({
    name: 'market',
    type: 'varchar',
    length: 20,
    default: UserMarket.KR,
  })
  market: UserMarket;

  /**
   * 기기 언어(BCP 47, 예 `en-US`). 표시 언어·푸시·메일 언어의 원천. 가입·로그인·기기 등록마다 갱신한다.
   * null = 구 앱(보낸 적 없음)
   */
  @Column({
    name: 'language_code',
    type: 'varchar',
    length: 16,
    nullable: true,
  })
  languageCode: string | null;

  /** 기기 지역(ISO 3166-1 alpha-2, 대문자). 통계용 — 판정에 쓰지 않는다 */
  @Column({ name: 'region_code', type: 'varchar', length: 2, nullable: true })
  regionCode: string | null;

  /** 기기 시간대(IANA, 예 `America/New_York`). 드립 발송 그룹에만 쓴다 — 서비스 날짜 경계는 바꾸지 않는다 */
  @Column({ name: 'timezone', type: 'varchar', length: 64, nullable: true })
  timezone: string | null;
}
