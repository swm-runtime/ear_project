import { useMutation } from '@tanstack/react-query';

import { syncDevicePermission } from '../api/notification.api';

export const useSyncDevicePermissionMutation = () =>
  useMutation({
    mutationFn: syncDevicePermission,
  });
