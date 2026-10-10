package expo.modules.playsubscriptionchange

import android.app.Activity
import android.content.Context
import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.BillingClientStateListener
import com.android.billingclient.api.BillingFlowParams
import com.android.billingclient.api.BillingResult
import com.android.billingclient.api.PendingPurchasesParams
import com.android.billingclient.api.ProductDetails
import com.android.billingclient.api.Purchase
import com.android.billingclient.api.PurchasesUpdatedListener
import com.android.billingclient.api.QueryProductDetailsParams
import com.android.billingclient.api.QueryProductDetailsResult
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Google Play 정기 결제 **교체**(업·다운그레이드)를 교체 방식까지 지정해 연다(KAN-158, PM 2026-10-08).
 *
 * 왜 따로 있나 — 결제 라이브러리(expo-iap 5.8 · openiap-google 3.6)는 교체 방식을 고를 수 없다. 구매 토큰만 넘기면
 * CHARGE_FULL_PRICE(5)로 고정되고, 상품 단위 교체(subscriptionProductReplacementParams, Billing 8.1)는 기기의 Play 스토어가
 * 아직 몰라 결제 시트가 "정기 결제 요금제를 변경할 수 없습니다"로 끝난다(Google Issue 561369347, 2026-10-08 개발계 실측).
 * 그래서 이 모듈은 Billing 을 직접 불러 **종전 SubscriptionUpdateParams + 교체 방식(정수)** 으로 시트를 연다 —
 * 업그레이드 CHARGE_PRORATED_PRICE(2, 즉시 + 남은 기간 비례 청구) · 다운그레이드 DEFERRED(6, 다음 갱신부터).
 *
 * 결과는 이 모듈의 BillingClient 리스너로만 온다 — 결제 라이브러리의 구매 리스너는 울리지 않는다. JS 가 돌려받은 구매를
 * 서버에 제출한다(구매 확인 acknowledge 는 종전대로 서버 몫). 실패는 Play responseCode · debugMessage 를 그대로 싣는다.
 */
class PlaySubscriptionChangeModule : Module() {
  private var client: BillingClient? = null
  /** 지금 열린 교체 — 한 번에 하나. 시트 결과(리스너)가 이걸로 끝낸다 */
  private var pending: Promise? = null

  override fun definition() = ModuleDefinition {
    Name("PlaySubscriptionChange")

    AsyncFunction("changeSubscription") {
        productId: String,
        oldPurchaseToken: String,
        replacementMode: Int,
        obfuscatedAccountId: String?,
        promise: Promise ->
      val activity = appContext.currentActivity
      if (activity == null) {
        promise.reject("E_NO_ACTIVITY", "No current activity", null)
        return@AsyncFunction
      }
      if (pending != null) {
        promise.reject("E_BUSY", "Another subscription change is in progress", null)
        return@AsyncFunction
      }
      pending = promise
      withClient(activity.applicationContext) { billing ->
        queryAndLaunch(billing, activity, productId, oldPurchaseToken, replacementMode, obfuscatedAccountId)
      }
    }

    OnDestroy {
      client?.endConnection()
      client = null
    }
  }

  private val purchasesUpdatedListener = PurchasesUpdatedListener { result, purchases ->
    when (result.responseCode) {
      BillingClient.BillingResponseCode.OK -> resolve(purchases.orEmpty().map(::toMap))
      BillingClient.BillingResponseCode.USER_CANCELED -> reject("E_USER_CANCELLED", result)
      else -> reject("E_BILLING_${result.responseCode}", result)
    }
  }

  private fun withClient(context: Context, onReady: (BillingClient) -> Unit) {
    val existing = client
    if (existing != null && existing.isReady) {
      onReady(existing)
      return
    }
    val billing = existing ?: BillingClient.newBuilder(context)
      .setListener(purchasesUpdatedListener)
      .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
      .build()
      .also { client = it }
    billing.startConnection(object : BillingClientStateListener {
      override fun onBillingSetupFinished(result: BillingResult) {
        if (result.responseCode == BillingClient.BillingResponseCode.OK) onReady(billing)
        else reject("E_BILLING_${result.responseCode}", result)
      }

      override fun onBillingServiceDisconnected() {
        // 연결 도중 끊김 — 다음 호출이 다시 잇는다. 열린 요청은 실패로 끝낸다
        reject("E_SERVICE_DISCONNECTED", null)
      }
    })
  }

  private fun queryAndLaunch(
    billing: BillingClient,
    activity: Activity,
    productId: String,
    oldPurchaseToken: String,
    replacementMode: Int,
    obfuscatedAccountId: String?,
  ) {
    val query = QueryProductDetailsParams.newBuilder()
      .setProductList(
        listOf(
          QueryProductDetailsParams.Product.newBuilder()
            .setProductId(productId)
            .setProductType(BillingClient.ProductType.SUBS)
            .build(),
        ),
      )
      .build()
    billing.queryProductDetailsAsync(query) { result: BillingResult, details: QueryProductDetailsResult ->
      if (result.responseCode != BillingClient.BillingResponseCode.OK) {
        reject("E_BILLING_${result.responseCode}", result)
        return@queryProductDetailsAsync
      }
      val product: ProductDetails? = details.productDetailsList.firstOrNull { it.productId == productId }
      // 기본 요금제의 기본 가격(특가 offerId 없음)으로 바꾼다 — 없으면 첫 오퍼
      val offers = product?.subscriptionOfferDetails.orEmpty()
      val offerToken = (offers.firstOrNull { it.offerId == null } ?: offers.firstOrNull())?.offerToken
      if (product == null || offerToken == null) {
        reject("E_PRODUCT_NOT_FOUND", null)
        return@queryProductDetailsAsync
      }

      @Suppress("DEPRECATION")
      val updateParams = BillingFlowParams.SubscriptionUpdateParams.newBuilder()
        .setOldPurchaseToken(oldPurchaseToken)
        .setSubscriptionReplacementMode(replacementMode)
        .build()
      val flowParams = BillingFlowParams.newBuilder()
        .setProductDetailsParamsList(
          listOf(
            BillingFlowParams.ProductDetailsParams.newBuilder()
              .setProductDetails(product)
              .setOfferToken(offerToken)
              .build(),
          ),
        )
        .setSubscriptionUpdateParams(updateParams)
        // 교체되는 구독에 실린 값과 같아야 한다 — 다르면 Google 이 DEVELOPER_ERROR 로 거절한다(KAN-158). 없으면 싣지 않는다
        .apply { obfuscatedAccountId?.let { setObfuscatedAccountId(it) } }
        .build()

      // 시트는 UI 스레드에서 연다
      activity.runOnUiThread {
        val launch = billing.launchBillingFlow(activity, flowParams)
        if (launch.responseCode != BillingClient.BillingResponseCode.OK) {
          reject("E_BILLING_${launch.responseCode}", launch)
        }
      }
    }
  }

  private fun toMap(purchase: Purchase): Map<String, Any?> = mapOf(
    "productId" to purchase.products.firstOrNull(),
    "purchaseToken" to purchase.purchaseToken,
    "orderId" to purchase.orderId,
    "purchaseState" to when (purchase.purchaseState) {
      Purchase.PurchaseState.PURCHASED -> "purchased"
      Purchase.PurchaseState.PENDING -> "pending"
      else -> "unknown"
    },
    "isAcknowledged" to purchase.isAcknowledged,
    "purchaseTime" to purchase.purchaseTime.toDouble(),
  )

  private fun resolve(value: List<Map<String, Any?>>) {
    val promise = pending ?: return
    pending = null
    promise.resolve(value)
  }

  private fun reject(code: String, result: BillingResult?) {
    val promise = pending ?: return
    pending = null
    // responseCode · debugMessage 를 함께 — 시트 오류 원인을 로그에서 볼 수 있게(KAN-158 수정 3)
    val message = if (result == null) code else "${result.responseCode}: ${result.debugMessage}"
    promise.reject(code, message, null)
  }
}
