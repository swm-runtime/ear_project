import type { Metadata } from "next";
import { AppleLogo } from "@/components/AppleLogo";
import { EnFooter } from "@/components/EnFooter";
import { Features } from "@/components/Features";
import { FinalCta } from "@/components/FinalCta";
import { GooglePlayLogo } from "@/components/GooglePlayLogo";
import { NextLinks } from "@/components/NextLinks";
import { Sentences } from "@/components/Sentences";
import { enRoutes } from "@/content/en/routes";
import { enHome } from "@/content/en/site";
import { routes } from "@/content/routes";
import { androidStoreUrl, iosStoreUrl } from "@/content/site";
import { enRouteMetadata } from "@/lib/seo";
import ph from "@/components/PageHeader.module.css";
import prose from "@/components/Prose.module.css";
import s from "./page.module.css";

export const metadata: Metadata = enRouteMetadata("home");

/**
 * 영어 소개(`/en/`, 2026-10-15 — KAN-199).
 *
 * 글로벌 스토어 리스팅의 지원 URL이 가리키는 페이지다. 한국어 홈의 번역이 아니라 두 시장에 공통으로 참인 것만
 * 짧게 적었다(`content/en/site.ts` 주석). 한국어 홈의 히어로·샘플 플레이어·주제 섹션은 한국어 콘텐츠·한국어 API
 * 응답을 그리므로 가져오지 않는다.
 */
export default function EnHomePage() {
  const { hero, features, aiNote, cta, nextTitle } = enHome;

  return (
    <>
      <main id="main">
        <section id="top" className={ph.wrap}>
          <div className={ph.glow} aria-hidden="true" />
          <div className={`container ${ph.inner}`}>
            <p className="eyebrow">{hero.eyebrow}</p>
            <h1 className={ph.title}>{hero.title}</h1>
            <p className={ph.lede}>
              <Sentences text={hero.lede} />
            </p>
            <div className={s.actions}>
              <a
                href={iosStoreUrl}
                className={`btn btnPrimary ${s.store}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <AppleLogo />
                App Store
              </a>
              <a
                href={androidStoreUrl}
                className={`btn btnPrimary ${s.store}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <GooglePlayLogo />
                Google Play
              </a>
            </div>
          </div>
        </section>

        <Features
          id="features"
          eyebrow={features.eyebrow}
          title={features.title}
          lede={features.lede}
          items={features.items}
        />

        <section className="section">
          <div className="container">
            <p className="eyebrow">{aiNote.eyebrow}</p>
            <h2 className="sectionTitle">{aiNote.title}</h2>
            <div className={`${prose.prose} ${s.note}`}>
              {aiNote.paragraphs.map((text) => (
                <p key={text}>{text}</p>
              ))}
            </div>
          </div>
        </section>

        <FinalCta title={cta.title} lede={cta.lede} />

        <NextLinks
          title={nextTitle}
          items={[enRoutes.terms, enRoutes.privacy, enRoutes.accountDeletion]}
        />
      </main>
      <EnFooter koPath={routes.home.path} />
    </>
  );
}
