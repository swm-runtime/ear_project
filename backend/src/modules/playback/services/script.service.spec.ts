import { BusinessForbiddenException } from '@/common/exceptions/business-forbidden.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';
import { ContentService } from '@/modules/content/services/content.service';

import { PlayPolicyService } from './play-policy.service';
import { ScriptService } from './script.service';

const NOW = new Date('2026-09-19T09:00:00.000Z');
const USER_ID = '11111111-1111-4111-8111-111111111111';
const CONTENT_ID = 'aaaaaaaa-1111-4111-8111-111111111111';
const SEGMENTS = [
  { start_sec: 0, end_sec: 12.4, speaker: '윤아', text: '첫 턴' },
  { start_sec: 12.4, end_sec: 20, speaker: '이음', text: '둘째 턴' },
];

describe('ScriptService — 대본 조회(player-api.md 4.7)', () => {
  let service: ScriptService;
  let contentService: jest.Mocked<ContentService>;
  let playPolicyService: jest.Mocked<PlayPolicyService>;

  beforeEach(() => {
    contentService = {
      getPublishedById: jest.fn().mockResolvedValue({ id: CONTENT_ID }),
      findScriptSegments: jest.fn().mockResolvedValue(SEGMENTS),
    } as unknown as jest.Mocked<ContentService>;
    playPolicyService = {
      assertPlayable: jest.fn().mockResolvedValue({
        deductsQuota: true,
        opensReplayWindow: true,
        dailyPlayLimit: 2,
      }),
    } as unknown as jest.Mocked<PlayPolicyService>;

    service = new ScriptService(contentService, playPolicyService);
  });

  it('재생 발급과 같은 판정(회수 → 한도)을 거친 뒤 세그먼트를 그대로 돌려준다', async () => {
    const result = await service.get({
      userId: USER_ID,
      contentId: CONTENT_ID,
      now: NOW,
    });

    expect(contentService.getPublishedById).toHaveBeenCalledWith(
      CONTENT_ID,
      undefined,
      NOW,
    );
    expect(playPolicyService.assertPlayable).toHaveBeenCalledWith(
      USER_ID,
      CONTENT_ID,
      NOW,
    );
    expect(result.segments).toEqual(SEGMENTS);
  });

  it('스크립트가 없는 콘텐츠는 404 가 아니라 빈 배열이다', async () => {
    contentService.findScriptSegments.mockResolvedValue([]);

    const result = await service.get({
      userId: USER_ID,
      contentId: CONTENT_ID,
      now: NOW,
    });

    expect(result.segments).toEqual([]);
  });

  it('재생 권한이 없으면 오디오 발급과 같은 에러로 거부하고 본문을 읽지 않는다 — 텍스트만 열어두지 않는다(9.4)', async () => {
    playPolicyService.assertPlayable.mockRejectedValue(
      new BusinessForbiddenException({
        errorCode: ErrorCode.PLAY_LIMIT_EXCEEDED,
        message: '한도 소진',
      }),
    );

    await expect(
      service.get({ userId: USER_ID, contentId: CONTENT_ID, now: NOW }),
    ).rejects.toBeInstanceOf(BusinessForbiddenException);
    expect(contentService.findScriptSegments).not.toHaveBeenCalled();
  });
});
