import {
  AudioQuality,
  OFFERED_AUDIO_QUALITIES,
  defaultAudioQualityFor,
} from '@/modules/content/content.enum';

import {
  resolveAudioQuality,
  sortAudioQualities,
} from './audio-quality.policy';

const ALL = [AudioQuality.COMPRESSED, AudioQuality.AAC, AudioQuality.LOSSLESS];

/** player.md 4.9 — 음질 판정은 거절하지 않고 깎는다 */
describe('resolveAudioQuality', () => {
  it('허용되고 파일도 있으면 요청 그대로다', () => {
    expect(
      resolveAudioQuality({
        requested: AudioQuality.LOSSLESS,
        maxAllowed: AudioQuality.LOSSLESS,
        available: ALL,
      }),
    ).toEqual({
      quality: AudioQuality.LOSSLESS,
      requestedQuality: AudioQuality.LOSSLESS,
      fallbackReason: null,
    });
  });

  it('티어가 허용하지 않으면 허용 최대로 깎고 not_allowed 다 — 화면은 잠금·구독 안내를 그린다', () => {
    expect(
      resolveAudioQuality({
        requested: AudioQuality.LOSSLESS,
        maxAllowed: AudioQuality.AAC,
        available: ALL,
      }),
    ).toEqual({
      quality: AudioQuality.AAC,
      requestedQuality: AudioQuality.LOSSLESS,
      fallbackReason: 'not_allowed',
    });
  });

  it('콘텐츠에 그 음질 파일이 없으면 있는 것 중 가장 높은 것으로 내리고 not_available 이다 — 기존 발행분 40편', () => {
    expect(
      resolveAudioQuality({
        requested: AudioQuality.LOSSLESS,
        maxAllowed: AudioQuality.LOSSLESS,
        available: [AudioQuality.COMPRESSED],
      }),
    ).toEqual({
      quality: AudioQuality.COMPRESSED,
      requestedQuality: AudioQuality.LOSSLESS,
      fallbackReason: 'not_available',
    });
  });

  it('허용도 안 되고 파일도 없으면 not_allowed 다 — 사용자가 할 수 있는 일(구독)이 있는 쪽을 알린다', () => {
    expect(
      resolveAudioQuality({
        requested: AudioQuality.LOSSLESS,
        maxAllowed: AudioQuality.AAC,
        available: [AudioQuality.COMPRESSED],
      }).fallbackReason,
    ).toBe('not_allowed');
  });

  it('요청보다 낮은 음질만 허용돼도 그 음질이 없으면 더 아래로 내려간다', () => {
    expect(
      resolveAudioQuality({
        requested: AudioQuality.AAC,
        maxAllowed: AudioQuality.AAC,
        available: [AudioQuality.COMPRESSED, AudioQuality.LOSSLESS],
      }),
    ).toMatchObject({
      quality: AudioQuality.COMPRESSED,
      fallbackReason: 'not_available',
    });
  });

  it('보유 목록이 비어 있어도(있을 수 없는 상태) compressed 로 돌려 재생이 멈추지 않게 한다', () => {
    expect(
      resolveAudioQuality({
        requested: AudioQuality.COMPRESSED,
        maxAllowed: AudioQuality.LOSSLESS,
        available: [],
      }),
    ).toMatchObject({
      quality: AudioQuality.COMPRESSED,
      fallbackReason: 'not_available',
    });
  });
});

describe('sortAudioQualities', () => {
  it('오름차순으로 정렬하고 중복을 없앤다', () => {
    expect(
      sortAudioQualities([
        AudioQuality.LOSSLESS,
        AudioQuality.COMPRESSED,
        AudioQuality.COMPRESSED,
      ]),
    ).toEqual([AudioQuality.COMPRESSED, AudioQuality.LOSSLESS]);
  });
});

describe('defaultAudioQualityFor — 고른 적 없는 사용자의 기본 음질(player.md 4.9, 2026-10-06)', () => {
  it('티어가 허용하는 가장 높은 선택지다 — aac 는 선택지가 아니라 compressed 로 내려간다', () => {
    expect(defaultAudioQualityFor(AudioQuality.COMPRESSED)).toBe(
      AudioQuality.COMPRESSED,
    );
    expect(defaultAudioQualityFor(AudioQuality.AAC)).toBe(
      AudioQuality.COMPRESSED,
    );
    expect(defaultAudioQualityFor(AudioQuality.LOSSLESS)).toBe(
      AudioQuality.LOSSLESS,
    );
  });

  it('선택지 목록에는 aac 가 없다 — 파일이 없는 음질을 고르게 하지 않는다', () => {
    expect(OFFERED_AUDIO_QUALITIES).toEqual([
      AudioQuality.COMPRESSED,
      AudioQuality.LOSSLESS,
    ]);
  });
});
