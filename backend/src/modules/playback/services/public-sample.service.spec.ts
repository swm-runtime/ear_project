import { ConfigService } from '@nestjs/config';

import { BusinessException } from '@/common/exceptions/business.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';
import { Content } from '@/modules/content/entities/content.entity';
import { ContentService } from '@/modules/content/services/content.service';

import type { AudioUrlIssuer } from '../audio-url-issuer';
import { PUBLIC_SAMPLE_USER_ID } from '../playback.constant';
import { PublicSampleService } from './public-sample.service';

const NOW = new Date('2026-09-18T00:00:00.000Z');
const CONTENT_ID = '11111111-1111-4111-8111-111111111111';

function buildContent(): Content {
  return {
    id: CONTENT_ID,
    title: '말이 막혀도 생각은 돌아간다',
    authorName: '윤태경',
    sourceName: '이어 오리지널',
    audioPath: 'a1b2c3.mp3',
    durationSec: 780,
    thumbnailUrl: 'https://cdn.example/thumb.webp',
  } as Content;
}

function buildService(contentId: string | undefined) {
  const configService = {
    get: jest.fn().mockReturnValue(contentId),
  } as unknown as ConfigService;
  const contentService = {
    getPublishedById: jest.fn().mockResolvedValue(buildContent()),
  } as unknown as jest.Mocked<ContentService>;
  const issuer: jest.Mocked<AudioUrlIssuer> = {
    sign: jest.fn().mockReturnValue({
      url: 'https://cdn.example/a1b2c3.mp3?sig=x',
      expiresAt: new Date(NOW.getTime() + 300_000),
      expiresInSec: 300,
    }),
  };
  return {
    service: new PublicSampleService(
      configService as never,
      contentService,
      issuer,
    ),
    contentService,
    issuer,
  };
}

describe('PublicSampleService', () => {
  it('샘플 콘텐츠가 설정되지 않았으면 404로 답한다 — 랜딩은 준비 중 상태를 그린다', async () => {
    // given
    const { service, contentService } = buildService(undefined);

    // when / then
    await expect(service.get(NOW)).rejects.toMatchObject({
      errorCode: ErrorCode.NOT_FOUND,
    });
    await expect(service.get(NOW)).rejects.toBeInstanceOf(BusinessException);
    expect(contentService.getPublishedById).not.toHaveBeenCalled();
  });

  it('설정된 콘텐츠를 앱과 같은 노출 판정으로 읽고 자리표시 사용자로 서명한다', async () => {
    // given
    const { service, contentService, issuer } = buildService(CONTENT_ID);

    // when
    const view = await service.get(NOW);

    // then — 회수·만료 판정은 요청 시각 기준(getPublishedById의 now)
    expect(contentService.getPublishedById).toHaveBeenCalledWith(
      CONTENT_ID,
      undefined,
      NOW,
    );
    expect(issuer.sign).toHaveBeenCalledWith(
      {
        contentId: CONTENT_ID,
        userId: PUBLIC_SAMPLE_USER_ID,
        audioPath: 'a1b2c3.mp3',
      },
      NOW,
    );
    expect(view.audio.expiresInSec).toBe(300);
    expect(view.content.title).toBe('말이 막혀도 생각은 돌아간다');
  });

  it('회수된 콘텐츠면 콘텐츠 서비스의 거부를 그대로 올린다 — 샘플이라고 우회하지 않는다', async () => {
    // given
    const { service, contentService, issuer } = buildService(CONTENT_ID);
    contentService.getPublishedById.mockRejectedValue(
      new BusinessException({
        status: 403,
        errorCode: ErrorCode.CONTENT_WITHDRAWN,
        message: '제공이 종료된 콘텐츠예요',
      }),
    );

    // when / then
    await expect(service.get(NOW)).rejects.toMatchObject({
      errorCode: ErrorCode.CONTENT_WITHDRAWN,
    });
    expect(issuer.sign).not.toHaveBeenCalled();
  });
});
