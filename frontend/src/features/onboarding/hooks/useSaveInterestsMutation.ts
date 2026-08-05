import { useMutation } from '@tanstack/react-query';

import { saveInterests } from '../api/onboarding.api';

export const useSaveInterestsMutation = () =>
  useMutation({
    mutationFn: saveInterests,
  });
