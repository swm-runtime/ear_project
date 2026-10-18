/**
 * English Terms of Use and Privacy Policy for the GLOBAL market (KAN-199 · `docs/spec/api/global-api.md`).
 *
 * Built from the Korean documents (`legal.ts`, `privacy-2026-11-01.ts`) plus the items foreign law requires:
 * - Privacy: the common items of Southeast Asian data protection laws (Singapore · Thailand · Malaysia ·
 *   Philippines · Indonesia · Vietnam — purposes, legal basis, recipients, cross-border transfer, retention,
 *   rights, complaint to an authority) and California CCPA/CPRA (sale/sharing disclosure, Meta ad measurement
 *   kept with an opt-out — 2026-10-15 decision A). EU-specific GDPR items were removed on 2026-10-15
 *   because the EU is not a launch market.
 * - Terms: Apple App Review Guideline 3.1.2 (auto-renewing subscription disclosures) and the standard
 *   clauses Apple requires when an app uses its own EULA instead of Apple's standard EULA.
 *
 * ⚠️ DRAFT FOR LEGAL REVIEW. Not reviewed by counsel. Values that are not decided yet are kept as visible
 * placeholders (TBD) for the same reason as the Korean documents: a published policy with invented
 * company details is a false notice.
 */

import type { Block } from "./prose";
import { site, SITE_URL } from "./site";

const TBD = {
  company: "Runtime (sole proprietorship, owner: Suheon Park)",
  address: "1804, Bldg. 102, 111 Munjang-ro, Gumi-si, Gyeongsangbuk-do, Republic of Korea",
  registration: "346-16-02865",
  officer: "Suheon Park (psuheon818@gmail.com)",
  effectiveDate: "To be announced with the global launch",
} as const;

export const legalNoticeEn =
  "Earcast is preparing its global launch. This document describes the rules that will apply at launch. The effective date and confirmed company details will be announced with the launch.";

export const legalMetaEn = {
  effectiveDate: TBD.effectiveDate,
  version: "0.1 (draft for legal review — global market)",
} as const;

export const legalLabelsEn = {
  effectiveDate: "Effective date",
  version: "Version",
  toc: "Contents",
  tocAria: "Table of contents",
} as const;

/* ============================================================
   Privacy Policy
   ============================================================ */

export const privacyBlocksEn: Block[] = [
  {
    type: "p",
    text: `This Privacy Policy explains how ${TBD.company} ("**we**", "**us**") handles personal information when you use the audio service "${site.name}" ("**Earcast**" or the "**Service**") in the global (English) market — what we collect, why, who receives it, how long we keep it, and the rights you have. It applies to users who chose English as their content language when they signed up.`,
  },

  { type: "h2", text: "1. Who we are" },
  {
    type: "dl",
    items: [
      { term: "Business operator", desc: `${TBD.company}, ${TBD.address}` },
      { term: "Privacy officer", desc: TBD.officer },
      { term: "General inquiries", desc: site.privacyEmail },
    ],
  },

  { type: "h2", text: "2. Information we collect" },
  {
    type: "p",
    text: "We collect **only what we need to run the Service**. You sign in with Google or Apple, so we never ask for a password.",
  },
  {
    type: "dl",
    items: [
      {
        term: "Account (required)",
        desc: "The account identifier issued by your sign-in provider (Google or Apple) and which provider it is. We do not collect your name or phone number.",
      },
      {
        term: "Account (only if your provider shares it)",
        desc: "Your email address and whether it is verified. If you use Apple's \"Hide My Email\", we receive the relay address only. You can use the Service without an email address.",
      },
      {
        term: "Language and region settings",
        desc: "The content language you choose at sign-up, your device language, region and time zone. We use them to show content in your language and to deliver daily episodes at a sensible local time.",
      },
      {
        term: "Your choices in the app",
        desc: "Topics you follow and notification settings.",
      },
      {
        term: "Usage (generated automatically)",
        desc: "What you play and where you stopped, completions and other listening signals, items added to your library, your device push token, access logs, device model, OS and app version, and crash reports.",
      },
      {
        term: "App analytics and ad measurement (generated automatically)",
        desc: "App opens, screen views, sign-up and onboarding completion, playback start and progress, device information, and a random identifier assigned by the analytics tools. On Android this includes the device advertising ID (AAID/GAID). On iOS we do **not** collect the advertising identifier (IDFA) and we do not ask for permission to track you. See section 9 for how to limit this.",
      },
      {
        term: "Website visits (generated automatically)",
        desc: "Pages visited, time on page, referrer, browser and OS type, approximate location and a random cookie identifier. This is not linked to your app account.",
      },
      {
        term: "Purchases",
        desc: "Your subscription plan and period, purchase and refund history, the transaction identifier issued by the store, the store country and currency. **Card details are handled by Apple or Google; we never see or store them.**",
      },
      {
        term: "Consent records",
        desc: "Whether you agreed to these documents and to marketing messages, which version, and when.",
      },
    ],
  },
  {
    type: "p",
    text: "Providing account information is necessary to create an account — without it we cannot provide the Service. Everything else marked optional can be left out without losing access.",
  },

  { type: "h2", text: "3. Why we use it and our legal basis" },
  {
    type: "p",
    text: "We use your information for the purposes below. Where the law of your country requires a legal basis, the one we rely on is shown in brackets.",
  },
  {
    type: "dl",
    items: [
      {
        term: "Providing the Service — [performance of our contract with you]",
        desc: "Creating and securing your account, choosing and delivering daily episodes based on your topics and listening, remembering where you stopped, applying your plan's daily play limit, and processing subscriptions.",
      },
      {
        term: "Keeping records the law requires — [legal obligation]",
        desc: "Keeping purchase and subscription records for the period required by law (section 5).",
      },
      {
        term: "Improving and protecting the Service — [legitimate interests]",
        desc: "Aggregated statistics on which content is played, app analytics to find where people get stuck, crash reports, fraud and abuse prevention. Our interest is a working, safe Service; you can object at any time (section 8).",
      },
      {
        term: "Notifications and marketing — [consent]",
        desc: "Push notifications (through your device permission) and optional marketing messages. You can withdraw consent at any time in Settings; withdrawal does not affect earlier processing.",
      },
      {
        term: "Ad measurement — [consent where your law requires it, otherwise legitimate interests]",
        desc: "Counting whether people who saw our app-install ads went on to install, sign up and play. We do not use it to target ads at you individually.",
      },
    ],
  },
  {
    type: "note",
    title: "Recommendations",
    text: "Earcast picks daily episodes automatically from the topics you follow and what you listen to. This is personalization of what we offer you; it does not produce legal or similarly significant effects on you, and you can change your topics at any time.",
  },

  { type: "h2", text: "4. Who receives your information" },
  {
    type: "p",
    text: "**We do not sell your personal information.** We share it only with the service providers below, who process it on our behalf under contracts that limit its use, and when the law requires us to (for example, a valid court order).",
  },
  {
    type: "dl",
    items: [
      { term: "Sign-in", desc: "Google LLC, Apple Inc." },
      { term: "In-app purchases", desc: "Apple Inc. (App Store), Google LLC (Google Play)" },
      { term: "Cloud hosting, storage and email", desc: "Amazon Web Services, Inc. — servers in the Seoul region (Republic of Korea)" },
      { term: "Push notifications", desc: "Expo (650 Industries, Inc.)" },
      { term: "Crash and error reports", desc: "Functional Software, Inc. (Sentry)" },
      { term: "App analytics", desc: "Google LLC (Firebase Analytics) — account identifiers are sent only in hashed form; never your name or email." },
      { term: "Website analytics", desc: "Google LLC (Google Analytics 4) — website only, not linked to your app account." },
      { term: "Ad measurement", desc: "Meta Platforms Ireland Limited (Meta SDK) — install, sign-up, onboarding and first-play events, device information and, on Android, the advertising ID. Never your name, email or account identifier." },
    ],
  },
  {
    type: "p",
    text: "Content partners receive **aggregated statistics only** (plays, completion rates, listening time) — nothing that identifies you. Voice synthesis and script tools used to produce episodes never receive your personal information.",
  },

  { type: "h2", text: "5. How long we keep it" },
  {
    type: "dl",
    items: [
      {
        term: "When you delete your account — no purchase history",
        desc: "Everything, including consent records, is deleted immediately.",
      },
      {
        term: "When you delete your account — with purchase history",
        desc: "Your library, topics, listening history and device tokens are deleted immediately. Purchase and subscription records, the email address linked to them and consent records are kept for **5 years** in a separate storage area, because Korean consumer-protection law (Enforcement Decree of the Act on Consumer Protection in Electronic Commerce, Art. 6) requires it, and are then deleted.",
      },
      { term: "Analytics data", desc: "Up to 14 months, after which only aggregated statistics remain." },
      { term: "Email verification records", desc: "Deleted once verification completes or expires." },
    ],
  },
  {
    type: "p",
    text: "We do not deactivate or delete accounts just because you have not used them for a while.",
  },

  { type: "h2", text: "6. International transfers" },
  {
    type: "p",
    text: "We are based in the Republic of Korea and our servers are in Seoul. If you use Earcast from another country, your information is transferred to Korea, and some providers in section 4 process it in the United States or other countries where they operate. We transfer it only to providers bound by contract to protect it to a standard comparable to the law of your country, and, where your law requires it, with your consent. You can ask us for details of these safeguards at the contact address below.",
  },

  { type: "h2", text: "7. Children" },
  {
    type: "p",
    text: "Earcast is for people **aged 18 or older**, or **16 or older** in Singapore, Hong Kong and the Republic of Korea. We ask you to confirm your age when you sign up and we do not knowingly collect information from anyone below the age that applies where they live. If we learn that we have, we delete it and close the account. If you believe a child has given us information, contact us.",
  },

  { type: "h2", text: "8. Your rights" },
  {
    type: "p",
    text: "Depending on where you live, you can ask us to:",
  },
  {
    type: "ul",
    items: [
      "**access** the personal information we hold about you and receive a copy (**portability**)",
      "**correct** inaccurate information",
      "**delete** your information",
      "**restrict** or **object to** processing based on legitimate interests",
      "**withdraw consent** at any time, without affecting earlier processing",
      "opt out of the **sale** or **sharing** of personal information and of targeted advertising (we do not sell; see section 9 on ad measurement)",
    ],
  },
  {
    type: "p",
    text: `Most of this you can do yourself in the app — change topics and email in Profile or Settings, turn notifications, marketing and ad measurement off in Settings, and delete your account in Settings › Delete account. For anything else, email ${site.privacyEmail}. We will respond within 30 days, or sooner if your local law requires and may need to verify your identity first. You may use an authorized agent; we will ask for proof that they act for you.`,
  },
  {
    type: "p",
    text: "**We will not treat you differently for exercising your rights** — no different prices, plans or quality of service.",
  },
  {
    type: "p",
    text: "You also have the right to complain to the data protection authority in your country. In Korea, you can contact the Personal Information Infringement Report Center (privacy.kisa.or.kr).",
  },

  { type: "h2", text: "9. Analytics, ad measurement and cookies" },
  {
    type: "p",
    text: "The app includes Google Firebase Analytics and the Meta SDK. Under some US state laws (including California), sending app events to an advertising platform for ad measurement may count as \"sharing\" personal information for cross-context behavioral advertising. To limit it:",
  },
  {
    type: "ul",
    items: [
      "**In the app** — turn off Settings › Privacy › Allow ad measurement. The app stops sending events (and, on Android, the advertising ID) to Meta, and it stays off when you restart the app until you turn it back on. Firebase Analytics, which we use to improve the app, is separate.",
      "**Android** — Settings › Privacy › Ads: delete or reset your advertising ID.",
      "**iOS** — we do not access the IDFA; you can also turn off Settings › Privacy & Security › Tracking › \"Allow Apps to Request to Track\".",
      `**Ask us** — email ${site.privacyEmail} with "Do Not Sell or Share" and we will stop sending your events to Meta and ask Meta to delete what it received from us.`,
      "**Delete the app** — sending stops immediately.",
    ],
  },
  {
    type: "p",
    text: `Our website (${SITE_URL}) uses Google Analytics 4 cookies to count visits. You can block or delete cookies in your browser settings or install the Google Analytics opt-out add-on (tools.google.com/dlpage/gaoptout). Blocking them does not affect the website or the Service.`,
  },

  { type: "h2", text: "10. Security" },
  {
    type: "ul",
    items: [
      "Access to personal information is limited to people who need it for their work.",
      "Data is encrypted in transit, and sensitive values such as credentials are stored encrypted or hashed.",
      "Access to systems that hold personal information is logged.",
      "Records we must keep by law are stored separately from the live database.",
    ],
  },

  { type: "h2", text: "11. Changes to this policy" },
  {
    type: "p",
    text: "We will tell you in the app at least 7 days before a change takes effect, and at least 30 days before a change that significantly affects your rights. Where the law requires, we will ask for your consent again.",
  },

  { type: "h2", text: "12. Contact" },
  {
    type: "dl",
    items: [
      { term: "Business operator", desc: TBD.company },
      { term: "Business registration no.", desc: TBD.registration },
      { term: "Address", desc: TBD.address },
      { term: "Email", desc: site.privacyEmail },
    ],
  },
];

/* ============================================================
   Terms of Use
   ============================================================ */

export const termsBlocksEn: Block[] = [
  { type: "h2", text: "1. About these Terms" },
  {
    type: "p",
    text: `These Terms of Use ("**Terms**") are an agreement between you and ${TBD.company} ("**we**", "**us**") for the AI-generated podcast service "${site.name}" ("**Earcast**" or the "**Service**"). By creating an account you agree to these Terms and acknowledge our Privacy Policy.`,
  },

  { type: "h2", text: "2. Who can use Earcast" },
  {
    type: "ol",
    items: [
      "You must be **at least 18 years old**, or **at least 16** if you live in Singapore, Hong Kong or the Republic of Korea. We ask you to confirm this at sign-up and may close accounts we learn belong to younger users.",
      "You sign in with **Google or Apple**. We do not offer a separate username and password.",
      "Your account is identified by your sign-in provider and the identifier it issues — not by email. The same email used with two providers creates two separate accounts.",
      "At sign-up you choose your content language. **It decides which catalog you see (English or Korean) and cannot be changed later.**",
      "You are responsible for your sign-in account and device. Do not let others use your account.",
    ],
  },

  { type: "h2", text: "3. What Earcast provides" },
  {
    type: "ol",
    items: [
      "Audio episodes about Korean culture — language, food, music, film and drama, beauty, history and travel — that you can play, resume and speed up.",
      "**Daily picks**: every day, episodes chosen from the topics you follow are added to your library automatically, plus one episode outside your topics to help you discover something new. If you already have several unplayed episodes, or there is nothing new to add, nothing is added that day.",
      "Search, a discovery feed, listening statistics and subscriptions.",
      "Everyone receives the same episodes; personalization only changes which episodes we offer you and when.",
      "We may change, add or remove features. We will tell you in advance about significant changes.",
    ],
  },

  { type: "h2", text: "4. AI-generated content" },
  {
    type: "ol",
    items: [
      "Episodes are **written and voiced with the help of artificial intelligence**. The voices are synthesized; they are not real people speaking, and the hosts are fictional characters.",
      "We check scripts against their sources, but AI-generated content **may contain inaccuracies or omissions**.",
      "Episodes are for general information and enjoyment. **They are not legal, medical, financial, travel-safety or other professional advice.** Check important facts — prices, opening hours, visa or travel rules — with official sources.",
      "We credit our sources and, where possible, link to them. If you find an error, tell us; we may correct or withdraw the episode.",
    ],
  },

  { type: "h2", text: "5. Plans, subscriptions and payment" },
  {
    type: "ol",
    items: [
      "Earcast has a free plan with a daily play limit and paid subscription plans with a higher or no daily limit. The plan names, prices, billing period and limits are shown on the subscription screen before you buy.",
      "**Subscriptions are purchased through the Apple App Store or Google Play** and charged to your store account. Prices are shown in your local currency by the store and may include taxes.",
      "**Subscriptions renew automatically** for the same period and price unless you cancel at least 24 hours before the end of the current period. Your account is charged for renewal within 24 hours before the period ends.",
      "**You can manage or cancel your subscription in your store account settings** (iPhone: Settings › your name › Subscriptions; Android: Google Play › Payments & subscriptions). Earcast's plan screen links there.",
      "If you cancel, you keep paid features until the end of the period you already paid for, then move to the free plan. Your library stays.",
      "Upgrades take effect immediately as handled by the store. Downgrades take effect at the next renewal.",
      "If an introductory offer or free trial is offered, its length and what happens when it ends are shown before you start it. Any unused part of a free trial is forfeited when you buy a subscription, where the store applies that rule.",
    ],
  },

  { type: "h2", text: "6. Refunds" },
  {
    type: "ol",
    items: [
      "Because payments are processed by Apple or Google, **refund requests go to the store** under its refund policy (Apple: reportaproblem.apple.com; Google Play: the order in your Google Play account). We cannot issue store refunds ourselves.",
      "When a refund is confirmed, we remove the related paid access as soon as the store notifies us.",
      "Nothing in these Terms limits any right to withdraw or obtain a refund that you have under the mandatory consumer laws of the country where you live.",
    ],
  },

  { type: "h2", text: "7. Daily play limits" },
  {
    type: "ol",
    items: [
      "Whether a play counts against your limit is **decided by our servers**; numbers shown on your device are for reference.",
      "A \"day\" for play limits starts at **5:00 AM Korea Standard Time** (UTC+9) for all users. Replaying the same episode on the same day does not count twice, and an episode that has been counted can be replayed for 15 days without counting again.",
      "The app tells you before a play counts — by showing remaining plays or asking you to confirm — unless you choose not to be asked again that day.",
      "We may change limits; changes that are worse for you will be announced in advance.",
    ],
  },

  { type: "h2", text: "8. Event and invite codes" },
  {
    type: "p",
    text: "We may give out codes that unlock a plan for a limited time. A code's plan, period and conditions are shown when you enter it. Codes have no cash value, cannot be sold or transferred, and may be withdrawn if obtained or used in breach of these Terms.",
  },

  { type: "h2", text: "9. Our content and your license" },
  {
    type: "ol",
    items: [
      "Earcast and its episodes are owned by us or our licensors.",
      "We give you a **personal, non-exclusive, non-transferable, revocable license** to stream episodes in the app for your own non-commercial use.",
      "You may not copy, record, download outside the app, redistribute, broadcast, publicly perform or create derivative works from episodes or scripts without our written permission.",
      "We may stop offering an episode at any time — for example when a license ends or a rights holder asks us to — and it will disappear from your library and search.",
    ],
  },

  { type: "h2", text: "10. What you must not do" },
  {
    type: "ul",
    items: [
      "copy, record, scrape or extract episodes, audio files or scripts",
      "get around technical protections, such as access controls on audio links",
      "use bots, crawlers or other automated means to access the Service",
      "reverse engineer, decompile or disassemble the app",
      "use someone else's account, or create multiple accounts to get around limits",
      "share one store subscription across several accounts",
      "disrupt the Service or exploit vulnerabilities",
      "use the Service commercially without our permission, or break any law",
    ],
  },
  {
    type: "p",
    text: "If you do, we may restrict or close your account, normally after telling you, or immediately where urgent action is needed.",
  },

  { type: "h2", text: "11. Deleting your account" },
  {
    type: "ol",
    items: [
      "You can delete your account at any time in Settings.",
      "**Deleting your account does not cancel a store subscription.** Cancel it in your store account first; we will remind you before you delete.",
      "What happens to your data is explained in our Privacy Policy. If you sign up again later, it is a new account and your old library and history cannot be restored, although an active store subscription can be linked again.",
      "We may suspend or terminate the Service or your account for breach of these Terms. If we shut the Service down permanently, we will tell you at least 30 days in advance.",
    ],
  },

  { type: "h2", text: "12. Disclaimers" },
  {
    type: "p",
    text: "To the extent permitted by law, the Service is provided \"**as is**\" and \"**as available**\". We do not promise that it will be uninterrupted, error-free or that episodes will be complete or accurate (see section 4). We are not responsible for outages caused by events outside our reasonable control, including failures of app stores, sign-in providers or network operators.",
  },

  { type: "h2", text: "13. Limitation of liability" },
  {
    type: "p",
    text: "To the extent permitted by law, we are not liable for indirect, incidental, special or consequential damages, or for loss of profits or data, and our total liability for any claim relating to the Service is limited to the amount you paid us in the 12 months before the claim. **Nothing in these Terms limits liability that cannot be limited by law**, including for death or personal injury caused by negligence, for fraud, or your statutory rights as a consumer.",
  },

  { type: "h2", text: "14. Apple App Store" },
  {
    type: "p",
    text: "If you downloaded Earcast from the Apple App Store:",
  },
  {
    type: "ul",
    items: [
      "These Terms are between you and us, not Apple. Apple is not responsible for the Service or its content.",
      "Apple has no obligation to provide maintenance or support for the app.",
      "If the app fails to conform to any applicable warranty, you may notify Apple and Apple will refund the purchase price of the app (if any); Apple has no other warranty obligation to the extent permitted by law.",
      "Apple is not responsible for any claims relating to the app, including product liability, legal or regulatory compliance, or consumer protection claims.",
      "Apple is not responsible for investigating or defending a claim that the app infringes a third party's intellectual property rights.",
      "You confirm that you are not located in a country subject to a US Government embargo or designated as \"terrorist supporting\", and that you are not on a US Government list of prohibited or restricted parties.",
      "Apple and its subsidiaries are third-party beneficiaries of these Terms and may enforce them against you.",
    ],
  },

  { type: "h2", text: "15. Changes to these Terms" },
  {
    type: "p",
    text: "We will announce changes in the app at least 7 days before they take effect, and at least 30 days before changes that are worse for you. If you do not agree, you can stop using Earcast and delete your account; continuing to use it after the change requires your agreement to the new version.",
  },

  { type: "h2", text: "16. Governing law and disputes" },
  {
    type: "ol",
    items: [
      "Please contact us first — most problems can be solved quickly.",
      "These Terms are governed by the laws of the Republic of Korea. **If you are a consumer, you also keep the protection of the mandatory laws of the country where you live**, and you may bring a claim in the courts there.",
      "If any part of these Terms is found unenforceable, the rest remains in effect.",
    ],
  },

  { type: "h2", text: "17. Contact" },
  {
    type: "dl",
    items: [
      { term: "Business operator", desc: TBD.company },
      { term: "Business registration no.", desc: TBD.registration },
      { term: "Address", desc: TBD.address },
      { term: "Email", desc: site.contactEmail },
    ],
  },
];
