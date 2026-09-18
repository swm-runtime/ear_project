/**
 * 블로그 글.
 *
 * 글마다 파일을 나누지 않고 한곳에 모아 둔다. 편수가 적은 동안에는 목록·정렬·중복
 * 슬러그 검사를 한 배열 위에서 하는 편이 단순하고, 파일을 나눠야 할 만큼 늘어나면
 * 그때 `content/posts/`로 분리하면 된다.
 *
 * 내용의 근거는 `docs/prd/ear_root_prd.md`와 `docs/features/`다. 여기 적은 정책 수치가
 * 문서와 어긋나면 글이 아니라 문서가 기준이다.
 */

import type { Block } from "./prose";

export type Post = {
  /** URL에 들어가는 값. 한글 슬러그는 인코딩되어 링크가 지저분해지므로 영문만 쓴다. */
  slug: string;
  /** 글 제목. 페이지의 h1이자 `<title>`이 된다. */
  title: string;
  /** meta description 겸 목록의 요약문. */
  description: string;
  /** 발행일 (YYYY-MM-DD). 정렬·구조화 데이터·사이트맵이 함께 쓴다. */
  date: string;
  /** 수정일. 고친 적이 없으면 비워 둔다. */
  updated?: string;
  category: string;
  blocks: Block[];
};

/**
 * 지금은 글이 없다(2026-09-17 — 초안 글을 내렸다). 블로그 목록 페이지(`/blog/`)는 유지하고
 * 빈 상태를 보여준다.
 *
 * **글 상세 경로(`src/app/blog/[slug]/`)도 함께 내렸다.** `output: "export"`는 동적 경로가
 * 페이지를 하나도 만들지 않으면 빌드를 실패시킨다. 글을 다시 올릴 때는 이 배열에 넣고
 * 그 디렉터리를 되살린다: `git checkout <이 커밋의 부모> -- 'landing-page/src/app/blog/[slug]'`.
 * 목록·사이트맵·구조화 데이터·홈 미리보기는 배열만 채우면 함께 살아난다.
 */
const posts: Post[] = [];

export const allPosts: Post[] = [...posts].sort((a, b) =>
  b.date.localeCompare(a.date),
);

export function getPost(slug: string): Post | undefined {
  return allPosts.find((p) => p.slug === slug);
}

/** 글 하단의 '다음 글' 추천. 자기 자신은 빼고 최신순으로 채운다. */
export function relatedPosts(slug: string, count = 2): Post[] {
  return allPosts.filter((p) => p.slug !== slug).slice(0, count);
}

/** "2026년 8월 5일" 형태. 정적 빌드라 로케일 API에 의존하지 않고 직접 만든다. */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${y}년 ${Number(m)}월 ${Number(d)}일`;
}
