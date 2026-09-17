import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { BusinessException } from '@/common/exceptions/business.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';
import { EnvironmentVariables } from '@/config/env.validation';
import { Content } from '@/modules/content/entities/content.entity';
import { ContentService } from '@/modules/content/services/content.service';

import { AUDIO_URL_ISSUER } from '../audio-url-issuer';
import type { AudioUrlIssuer } from '../audio-url-issuer';
import { PUBLIC_SAMPLE_USER_ID } from '../playback.constant';
import { SignedAudioUrl } from '../playback.types';

export interface PublicSampleView {
  content: Content;
  audio: SignedAudioUrl;
}

/**
 * public-api.md 2.2 — 랜딩 페이지 Try 섹션이 로그인 없이 들려주는 샘플 한 편.
 *
 * 파일을 랜딩 저장소에 내려받아 두지 않고, **앱 재생과 같은 서명 URL**(CloudFront/S3 또는
 * local 스트리밍)을 짧은 만료로 발급한다. 원본 경로가 공개 HTML에 박히지 않고, 만료가 지나면
 * 링크가 죽는다 — 앱이 지키는 원칙(architecture.md 9.4)을 랜딩도 그대로 따른다.
 *
 * 앱의 발급(`AudioUrlService.issue`)과 다른 점:
 * - 사용자가 없다. 한도 판정·차감·라이브러리·진행률 조회가 없고, `audio_access_logs`도 남기지
 *   않는다(FK가 users를 가리킨다). 발급 사실은 구조화 로그로 남긴다.
 * - 대상은 요청이 아니라 **서버 설정**(`PUBLIC_SAMPLE_CONTENT_ID`)이 정한다. 로그인 없는
 *   경로에서 임의 콘텐츠 id를 받으면 전 카탈로그의 서명 URL 발급기가 된다.
 * - 회수·만료 판정은 앱과 같다(`getPublishedById`). 샘플로 지정한 콘텐츠가 회수되면 404다.
 */
@Injectable()
export class PublicSampleService {
  private readonly logger = new Logger(PublicSampleService.name);

  constructor(
    private readonly configService: ConfigService<EnvironmentVariables, true>,
    private readonly contentService: ContentService,
    @Inject(AUDIO_URL_ISSUER)
    private readonly audioUrlIssuer: AudioUrlIssuer,
  ) {}

  async get(now: Date): Promise<PublicSampleView> {
    const contentId = this.configService.get('PUBLIC_SAMPLE_CONTENT_ID', {
      infer: true,
    });
    if (!contentId) {
      throw new BusinessException({
        status: HttpStatus.NOT_FOUND,
        errorCode: ErrorCode.NOT_FOUND,
        message: '샘플 콘텐츠가 아직 준비되지 않았어요',
      });
    }

    const content = await this.contentService.getPublishedById(
      contentId,
      undefined,
      now,
    );

    const audio = this.audioUrlIssuer.sign(
      {
        contentId: content.id,
        userId: PUBLIC_SAMPLE_USER_ID,
        audioPath: content.audioPath,
      },
      now,
    );

    // URL 원문은 남기지 않는다 — 발급 사실만(domain.md 6.5와 같은 원칙)
    this.logger.log('public sample audio url issued', {
      content_id: content.id,
      expires_in_sec: audio.expiresInSec,
    });

    return { content, audio };
  }
}
