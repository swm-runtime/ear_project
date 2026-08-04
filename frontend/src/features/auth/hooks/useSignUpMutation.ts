import { useMutation } from '@tanstack/react-query';

import { signUp } from '../api/auth.api';

export const useSignUpMutation = () =>
  useMutation({
    mutationFn: signUp,
  });
