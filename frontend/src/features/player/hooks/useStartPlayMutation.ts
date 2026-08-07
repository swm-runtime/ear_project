import { useMutation } from '@tanstack/react-query';

import { startPlay } from '../api/player.api';

/** 재생 시작(library-api.md 4.4) — 판정·에러 분기는 usePlayGate가 담당한다 */
export const useStartPlayMutation = () => useMutation({ mutationFn: startPlay });
