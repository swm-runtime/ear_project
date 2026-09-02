import type { Metadata } from "next";
import Link from "next/link";
import { Faq } from "@/components/Faq";
import { Features } from "@/components/Features";
import { FinalCta } from "@/components/FinalCta";
import { Hero } from "@/components/Hero";
import { HowItWorks } from "@/components/HowItWorks";
import { PostList } from "@/components/PostList";
import { PricingTeaser } from "@/components/PricingTeaser";
import { Problem } from "@/components/Problem";
import { Topics } from "@/components/Topics";
import { allPosts } from "@/content/blog";
import { routes } from "@/content/routes";
import { features, homeFaqs } from "@/content/site";
import { routeMetadata } from "@/lib/seo";
import s from "./home.module.css";

export const metadata: Metadata = routeMetadata("home");

/**
 * 홈.
 *
 * 각 주제를 **요약만** 싣고 판단에 필요한 것은 전용 페이지로 넘긴다. 예전처럼 한 장에
 * 전부 담으면 기능·요금제·FAQ가 각각 검색될 기회를 잃고, 페이지를 나눈 뒤에도 같은
 * 문장을 그대로 두면 이번에는 중복 콘텐츠가 된다. 그래서 홈의 카피는 짧은 판본이다.
 */
export default function Page() {
  return (
    <>
      <Hero />
      <Problem />
      <HowItWorks />

      <Features
        id="features"
        title="듣는 데 걸리는 마찰을 없앴습니다"
        lede="고르는 수고, 기다리는 시간, 다시 찾는 번거로움. 오디오로 콘텐츠를 듣게 만드는 데 실제로 방해가 되는 것들을 하나씩 걷어냈습니다."
        items={features.slice(0, 3).map((f) => ({
          icon: f.icon,
          title: f.title,
          text: f.body,
        }))}
        footer={
          <Link href={routes.features.path} className="btn btnGhost">
            기능 여섯 가지 전부 보기
          </Link>
        }
      />

      <Topics />
      <PricingTeaser />

      <section className={`section ${s.blog}`}>
        <div className="container">
          <div className={s.blogHead}>
            <div>
              <p className="eyebrow">Blog</p>
              <h2 className="sectionTitle">만들면서 정리한 기준들</h2>
            </div>
            <Link href={routes.blog.path} className="btn btnGhost">
              글 전체 보기
            </Link>
          </div>
          <PostList posts={allPosts.slice(0, 2)} headingLevel="h3" />
        </div>
      </section>

      <Faq
        id="faq"
        title="자주 묻는 질문"
        lede="여기서 답을 찾지 못하셨다면 편하게 물어봐 주세요."
        items={homeFaqs.slice(0, 4)}
        footer={
          <Link href={routes.faq.path} className="btn btnGhost">
            질문 전체 보기
          </Link>
        }
      />

      <FinalCta />
    </>
  );
}
