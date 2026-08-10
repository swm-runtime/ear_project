import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FinalCta } from "@/components/FinalCta";
import { JsonLd } from "@/components/JsonLd";
import { PageHeader } from "@/components/PageHeader";
import { PostList } from "@/components/PostList";
import { Prose, tableOfContents } from "@/components/Prose";
import { allPosts, formatDate, getPost, relatedPosts } from "@/content/blog";
import { readingMinutes } from "@/content/prose";
import { postPath, routes } from "@/content/routes";
import { blogPosting, breadcrumb, graph } from "@/lib/schema";
import { buildMetadata } from "@/lib/seo";
import s from "./page.module.css";

type Props = { params: Promise<{ slug: string }> };

/** 정적 내보내기라 빌드 시점에 모든 글의 HTML을 만들어 둔다. */
export function generateStaticParams() {
  return allPosts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return {};

  return buildMetadata({
    path: postPath(post.slug),
    title: post.title,
    description: post.description,
    // 글마다 이미지를 굽지 않고 블로그 공용 이미지를 쓴다. 페이지별 OG는 정적 파일로
    // 미리 구워야 하는데(scripts/og-image.mjs), 글이 늘 때마다 이미지가 늘면
    // 저장소가 그만큼 무거워진다. 필요해지면 그때 글별 이미지로 바꾼다.
    image: { url: routes.blog.ogImage, alt: `${post.title} — 이어 블로그` },
    ogType: "article",
    publishedTime: post.date,
    modifiedTime: post.updated,
  });
}

export default async function PostPage({ params }: Props) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();

  const toc = tableOfContents(post.blocks);
  const related = relatedPosts(post.slug);

  return (
    <>
      <JsonLd
        data={graph([
          blogPosting(post),
          breadcrumb([
            { name: routes.blog.label, path: routes.blog.path },
            { name: post.title, path: postPath(post.slug) },
          ]),
        ])}
      />

      <PageHeader
        crumbs={[
          { name: routes.blog.label, path: routes.blog.path },
          { name: post.category },
        ]}
        title={post.title}
        lede={post.description}
        meta={
          <>
            <time dateTime={post.date}>{formatDate(post.date)}</time>
            {post.updated && <> · {formatDate(post.updated)} 수정</>} ·{" "}
            {readingMinutes(post.blocks)}분 분량
          </>
        }
      />

      <div className="section">
        <div className="container">
          <div className={s.layout}>
            {toc.length > 2 && (
              <nav className={s.toc} aria-label="글 목차">
                <p className={s.tocTitle}>목차</p>
                <ol>
                  {toc.map((item) => (
                    <li key={item.id}>
                      <a href={`#${item.id}`}>{item.text}</a>
                    </li>
                  ))}
                </ol>
              </nav>
            )}

            <article className={s.article}>
              <Prose blocks={post.blocks} />

              <footer className={s.foot}>
                <Link href={routes.blog.path} className="btn btnGhost">
                  글 목록으로
                </Link>
              </footer>
            </article>
          </div>
        </div>
      </div>

      {related.length > 0 && (
        <section className={`section ${s.related}`}>
          <div className="container">
            <h2 className={s.relatedTitle}>다음 글</h2>
            <PostList posts={related} />
          </div>
        </section>
      )}

      <FinalCta />
    </>
  );
}
