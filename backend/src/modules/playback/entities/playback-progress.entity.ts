import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

import { BaseEntity } from '@/database/base.entity';
import { Content } from '@/modules/content/entities/content.entity';
import { User } from '@/modules/user/entities/user.entity';

/**
 * domain.md 6.2 — **재생 위치의 단독 소유자다**(A-1).
 * `library_items.resume_position_sec` · `PlaybackSession`을 폐기하고 이 테이블 하나로 통일했다.
 * user × content 당 1건이다.
 *
 * **라이브러리에서 삭제해도 이 행은 남긴다**(C-4). 탐색에서 다시 담으면 듣던 위치가 살아
 * 있어야 하기 때문이며, 삭제하는 것은 회원 탈퇴 시점뿐이다.
 *
 * `playback_rate`를 두지 않는다 — 콘텐츠별 값이 아니라 사용자 전역 설정이라
 * `user_settings.default_playback_rate`가 소유한다.
 */
@Entity('playback_progresses')
@Unique('uq_playback_progresses_user_id_content_id', ['userId', 'contentId'])
export class PlaybackProgress extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'user_id',
    foreignKeyConstraintName: 'fk_playback_progresses_users',
  })
  user: User;

  @Column({ name: 'content_id', type: 'uuid' })
  contentId: string;

  @ManyToOne(() => Content)
  @JoinColumn({
    name: 'content_id',
    foreignKeyConstraintName: 'fk_playback_progresses_contents',
  })
  content: Content;

  @Column({ name: 'position_sec', type: 'int', default: 0 })
  positionSec: number;

  /**
   * 완청 판정용(`player.md` 4.4). 2배속으로 끝까지 들은 것은 완청이지만
   * **시크로 끝까지 점프한 것은 완청이 아니다** — `position_sec`만으로는 이 구분이 불가능하다.
   */
  @Column({ name: 'max_reached_sec', type: 'int', default: 0 })
  maxReachedSec: number;
}
