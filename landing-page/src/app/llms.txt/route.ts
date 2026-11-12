import { enSite } from "@/content/en/site";
import { enRoutes } from "@/content/en/routes";
import { getTopicGroups } from "@/content/public-topics";
import { routes } from "@/content/routes";
import {
  androidStoreUrl,
  faqs,
  features,
  iosStoreUrl,
  nonGoals,
  planComparison,
  plans,
  site,
  SITE_URL,
  stats,
  steps,
} from "@/content/site";

// 정적 내보내기에서 빌드 시점에 out/llms.txt 로 굽는다(robots.ts·sitemap.ts 와 같은 방식).
export const dynamic = "force-static";

/**
 * `/llms.txt` — AI 검색·답변 엔진(ChatGPT·Perplexity·Gemini 등)이 이어를 설명할 때 읽을 요약본
 * (llmstxt.org 형식: H1 이름 → 인용 요약 → 링크 묶음).
 *
 * **문장을 여기에 새로 쓰지 않는다.** 전부 `site.ts`·`routes.ts`에서 가져온다 — 화면과 다른 말을
 * 하면 AI 답변이 화면에 없는 정책을 사실처럼 옮긴다. 요금·편수가 바뀌면 `site.ts`만 고치면 된다.
 * 주제 목록은 홈과 같은 빌드 시점 fetch(`GET /public/topics`)를 쓰고, 실패하면 내장 목록이다.
 */
export async function GET(): Promise<Response> {
  const topicGroups = await getTopicGroups();
  const url = (path: string) => `${SITE_URL}${path}`;
  const faqQ = (q: string) => faqs.find((f) => f.q === q)?.a;

  const lines: string[] = [
    `# ${site.name} (${enSite.name})`,
    "",
    `> ${routes.home.description}`,
    "",
    faqQ("이어는 어떤 서비스인가요?") ?? site.shortDescription,
    "",
    `English: ${enSite.shortDescription} (${url(enRoutes.home.path)})`,
    "",
    "## 핵심 사실",
    "",
    ...stats.map((s) => `- ${s.label}: ${s.value} (${s.note})`),
    // 편수는 stats 와 겹치므로 뺀다
    ...planComparison.same
      .filter((s) => !s.label.includes("편수"))
      .map((s) => `- ${s.label}: ${s.value}`),
    "",
    "## 이용 방법",
    "",
    ...steps.map((s) => `${Number(s.n)}. ${s.title} — ${s.body}`),
    "",
    "## 기능",
    "",
    ...features.map((f) => `- ${f.title}: ${f.detail}`),
    "",
    "## 하지 않는 것",
    "",
    ...nonGoals.map((n) => `- ${n.title}: ${n.body}`),
    "",
    "## 요금제",
    "",
    ...plans.map(
      (p) =>
        `- ${p.name}: ${p.price} — ${p.items.map((i) => i.text).join(" · ")}`,
    ),
    // 가격은 바로 위 요금제 줄과 겹치므로 뺀다
    ...planComparison.different
      .filter((d) => d.label !== "가격")
      .map((d) => `- ${d.label}: ${d.value}`),
    "",
    "## 고를 수 있는 주제",
    "",
    ...topicGroups.map((g) => `- ${g.name}: ${g.topics.join(", ")}`),
    "",
    "## 자주 묻는 질문",
    "",
    ...faqs.flatMap((f) => [`### ${f.q}`, "", f.a, ""]),
    "## 페이지",
    "",
    `- [${routes.features.label}](${url(routes.features.path)}): ${routes.features.description}`,
    `- [${routes.pricing.label}](${url(routes.pricing.path)}): ${routes.pricing.description}`,
    `- [${routes.faq.label}](${url(routes.faq.path)}): ${routes.faq.description}`,
    "",
    "## 앱 받기",
    "",
    `- [App Store](${iosStoreUrl})`,
    `- [Google Play](${androidStoreUrl})`,
    "",
    "## Optional",
    "",
    `- [${routes.privacy.label}](${url(routes.privacy.path)})`,
    `- [${routes.terms.label}](${url(routes.terms.path)})`,
    `- [${routes.accountDeletion.label}](${url(routes.accountDeletion.path)})`,
    `- 문의: ${site.contactEmail}`,
    "",
  ];

  return new Response(lines.join("\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
