import { Injectable, Logger } from '@nestjs/common';

import { ScriptSegment } from '@/modules/content/content.types';
import { ContentService } from '@/modules/content/services/content.service';

import { PlayPolicyService } from './play-policy.service';

export interface GetScriptCommand {
  userId: string;
  contentId: string;
  now: Date;
}

export interface ScriptResult {
  segments: ScriptSegment[];
}

/**
 * 대본(자막) 조회(`player-api.md` 4.7, KAN-71) — **오디오와 같은 접근 통제**를 받는다(architecture.md 9.4 —
 * "오디오만 막고 텍스트를 열어두지 않는다"). 회수·미발행은 `getPublishedById`가, 한도·구독은 재생 발급과
 * **같은 판정 함수**(`PlayPolicyService.assertPlayable`)가 막는다 — 판정이 두 벌이면 오디오는 막히고 대본은
 * 열리는 어긋남이 생긴다. 차감은 하지 않는다(발급과 같다).
 *
 * 스크립트가 없는 콘텐츠는 404가 아니라 빈 배열이다 — 없는 것은 정상 상태고, 화면은 빈 배열도 "없음"으로 그린다.
 */
@Injectable()
export class ScriptService {
  private readonly logger = new Logger(ScriptService.name);

  constructor(
    private readonly contentService: ContentService,
    private readonly playPolicyService: PlayPolicyService,
  ) {}

  async get(command: GetScriptCommand): Promise<ScriptResult> {
    await this.contentService.getPublishedById(
      command.contentId,
      undefined,
      command.now,
    );
    await this.playPolicyService.assertPlayable(
      command.userId,
      command.contentId,
      command.now,
    );

    const segments = await this.contentService.findScriptSegments(
      command.contentId,
    );

    // 콘텐츠 접근 기록(convention.md 8.3) — 본문은 남기지 않는다
    this.logger.log('script read', {
      user_id: command.userId,
      content_id: command.contentId,
      segment_count: segments.length,
    });

    return { segments };
  }
}
