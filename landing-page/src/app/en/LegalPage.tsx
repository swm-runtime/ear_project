import { EnFooter } from "@/components/EnFooter";
import { JsonLd } from "@/components/JsonLd";
import { LegalDocument } from "@/components/LegalDocument";
import { NextLinks } from "@/components/NextLinks";
import { PageHeader } from "@/components/PageHeader";
import { enRoutes, type EnRouteKey } from "@/content/en/routes";
import { enChrome } from "@/content/en/site";
import { legalLabelsEn, legalMetaEn, legalNoticeEn } from "@/content/legal-en";
import type { Block } from "@/content/prose";
import { routes } from "@/content/routes";
import { breadcrumb, graph } from "@/lib/schema";
import legal from "@/components/LegalDocument.module.css";
import s from "./LegalPage.module.css";

/**
 * 영어 정책 페이지 셋(약관·개인정보·계정 삭제)의 공통 틀(2026-10-15 — KAN-199).
 *
 * 세 페이지가 머리(빵부스러기·제목)·본문·바닥글까지 모양이 같아 한 곳에 모았다. 페이지 파일은 어느 라우트인지와
 * 본문만 넘긴다. 약관·처리방침 본문은 글로벌 시장용으로 따로 쓴 `content/legal-en.ts`(PR #1584)이고, 시행일·버전·
 * 상단 안내·고정 문구도 그 파일의 것을 쓴다 — 세 문서가 같은 판으로 읽히게 한다.
 *
 * `translationNotice`는 **한국어 원문을 옮긴 문서**(계정 삭제)에만 준다. 한국어 원문 링크를 함께 붙인다 —
 * "충돌 시 한국어판 우선"이라고 적었으면 그 한국어판으로 바로 갈 수 있어야 한다.
 */
export function EnLegalPage({
  routeKey,
  lede,
  blocks,
  next,
  translationNotice,
}: {
  routeKey: Exclude<EnRouteKey, "home">;
  lede: string;
  blocks: Block[];
  next: Exclude<EnRouteKey, "home">[];
  translationNotice?: string;
}) {
  const r = enRoutes[routeKey];
  const home = { name: enRoutes.home.label, path: enRoutes.home.path };
  const koPath = routes[r.koKey].path;

  return (
    <>
      <main id="main">
        <JsonLd data={graph([breadcrumb([{ name: r.label, path: r.path }], home)])} />

        <PageHeader
          homeLabel={home.name}
          homePath={home.path}
          crumbsAria={enChrome.crumbsAria}
          crumbs={[{ name: r.label }]}
          title={r.title}
          lede={lede}
        />

        {translationNotice ? (
          <aside className={`container ${s.translation}`}>
            <p className={legal.notice}>
              {translationNotice}{" "}
              <a href={koPath} hrefLang="ko">
                <u>Read the Korean version</u>
              </a>
            </p>
          </aside>
        ) : null}

        <LegalDocument
          blocks={blocks}
          meta={legalMetaEn}
          notice={legalNoticeEn}
          labels={legalLabelsEn}
        />

        <NextLinks title="See also" items={next.map((k) => enRoutes[k])} />
      </main>
      <EnFooter koPath={koPath} />
    </>
  );
}
