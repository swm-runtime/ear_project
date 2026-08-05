import { useMutation } from '@tanstack/react-query';

import { savePicks } from '../api/onboarding.api';

export const useSavePicksMutation = () =>
  useMutation({
    mutationFn: savePicks,
  });
