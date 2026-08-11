import { Injectable, Logger } from '@nestjs/common';

import { ContentService } from '@/modules/content/services/content.service';
import { LibraryService } from '@/modules/library/library.service';

import { AudioUrlSigner } from '../audio-url.signer';
import { AudioAccessLogRepository } from '../repositories/audio-access-log.repository';
import { AudioUrlResult, IssueAudioUrlCommand } from '../playback.types';
import { PlaybackService } from './playback.service';
import { PlayPolicyService } from './play-policy.service';

/**
 * 서명 URL 발급(`player-api.md` 4.1) — **재생 중 갱신도 같은 경로다.**
 *
 * **발급과 재생 시작(4.2)을 합치지 않는다.** 차감은 재생이 **실제로 시작된 시점**에만
 * 일어난다(`paywall.md` 4.3) — 발급 시점에 세면 오디오 준비에 실패한 재생이 차감되고,
 * 반대로 발급을 재생 시작 뒤로 미루면 "탭 후 2초" 목표가 깨진다. 두 시점은 다른 사건이다.
 *
 * **발급도 한도 판정을 거치되 차감하지 않는다**(`architecture.md` 9.4 — 발급 시점 재검증).
 * 판정 함수는 재생 시작과 같은 것을 쓰고(`PlayPolicyService`), 발급은 그 결과로 허용·거부만
 * 한다.
 *
 * **트랜잭션으로 감싸지 않는다.** 조회 셋과 로그 적재 하나뿐이고 서로의 정합성이 요구되지
 * 않는다(architecture.md 8.7 — 조회 API는 트랜잭션으로 감싸지 않는 것이 기본이다).
 */
@Injectable()
export class AudioUrlService {
  private readonly logger = new Logger(AudioUrlService.name);

  constructor(
    private readonly playPolicyService: PlayPolicyService,
    private readonly playbackService: PlaybackService,
    private readonly contentService: ContentService,
    private readonly libraryService: LibraryService,
    private readonly audioAccessLogRepository: AudioAccessLogRepository,
    private readonly audioUrlSigner: AudioUrlSigner,
  ) {}

  async issue(command: IssueAudioUrlCommand): Promise<AudioUrlResult> {
    // 1. 회수된 콘텐츠는 여기서 막힌다 — **회수 반영의 차단 지점이다**(9.4)
    const content = await this.contentService.getPublishedById(
      command.contentId,
    );

    // 2. 목록에서 걸렀어도 다시 확인한다. 차감은 하지 않는다
    await this.playPolicyService.assertPlayable(
      command.userId,
      command.contentId,
      command.now,
    );

    const [libraryItem, progress] = await Promise.all([
      this.libraryService.findItemByContentId(
        command.userId,
        command.contentId,
      ),
      this.playbackService.findProgress(command.userId, command.contentId),
    ]);

    // 3. 만료는 수 분 단위. 값은 서버 설정이고 계약은 `expires_in_sec`으로 값에 독립적이다
    const audio = this.audioUrlSigner.sign(
      command.contentId,
      command.userId,
      command.now,
    );

    // 4. **발급 사실만** 남긴다. URL 원문은 저장하지 않는다(domain.md 6.5)
    await this.audioAccessLogRepository.insert({
      contentId: command.contentId,
      userId: command.userId,
      deviceId: command.deviceId,
      issuedAt: command.now,
      expiresAt: audio.expiresAt,
      ipHash: this.audioUrlSigner.hashIp(command.ip),
    });

    // 감사·이상 탐지 근거(convention.md 8.3 — 콘텐츠 접근). URL은 로그에도 남기지 않는다
    this.logger.log('audio url issued', {
      userId: command.userId,
      contentId: command.contentId,
      expiresAt: audio.expiresAt.toISOString(),
    });

    return {
      content: {
        id: content.id,
        title: content.title,
        authorName: content.authorName,
        sourceName: content.sourceName,
        // 빈 문자열은 "원문이 없다"와 같은 뜻이다 — 화면이 [원문 보기]를 그리지 않게 null로 좁힌다
        sourceUrl: content.sourceUrl ? content.sourceUrl : null,
        durationSec: content.durationSec,
        thumbnailUrl: content.thumbnailUrl,
        contentVersion: content.contentVersion,
      },
      libraryItem: libraryItem
        ? { id: libraryItem.id, status: libraryItem.status }
        : null,
      progress,
      audio,
    };
  }
}
