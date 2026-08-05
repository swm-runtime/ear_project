import { useMutation } from '@tanstack/react-query';

import { syncDevicePermission } from '../api/onboarding.api';

export const useSyncDevicePermissionMutation = () =>
  useMutation({
    mutationFn: syncDevicePermission,
  });
