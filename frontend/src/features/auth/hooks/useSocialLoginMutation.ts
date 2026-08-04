import { useMutation } from '@tanstack/react-query';

import { socialLogin } from '../api/auth.api';

export const useSocialLoginMutation = () =>
  useMutation({
    mutationFn: socialLogin,
  });
