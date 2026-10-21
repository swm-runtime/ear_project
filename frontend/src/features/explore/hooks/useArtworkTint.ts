import { Image as ExpoImage } from 'expo-image';
import { useEffect, useState } from 'react';

import { logger } from '@/shared/lib/logger';
import { useActiveScheme } from '@/shared/theme';

import { tintFromBlurhash } from '../explore.artwork-tint';

/** 표지 주소별 blurhash — 한 번 뽑으면 앱이 켜져 있는 동안 다시 뽑지 않는다(두 번째부터 바로 칠해진다) */
const hashCache = new Map<string, string>();
/** 4×4 성분 — 파스텔 그림 영역이 따로 잡힐 만큼, 계산은 가볍게 */
const COMPONENTS: [number, number] = [4, 4];

/**
 * 표지와 어울리는 바탕 단색(시리즈 화면 — PM 2026-10-22 07:51). expo-image 가 기기에서 표지의 blurhash 를 만들고(이미 앱에 든 네이티브
 * 함수 — 빌드 불필요) `tintFromBlurhash` 가 색을 고른다. 못 뽑으면 null — 화면은 기본 바탕 그대로다. 모드가 바뀌면 같은 해시로 다시 계산.
 * 캐시에 있으면 렌더 중에 바로 읽는다(첫 그림부터 색) — 효과는 캐시에 없을 때 뽑기만 한다
 */
export const useArtworkTint = (uri: string | null): string | null => {
  const scheme = useActiveScheme();
  // 뽑기가 끝났다는 신호 — 값 자체는 캐시가 든다
  const [, setFetchedUri] = useState<string | null>(null);

  useEffect(() => {
    if (!uri || hashCache.has(uri)) return;
    let cancelled = false;
    ExpoImage.generateBlurhashAsync(uri, COMPONENTS)
      .then((value) => {
        if (!value) return;
        hashCache.set(uri, value);
        if (!cancelled) setFetchedUri(uri);
      })
      .catch((error: unknown) => logger.debug('[explore] artwork tint unavailable', error));
    return () => {
      cancelled = true;
    };
  }, [uri]);

  const hash = uri ? hashCache.get(uri) : undefined;
  return hash ? tintFromBlurhash(hash, scheme) : null;
};
