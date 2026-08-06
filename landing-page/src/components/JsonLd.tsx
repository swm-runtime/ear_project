import { faqs, site, SITE_URL } from "@/content/site";

/**
 * 구조화 데이터(JSON-LD).
 *
 * 검색 결과의 리치 스니펫과 지식 패널이 읽는 값이다. 화면에 보이지 않는 내용을
 * 여기에 적으면 구글 구조화 데이터 정책 위반이므로, FAQ는 화면과 같은 원본
 * (`content/site.ts`)에서 가져온다.
 */
export function JsonLd() {
  const organization = {
    "@type": "Organization",
    "@id": `${SITE_URL}/#organization`,
    name: site.name,
    alternateName: site.nameEn,
    url: `${SITE_URL}/`,
    logo: `${SITE_URL}/icon.svg`,
    description: site.shortDescription,
    email: site.contactEmail,
  };

  const website = {
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    url: `${SITE_URL}/`,
    name: site.title,
    description: site.description,
    inLanguage: "ko-KR",
    publisher: { "@id": `${SITE_URL}/#organization` },
  };

  const application = {
    "@type": "MobileApplication",
    "@id": `${SITE_URL}/#app`,
    name: site.name,
    applicationCategory: "EducationApplication",
    applicationSubCategory: "팟캐스트",
    operatingSystem: "iOS, Android",
    description: site.description,
    inLanguage: "ko-KR",
    publisher: { "@id": `${SITE_URL}/#organization` },
    // 무료 요금제(라이트)만 확정값이다. 유료 요금제 가격은 정해지지 않았으므로 적지 않는다.
    offers: {
      "@type": "Offer",
      name: "라이트",
      price: "0",
      priceCurrency: "KRW",
      category: "free",
    },
  };

  const faqPage = {
    "@type": "FAQPage",
    "@id": `${SITE_URL}/#faq`,
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  const graph = {
    "@context": "https://schema.org",
    "@graph": [organization, website, application, faqPage],
  };

  return (
    <script
      type="application/ld+json"
      // JSON.stringify 결과에는 </script>를 만들 수 있는 문자가 없지만,
      // 카피에 꺾쇠가 들어올 가능성에 대비해 한 번 막아 둔다.
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(graph).replace(/</g, "\\u003c"),
      }}
    />
  );
}
