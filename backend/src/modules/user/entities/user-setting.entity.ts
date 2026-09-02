import {
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

import { BaseEntity } from '@/database/base.entity';

import { PlaybackRate } from '../user.enum';
import { User } from './user.entity';

/**
 * domain.md 3.5 — 사용자 설정. **네 개로 나뉘어 있던 설정 테이블을 하나로 통합한 것**이다
 * (B-1 결정 — 설정 항목은 계속 늘어나는데 그때마다 테이블을 만들 수 없다).
 *
 * **여기 두지 않는 것 셋을 기억한다.**
 * - OS 알림 권한 — user가 아니라 **device 단위**라 `device_tokens`에만 있다(3.6)
 * - 마케팅 수신 동의 — 상태의 소유자는 `consents`다(3.2, 합의 2026-08-06). 설정 화면의
 *   토글은 표시·철회 경로일 뿐 저장소가 아니다
 * - 방해금지(야간 발송 제한) — 개념 자체가 폐기됐다(`notification.md` 4.3)
 *
 * **행이 없는 사용자가 정상이다.** 설정을 한 번도 바꾼 적 없으면 행이 없고, 조회는 기본값을
 * 만들어 내려준다 — 조회가 쓰기를 유발하지 않는다(`settings-api.md` 4.1). 행 생성은 첫 PATCH다.
 */
@Entity('user_settings')
@Unique('uq_user_settings_user_id', ['userId'])
export class UserSetting extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'user_id',
    foreignKeyConstraintName: 'fk_user_settings_users',
  })
  user: User;

  /** 사용자 전역 기본 배속. 콘텐츠별이 아니다(`player.md` 4.2) */
  @Column({
    name: 'default_playback_rate',
    type: 'float',
    default: PlaybackRate.NORMAL,
  })
  defaultPlaybackRate: number;

  /**
   * 수면 타이머의 마지막 선택. **플레이어 소관이라 설정 API는 조회·변경 모두 하지 않는다**
   * (`settings-api.md` 8장).
   *
   * `varchar`로 두는 이유: domain.md 3.5가 `enum`이라고만 적고 **값 집합을 정하지 않았다.**
   * 수면 타이머가 P1이라 선택지가 확정되지 않았기 때문이다. 값이 정해지면 TypeScript enum을
   * 만들어 이 타입을 좁힌다(convention.md 4.2 — DB enum 타입은 쓰지 않는다).
   */
  @Column({
    name: 'sleep_timer_last_choice',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  sleepTimerLastChoice: string | null;

  /** 주제 자동 확장(FR-06, P1). MVP에서는 값만 저장되고 배치는 돌지 않는다 */
  @Column({ name: 'is_auto_expand_enabled', type: 'boolean', default: true })
  isAutoExpandEnabled: boolean;

  /**
   * 이어 PICK 알림 앱 토글(FR-19, P1).
   *
   * **컬럼명을 바꾸지 않는다.** 사용자 노출 명칭이 "이어 PICK 알림"으로 정해진 것은
   * 화면 이름의 결정이지 데이터 의미가 바뀐 것이 아니다(domain.md 3.5, 합의 2026-08-06).
   *
   * 발송 여부는 이 값과 `device_tokens.is_os_permission_granted`를 **둘 다** 본다
   * (`notification.md` 4.2) — 이 컬럼만으로 발송을 판정하지 않는다.
   */
  @Column({
    name: 'is_drip_notification_enabled',
    type: 'boolean',
    default: true,
  })
  isDripNotificationEnabled: boolean;
}
