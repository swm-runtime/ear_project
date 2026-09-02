import { useMutation } from '@tanstack/react-query';

import { saveCareer } from '../api/onboarding.api';

export const useSaveCareerMutation = () =>
  useMutation({
    mutationFn: saveCareer,
  });
