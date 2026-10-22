import { useMutation } from '@tanstack/react-query';

import {
  restoreSeriesToLibrary,
  saveSeriesToLibrary,
  unsaveSeriesFromLibrary,
} from '../api/explore.api';

/**
 * 시리즈째 담기·빼기·실행 취소(explore-api.md 4.8~4.10 — KAN-246). 낙관 반영·순서 판정(client_seq)은 useSeriesScreen 이 맡는다
 */
export const useSaveSeriesMutation = () => useMutation({ mutationFn: saveSeriesToLibrary });
export const useUnsaveSeriesMutation = () => useMutation({ mutationFn: unsaveSeriesFromLibrary });
export const useRestoreSeriesMutation = () => useMutation({ mutationFn: restoreSeriesToLibrary });
