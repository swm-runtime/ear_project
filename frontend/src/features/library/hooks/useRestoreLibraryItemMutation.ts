import { useMutation } from '@tanstack/react-query';

import { restoreLibraryItem } from '../api/library.api';

/** 삭제 실행 취소(library-api.md 4.7) — 서버 삭제가 이미 반영된 경우에만 호출된다 */
export const useRestoreLibraryItemMutation = () => useMutation({ mutationFn: restoreLibraryItem });
