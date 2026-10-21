import type { Metadata } from "next";
import { enAccountDeletionBlocks, enTranslationNotice } from "@/content/en/account-deletion";
import { enRouteMetadata } from "@/lib/seo";
import { EnLegalPage } from "../LegalPage";

export const metadata: Metadata = enRouteMetadata("accountDeletion");

/** Google Play "계정 삭제 요청 URL"의 영어판(글로벌 리스팅용). */
export default function EnAccountDeletionPage() {
  return (
    <EnLegalPage
      routeKey="accountDeletion"
      lede="You can delete your account directly in the app. This page also explains what is deleted and what the law requires us to keep."
      blocks={enAccountDeletionBlocks}
      next={["privacy", "terms"]}
      translationNotice={enTranslationNotice}
    />
  );
}
