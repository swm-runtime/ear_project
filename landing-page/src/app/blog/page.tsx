import type { Metadata } from "next";
import { FinalCta } from "@/components/FinalCta";
import { JsonLd } from "@/components/JsonLd";
import { NextLinks } from "@/components/NextLinks";
import { PageHeader } from "@/components/PageHeader";
import { PostList } from "@/components/PostList";
import { allPosts } from "@/content/blog";
import { routes } from "@/content/routes";
import { blogIndex, breadcrumb, graph } from "@/lib/schema";
import { routeMetadata } from "@/lib/seo";

export const metadata: Metadata = routeMetadata("blog");

export default function BlogPage() {
  return (
    <>
      <JsonLd
        data={graph([
          blogIndex(),
          breadcrumb([{ name: routes.blog.label, path: routes.blog.path }]),
        ])}
      />

      <PageHeader
        crumbs={[{ name: routes.blog.label }]}
        title="이어 블로그"
        lede="이어를 만드는 팀의 이야기와 서비스 소식을 전해요."
        meta={allPosts.length > 0 ? `글 ${allPosts.length}편` : undefined}
      />

      <div className="section">
        <div className="container">
          {allPosts.length > 0 ? (
            <PostList posts={allPosts} />
          ) : (
            <p className="sectionLede">아직 올라온 글이 없어요. 곧 찾아올게요.</p>
          )}
        </div>
      </div>

      <NextLinks items={[routes.features, routes.pricing, routes.faq]} />
      <FinalCta />
    </>
  );
}
