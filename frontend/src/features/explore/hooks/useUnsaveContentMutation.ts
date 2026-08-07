import { useMutation } from '@tanstack/react-query';

import { unsaveContent } from '../api/explore.api';

/** 담기 해제(explore-api.md 4.4) — 낙관 반영·순서 판정(client_seq)은 useExploreScreen이 담당한다 */
export const useUnsaveContentMutation = () => useMutation({ mutationFn: unsaveContent });
