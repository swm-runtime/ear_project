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
        title="만들면서 정리한 기준들"
        lede="왜 오디오여야 하는지, AI가 만든 콘텐츠를 어디까지 믿을 수 있는지, 요금제를 왜 그렇게 잘랐는지. 제품을 만들며 답해야 했던 질문들을 남깁니다."
        meta={`글 ${allPosts.length}편`}
      />

      <div className="section">
        <div className="container">
          <PostList posts={allPosts} />
        </div>
      </div>

      <NextLinks items={[routes.features, routes.pricing, routes.faq]} />
      <FinalCta />
    </>
  );
}
