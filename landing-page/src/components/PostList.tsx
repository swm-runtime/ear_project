import Link from "next/link";
import { formatDate, type Post } from "@/content/blog";
import { readingMinutes } from "@/content/prose";
import { postPath } from "@/content/routes";
import s from "./PostList.module.css";

/**
 * 블로그 글 목록. 목록 페이지와 홈의 최신 글 미리보기가 같이 쓴다.
 *
 * 카드 전체가 아니라 제목만 링크로 감싼다. 카드를 통째로 <a>로 만들면 링크 텍스트가
 * 요약문까지 포함해 버려서, 스크린리더가 링크 하나를 읽는 데 문단 전체를 읽게 된다.
 */
export function PostList({
  posts,
  headingLevel = "h2",
}: {
  posts: Post[];
  /** 목록이 페이지의 주 콘텐츠면 h2, 홈처럼 섹션 안에 들어가면 h3. */
  headingLevel?: "h2" | "h3";
}) {
  const Heading = headingLevel;

  return (
    <ul className={s.list}>
      {posts.map((post) => (
        <li key={post.slug} className={s.card}>
          <div className={s.meta}>
            <span className={s.category}>{post.category}</span>
            <time dateTime={post.date}>{formatDate(post.date)}</time>
            <span className={s.dot} aria-hidden="true">
              ·
            </span>
            <span>{readingMinutes(post.blocks)}분 분량</span>
          </div>

          <Heading className={s.title}>
            <Link href={postPath(post.slug)}>{post.title}</Link>
          </Heading>

          <p className={s.desc}>{post.description}</p>

          <span className={s.more} aria-hidden="true">
            읽어보기
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none">
              <path
                d="M5 12h13m0 0-5.5-5.5M18 12l-5.5 5.5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </li>
      ))}
    </ul>
  );
}
