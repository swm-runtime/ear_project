import { useMutation } from '@tanstack/react-query';

import { deleteLibraryItem } from '../api/library.api';

/** 소프트 삭제(library-api.md 4.6) — 호출 시점 제어(스낵바 소멸 후)는 화면 훅이 담당한다 */
export const useDeleteLibraryItemMutation = () => useMutation({ mutationFn: deleteLibraryItem });
