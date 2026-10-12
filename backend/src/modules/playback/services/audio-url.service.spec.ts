import { AudioQuality } from '@/modules/content/content.enum';
import { ContentService } from '@/modules/content/services/content.service';
import { LibraryService } from '@/modules/library/library.service';
import { PlanService } from '@/modules/subscription/services/plan.service';
import { UserService } from '@/modules/user/services/user.service';
import { UserSettingService } from '@/modules/user/services/user-setting.service';
import { UserTier } from '@/modules/user/user.enum';

import type { AudioUrlIssuer } from '../audio-url-issuer';
import { AudioUrlSigner } from '../audio-url.signer';
import { AudioAccessLogRepository } from '../repositories/audio-access-log.repository';
import { AudioUrlService } from './audio-url.service';
import { PlaybackService } from './playback.service';
import { PlayPolicyService } from './play-policy.service';

const NOW = new Date('2026-10-06T03:00:00.000Z');
const USER_ID = '11111111-1111-4111-8111-111111111111';
const CONTENT_ID = 'aaaaaaaa-1111-4111-8111-111111111111';

/** 발급의 음질 판정(player.md 4.9) — 어떤 파일을 서명하는지가 핵심이라 서명기에 넘긴 경로를 본다 */
describe('AudioUrlService — 음질(KAN-141)', () => {
  let service: AudioUrlService;
  let contentService: jest.Mocked<ContentService>;
  let userService: jest.Mocked<UserService>;
  let userSettingService: jest.Mocked<UserSettingService>;
  let planService: jest.Mocked<PlanService>;
  let issuer: jest.Mocked<AudioUrlIssuer>;

  const renditions = [
    { quality: AudioQuality.COMPRESSED, path: 'audio/c.mp3' },
    { quality: AudioQuality.LOSSLESS, path: 'audio/l.flac' },
  ];

  const issue = (quality?: AudioQuality) =>
    service.issue({
      userId: USER_ID,
      contentId: CONTENT_ID,
      deviceId: 'device-1',
      ip: null,
      now: NOW,
      quality,
    });

  beforeEach(() => {
    contentService = {
      getPublishedById: jest.fn().mockResolvedValue({
        id: CONTENT_ID,
        title: '제목',
        authorName: null,
        sourceName: '출처',
        sourceUrl: '',
        durationSec: 600,
        thumbnailUrl: 'https://cdn/thumb.webp',
        contentVersion: 1,
        audioPath: 'audio/c.mp3',
      }),
      findTopicViews: jest.fn().mockResolvedValue([]),
      findScriptSummary: jest
        .fn()
        .mockResolvedValue({ hasScript: false, sections: [] }),
      findAudioRenditions: jest.fn().mockResolvedValue(renditions),
    } as unknown as jest.Mocked<ContentService>;
    userService = {
      getById: jest
        .fn()
        .mockResolvedValue({ id: USER_ID, tier: UserTier.LIGHT }),
    } as unknown as jest.Mocked<UserService>;
    userSettingService = {
      getSettings: jest
        .fn()
        .mockResolvedValue({ preferredAudioQuality: AudioQuality.COMPRESSED }),
    } as unknown as jest.Mocked<UserSettingService>;
    planService = {
      getMaxAudioQuality: jest.fn().mockResolvedValue(AudioQuality.AAC),
    } as unknown as jest.Mocked<PlanService>;
    issuer = {
      sign: jest.fn().mockReturnValue({
        url: 'https://cdn/signed',
        expiresAt: new Date(NOW.getTime() + 300_000),
        expiresInSec: 300,
      }),
    };

    service = new AudioUrlService(
      {
        assertPlayable: jest.fn().mockResolvedValue(undefined),
      } as unknown as PlayPolicyService,
      {
        findProgress: jest.fn().mockResolvedValue(null),
      } as unknown as PlaybackService,
      contentService,
      {
        findItemByContentId: jest.fn().mockResolvedValue(null),
      } as unknown as LibraryService,
      userService,
      userSettingService,
      planService,
      { insert: jest.fn() } as unknown as AudioAccessLogRepository,
      { hashIp: jest.fn().mockReturnValue(null) } as unknown as AudioUrlSigner,
      issuer,
    );
  });

  it('대본이 있으면 has_script 와 구간 제목을 함께 내려준다 — 세그먼트 본문은 읽지 않는다(KAN-144)', async () => {
    const sections = [
      { start_sec: 0, title: '인트로' },
      { start_sec: 74.8, title: '깬 직후의 멍함' },
    ];
    contentService.findScriptSummary.mockResolvedValue({
      hasScript: true,
      sections,
    });

    const result = await issue();

    expect(contentService.findScriptSummary).toHaveBeenCalledWith(CONTENT_ID);
    expect(result.hasScript).toBe(true);
    expect(result.sections).toEqual(sections);
  });

  it('대본이 없으면 has_script 는 false, 구간은 빈 배열이다', async () => {
    const result = await issue();

    expect(result.hasScript).toBe(false);
    expect(result.sections).toEqual([]);
  });

  it('압축 음질은 compressed 행이 어긋나도 contents.audio_path 로 서명한다 — 2026-10-07 개발계 동기화 누락 재발 방지', async () => {
    contentService.findAudioRenditions.mockResolvedValue([
      { quality: AudioQuality.COMPRESSED, path: 'audio/stale.mp3' },
      { quality: AudioQuality.LOSSLESS, path: 'audio/l.flac' },
    ] as never);

    const result = await issue();

    expect(result.audio.quality).toBe(AudioQuality.COMPRESSED);
    expect(issuer.sign).toHaveBeenCalledWith(
      expect.objectContaining({ audioPath: 'audio/c.mp3' }),
      NOW,
    );
  });

  it('요청이 없으면 설정의 선택값으로 판정한다', async () => {
    const result = await issue();

    expect(userSettingService.getSettings).toHaveBeenCalledWith(USER_ID);
    expect(result.audio).toMatchObject({
      quality: AudioQuality.COMPRESSED,
      requestedQuality: AudioQuality.COMPRESSED,
      fallbackReason: null,
      availableQualities: [AudioQuality.COMPRESSED, AudioQuality.LOSSLESS],
    });
    expect(issuer.sign).toHaveBeenCalledWith(
      expect.objectContaining({ audioPath: 'audio/c.mp3' }),
      NOW,
    );
  });

  it('고른 적 없으면(설정 null) 티어가 허용하는 가장 높은 선택지로 판정한다 — 허용 최대 aac 는 compressed, lossless 는 lossless', async () => {
    userSettingService.getSettings.mockResolvedValue({
      preferredAudioQuality: null,
    } as never);

    const free = await issue();
    expect(free.audio).toMatchObject({
      quality: AudioQuality.COMPRESSED,
      requestedQuality: AudioQuality.COMPRESSED,
      fallbackReason: null,
    });

    planService.getMaxAudioQuality.mockResolvedValue(AudioQuality.LOSSLESS);
    const pro = await issue();
    expect(pro.audio).toMatchObject({
      quality: AudioQuality.LOSSLESS,
      requestedQuality: AudioQuality.LOSSLESS,
      fallbackReason: null,
    });
    expect(issuer.sign).toHaveBeenLastCalledWith(
      expect.objectContaining({ audioPath: 'audio/l.flac' }),
      NOW,
    );
  });

  it('요청 음질이 있으면 설정을 읽지 않고 그것으로 판정한다 — 갱신 호출이 처음 음질을 되돌려 보낸다', async () => {
    planService.getMaxAudioQuality.mockResolvedValue(AudioQuality.LOSSLESS);

    const result = await issue(AudioQuality.LOSSLESS);

    expect(userSettingService.getSettings).not.toHaveBeenCalled();
    expect(result.audio.quality).toBe(AudioQuality.LOSSLESS);
    expect(issuer.sign).toHaveBeenCalledWith(
      expect.objectContaining({ audioPath: 'audio/l.flac' }),
      NOW,
    );
  });

  it('티어가 허용하지 않으면 허용 범위의 파일로 깎아 서명하고 not_allowed 를 알린다 — 거절하지 않는다', async () => {
    // given — 무료(허용 최대 aac)가 무손실을 요청, 콘텐츠는 압축·무손실만 보유
    const result = await issue(AudioQuality.LOSSLESS);

    expect(result.audio).toMatchObject({
      quality: AudioQuality.COMPRESSED,
      requestedQuality: AudioQuality.LOSSLESS,
      fallbackReason: 'not_allowed',
    });
    expect(issuer.sign).toHaveBeenCalledWith(
      expect.objectContaining({ audioPath: 'audio/c.mp3' }),
      NOW,
    );
  });

  it('허용은 저장 티어로 본다 — 가입 체험은 음질을 바꾸지 않는다', async () => {
    await issue(AudioQuality.AAC);

    expect(planService.getMaxAudioQuality).toHaveBeenCalledWith(UserTier.LIGHT);
  });

  it('음질 행이 하나도 없어도(있을 수 없는 상태) contents.audio_path 로 서명해 재생이 멈추지 않는다', async () => {
    contentService.findAudioRenditions.mockResolvedValue([]);

    const result = await issue();

    expect(result.audio.quality).toBe(AudioQuality.COMPRESSED);
    expect(issuer.sign).toHaveBeenCalledWith(
      expect.objectContaining({ audioPath: 'audio/c.mp3' }),
      NOW,
    );
  });
});
