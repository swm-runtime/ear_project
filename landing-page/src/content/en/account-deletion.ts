import type { Block } from "../prose";
import { enSite } from "./site";

/**
 * 계정 삭제 안내의 **영어 번역본**(2026-10-15 — KAN-199). 원본은 `../account-deletion.ts`다.
 *
 * Google Play가 요구하는 "계정 삭제 요청 URL"의 영어판이다 — 글로벌 리스팅에 이 주소(`/en/account-deletion/`)를 건다.
 * 원본을 고치면 같은 PR에서 이 파일도 고친다. 앱 안 경로의 메뉴 이름은 앱의 영어 문구(`frontend`의
 * `settings.copy.ts`·`auth.copy.ts` en — Settings · Account · Delete account)와 맞췄다.
 * 화면에 나가는 값이므로 **한국어 글자를 넣지 않는다**.
 */
/** 번역본이라는 사실과 우선 판본. 한국어 원문 링크와 함께 문서 머리에 붙는다(`app/en/LegalPage.tsx`). */
export const enTranslationNotice =
  "This English version is provided for convenience. In case of any conflict or inconsistency, the Korean version prevails.";

export const enAccountDeletionBlocks: Block[] = [
  {
    type: "p",
    text: `You can delete your ${enSite.name} account directly in the app. When you delete it, your account and usage history are removed, and your previous history is not restored even if you sign up again with the same social account.`,
  },

  { type: "h2", text: "Delete your account in the app" },
  {
    type: "ol",
    items: [
      `Open the ${enSite.name} app and tap the **Profile** tab at the bottom.`,
      "Tap the **Settings** (gear) icon at the top right.",
      "Under **Account**, tap **Delete account**.",
      "Review what will be deleted on the confirmation screen, then tap **Delete account**.",
    ],
  },
  {
    type: "note",
    title: "Account deletion cannot be undone",
    text: "Your account is deleted the moment you confirm. Saved content, listening history and topic settings cannot be recovered.",
  },

  { type: "h2", text: "Request deletion without the app" },
  {
    type: "p",
    text: `If you cannot install the app or cannot log in, you can request deletion by email at **${enSite.contactEmail}**. Please tell us which social login provider you used to sign up (Kakao, Naver, Google or Apple) and the email address you used at sign-up; we will process the request after verifying your identity. We process requests within 10 business days of receipt and reply with the result.`,
  },

  { type: "h2", text: "Information that is deleted" },
  {
    type: "ul",
    items: [
      "The member identifier issued by your social login provider, and which provider it is",
      "Your email address and its verification status",
      "Nickname",
      "Topics of interest and career information (job group, job function, years of experience)",
      "The list of content saved to your library, listening history and playback positions",
      "Device registration information and notification settings",
      "History of consent to the terms and to marketing communications",
    ],
  },
  {
    type: "p",
    text: "**For accounts with no payment history, all of the above is deleted immediately.** Nothing is kept.",
  },

  { type: "h2", text: "Information kept as required by law" },
  {
    type: "p",
    text: "For accounts with a payment history, because of the retention obligations under the Act on the Consumer Protection in Electronic Commerce, Etc. of the Republic of Korea, only the items below are stored separately and then deleted when the period ends. This information is not used for any purpose other than retention.",
  },
  {
    type: "dl",
    items: [
      { term: "Records of payments and supply of goods", desc: "5 years" },
      { term: "Records of contracts or withdrawal of subscriptions", desc: "5 years" },
      { term: "Records of consumer complaints or dispute handling", desc: "3 years" },
    ],
  },
  {
    type: "p",
    text: "Statistics used to improve the Service remain only as **values processed so that no individual can be identified**. Reasons for deleting an account are stored in an irreversible form and cannot be linked back to a particular user.",
  },

  { type: "h2", text: "See also" },
  {
    type: "p",
    text: "The full details of the items we collect, the purposes of use and the retention periods are in our Privacy Policy.",
  },
];
