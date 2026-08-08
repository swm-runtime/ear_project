import { useMutation } from '@tanstack/react-query';

import { saveContent } from '../api/explore.api';

/** 담기(explore-api.md 4.3) — 낙관 반영·순서 판정(client_seq)은 useExploreScreen이 담당한다 */
export const useSaveContentMutation = () => useMutation({ mutationFn: saveContent });
