import type { AudioQualityOption } from './settings.types';

/**
 * 설정 "음질" 섹션에 그릴 선택지(settings.md 4.6). 서버가 준 목록 그대로 두되, 구독 UI 가 꺼진 바이너리면
 * 잠긴 선택지를 뺀다(App Store 2.1(b)). 남는 게 하나 이하면 고를 것이 없으니 null — 섹션을 그리지 않는다.
 * 옛 서버(목록 없음)도 null
 */
export const visibleAudioQualityOptions = (
  options: readonly AudioQualityOption[] | null,
  isSubscriptionUiEnabled: boolean,
): AudioQualityOption[] | null => {
  if (options === null) return null;
  const visible = options.filter((option) => option.allowed || isSubscriptionUiEnabled);
  return visible.length >= 2 ? visible : null;
};
