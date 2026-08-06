import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ContentModule } from '@/modules/content/content.module';
import { DripModule } from '@/modules/drip/drip.module';
import { LibraryModule } from '@/modules/library/library.module';
import { SubscriptionModule } from '@/modules/subscription/subscription.module';
import { UserModule } from '@/modules/user/user.module';

import { PlaybackProgress } from './entities/playback-progress.entity';
import { PlayRecord } from './entities/play-record.entity';
import { UserSignal } from './entities/user-signal.entity';
import { PlayController } from './play.controller';
import { PlaybackProgressRepository } from './repositories/playback-progress.repository';
import { PlayRecordRepository } from './repositories/play-record.repository';
import { UserSignalRepository } from './repositories/user-signal.repository';
import { PlayService } from './services/play.service';
import { PlaybackService } from './services/playback.service';

/**
 * domain.md 2장 — `playback`은 `playback_progresses` · `play_records` · `user_signals`를
 * 소유하며 `content` · `library` · `subscription`에 의존한다.
 *
 * 여기에 두 방향을 더한다. **`user`** — 한도 판정에 `users.tier`가 필요하다(`drip`이 편성
 * 편수 판정에 `user`를 더한 것과 같은 이유). **`drip`** — 재생한 콘텐츠는 드립 재적립에서
 * 영구 제외되므로(FR-16) `drip_excluded_contents`에 적재해야 한다.
 *
 * 순환은 생기지 않는다 — `user`와 `drip` 어느 쪽도 `playback`을 모른다
 * (`drip` → `library`는 `playback` → `library`와 같은 방향이다).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([PlaybackProgress, PlayRecord, UserSignal]),
    ContentModule,
    LibraryModule,
    SubscriptionModule,
    UserModule,
    DripModule,
  ],
  controllers: [PlayController],
  providers: [
    PlaybackProgressRepository,
    PlayRecordRepository,
    UserSignalRepository,
    PlaybackService,
    PlayService,
  ],
  exports: [PlaybackService],
})
export class PlaybackModule {}
