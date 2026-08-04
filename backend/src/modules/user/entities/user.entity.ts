import { Column, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';

import { BaseEntity } from '@/database/base.entity';

import {
  OnboardingStep,
  SocialProvider,
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

  @Column({ name: 'nickname', type: 'varchar', length: 50 })
  nickname: string;

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
}
