import { useQuery } from '@tanstack/react-query';

import { fetchScript } from '../api/player.api';
import type { ScriptSegment } from '../player.types';

/**
 * 대본 조회(PL6 — FR-25, player-api.md 4.7).
 *
 * **패널을 처음 열 때만 받는다**(`enabled`) — 버튼을 그릴지는 발급 응답의 `has_script`가 이미 정했으므로
 * 플레이어에 들어올 때마다 미리 받을 이유가 없다(재생 목록 패널과 같은 방식). 한 번 받은 대본은 세션 동안
 * 다시 받지 않는다(`staleTime: Infinity`) — 대본은 재생 중에 바뀌지 않는다. 재발행으로 길이가 바뀌면
 * 키(`durationSec`)가 달라져 새로 받는다.
 *
 * 빈 배열은 "대본 없음"이다 — 화면이 버튼을 숨긴다(`has_script`와 어긋난 경우의 방어, 4.7).
 */
export const useScriptQuery = (contentId: string | null, durationSec: number, enabled: boolean) =>
  useQuery<ScriptSegment[]>({
    queryKey: ['player', 'script', contentId, durationSec] as const,
    queryFn: () => fetchScript({ contentId: contentId ?? '', durationSec }),
    enabled: enabled && contentId !== null,
    staleTime: Infinity,
  });
