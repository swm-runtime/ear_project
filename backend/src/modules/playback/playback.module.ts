import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AudioDelivery, EnvironmentVariables } from '@/config/env.validation';
import { ContentModule } from '@/modules/content/content.module';
import { DripModule } from '@/modules/drip/drip.module';
import { IdempotencyModule } from '@/modules/idempotency/idempotency.module';
import { LibraryModule } from '@/modules/library/library.module';
import { SubscriptionModule } from '@/modules/subscription/subscription.module';
import { UserModule } from '@/modules/user/user.module';

import { AUDIO_URL_ISSUER, AudioUrlIssuer } from './audio-url-issuer';
import { AudioUrlSigner } from './audio-url.signer';
import { CloudFrontAudioUrlSigner } from './cloudfront-audio-url.signer';
import { AudioStreamController } from './controllers/audio-stream.controller';
import { PlaybackProgressController } from './controllers/playback-progress.controller';
import { PlayController } from './controllers/play.controller';
import { AudioAccessLog } from './entities/audio-access-log.entity';
import { PlaybackProgress } from './entities/playback-progress.entity';
import { PlayRecord } from './entities/play-record.entity';
import { SourceLinkClick } from './entities/source-link-click.entity';
import { UserSignal } from './entities/user-signal.entity';
import { AudioAccessLogRepository } from './repositories/audio-access-log.repository';
import { PlaybackProgressRepository } from './repositories/playback-progress.repository';
import { PlayRecordRepository } from './repositories/play-record.repository';
import { SourceLinkClickRepository } from './repositories/source-link-click.repository';
import { UserSignalRepository } from './repositories/user-signal.repository';
import { AudioStreamService } from './services/audio-stream.service';
import { AudioUrlService } from './services/audio-url.service';
import { PlaybackProgressService } from './services/playback-progress.service';
import { PlaybackSignalService } from './services/playback-signal.service';
import { PlayPolicyService } from './services/play-policy.service';
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
 *
 * 플레이어 계약(`player-api.md`)을 구현하면서 **`audio_access_logs` · `source_link_clicks`
 * 두 Entity와 `idempotency` 의존이 늘었다.** 멱등키는 `replay`·원문 클릭의 중복 적재를
 * 흡수하는 데 필요하다(4.4 · 4.5) — 두 테이블 다 유니크 제약이 없어 DB가 막아 주지 않는다.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      PlaybackProgress,
      PlayRecord,
      UserSignal,
      AudioAccessLog,
      SourceLinkClick,
    ]),
    ContentModule,
    LibraryModule,
    SubscriptionModule,
    UserModule,
    DripModule,
    IdempotencyModule,
  ],
  controllers: [
    PlayController,
    PlaybackProgressController,
    AudioStreamController,
  ],
  providers: [
    PlaybackProgressRepository,
    PlayRecordRepository,
    UserSignalRepository,
    AudioAccessLogRepository,
    SourceLinkClickRepository,
    AudioUrlSigner,
    /**
     * 발급기는 배포 토폴로지가 고른다(`AUDIO_DELIVERY`). 로컬은 우리 서버가 내보내고,
     * cloudfront는 CDN이 내보낸다. 두 구현의 계약은 `AudioUrlIssuer` 하나다.
     */
    {
      provide: AUDIO_URL_ISSUER,
      inject: [ConfigService, AudioUrlSigner],
      useFactory: (
        configService: ConfigService<EnvironmentVariables, true>,
        localSigner: AudioUrlSigner,
      ): AudioUrlIssuer =>
        configService.get('AUDIO_DELIVERY', { infer: true }) ===
        AudioDelivery.CLOUDFRONT
          ? new CloudFrontAudioUrlSigner(configService)
          : localSigner,
    },
    PlaybackService,
    PlayPolicyService,
    PlayService,
    AudioUrlService,
    AudioStreamService,
    PlaybackProgressService,
    PlaybackSignalService,
  ],
  exports: [PlaybackService],
})
export class PlaybackModule {}
