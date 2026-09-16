import { useQuery } from '@tanstack/react-query';

import { getMockScript } from '../api/player.mock';
import { IS_PLAYER_API_MOCKED } from '../player.constants';
import type { ScriptSegment } from '../player.types';

/**
 * 스크립트 조회(PL6 — FR-25 P1). **실서버 계약이 아직 없다**(player-api.md "P1 추가분") —
 * mock이 아닐 때는 항상 null을 돌려주고, 화면은 null이면 손잡이를 그리지 않는다(uiux 4.6).
 * P1에서 엔드포인트가 확정되면 queryFn만 실제 호출로 바꾼다.
 */
export const useScriptQuery = (contentId: string | null, durationSec: number) =>
  useQuery({
    queryKey: ['player', 'script', contentId, durationSec] as const,
    queryFn: (): Promise<ScriptSegment[] | null> =>
      IS_PLAYER_API_MOCKED && contentId
        ? getMockScript(contentId, durationSec)
        : Promise.resolve(null),
    enabled: contentId !== null,
    staleTime: Infinity,
  });
