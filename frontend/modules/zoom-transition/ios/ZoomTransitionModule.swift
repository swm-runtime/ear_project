import ExpoModulesCore
import UIKit

/**
 iOS 18 **줌 전환**(`UIViewController.preferredTransition = .zoom(sourceViewProvider:)`)의 소스 뷰 등록소.

 애플 뮤직의 미니플레이어 → Now Playing 전환(카드가 부풀어 오르고, 닫으면 그 자리로 줄어들며, 드래그·핀치로 닫힌다)에
 애플이 공개한 가장 가까운 API 가 이것이다(PM 2026-09-26 03:53 "애플처럼 켜지고 작아지는 전환"). react-native-screens 는
 이 API 를 노출하지 않으므로 patch-package 로 모달을 띄우기 직전(`RNSScreenStack` `presentViewController:`)에
 `ZoomTransitionRegistry.takeSourceView()` 를 읽어 `preferredTransition` 을 건다 — 패치는 `NSClassFromString` 으로
 이 클래스를 찾으므로 모듈이 없는 빌드에서도 RNS 는 그대로 동작한다.

 흐름: JS 가 미니플레이어를 탭하면 `arm(viewTag)` 로 그 카드 뷰를 등록하고 곧바로 navigate → RNS 가 모달을 만들며
 소스 뷰를 가져가(1회성) 줌으로 띄운다. 등록만 하고 화면이 안 뜨면 다음 모달이 엉뚱한 곳에서 부풀 수 있어 `disarm` 을 둔다.
 */
@objc(ZoomTransitionRegistry)
public class ZoomTransitionRegistry: NSObject {
  private static weak var sourceView: UIView?

  @objc public static func arm(_ view: UIView) {
    sourceView = view
    zoomOver = false
  }

  /// 줌 모달이 닫혔다 — 이후 UIKit 이 소스 뷰 provider 를 다시 불러도 nil 을 준다(RNS 패치가 읽는다)
  private static var zoomOver = false

  @objc public static func markZoomOver() {
    zoomOver = true
  }

  @objc public static func isZoomOver() -> NSNumber {
    return NSNumber(value: zoomOver)
  }

  @objc public static func disarm() {
    sourceView = nil
  }

  /// 1회성 — 읽으면 비운다
  @objc public static func takeSourceView() -> UIView? {
    let view = sourceView
    sourceView = nil
    return view
  }

  /// 시스템의 드래그·핀치 닫기를 지금 막아야 하는가 — 재생 목록·대본 패널이 열려 있거나 손가락이 스크롤 목록 위에서
  /// 시작했을 때(15:49 PM "재생목록 내려갈 때 미니플레이어도 같이 내려간다"). RNS 패치의 `interactiveDismissShouldBegin` 이 읽는다
  private static var interactiveDismissBlocked = false

  @objc public static func setInteractiveDismissBlocked(_ blocked: Bool) {
    interactiveDismissBlocked = blocked
  }

  @objc public static func isInteractiveDismissBlocked() -> NSNumber {
    return NSNumber(value: interactiveDismissBlocked)
  }

  /// RNS 패치가 남기는 진단 기록(최근 8건) — 설정 > 스택 라우트 줄에서 읽는다(2026-09-26 21:57: 드래그 닫기 뒤
  /// 탭 전환 때 플레이어가 번쩍이는데 JS 는 깨끗했다 → 패치가 실제로 돌았는지 기기에서 확인)
  private static let diagnosticsKey = "ear.zoomTransition.diagnostics"
  /// 앱을 죽여도 남게 UserDefaults 에 둔다(2026-09-27 01:59 "플레이어가 또 뜨면서 벽돌" — 굳으면 재실행해야 읽을 수 있다).
  /// 이전 실행분은 "[prev]" 로 앞에 붙여 한 번 보여 주고 이번 실행의 기록으로 덮는다
  private static var diagnostics: [String] = {
    let previous = UserDefaults.standard.stringArray(forKey: diagnosticsKey) ?? []
    UserDefaults.standard.removeObject(forKey: diagnosticsKey)
    return previous.isEmpty ? [] : ["[prev] " + previous.joined(separator: " > "), "[now]"]
  }()

  @objc public static func noteDiagnostic(_ note: String) {
    diagnostics.append(note)
    if diagnostics.count > 24 { diagnostics.removeFirst(diagnostics.count - 24) }
    UserDefaults.standard.set(diagnostics, forKey: diagnosticsKey)
  }

  static func diagnosticsText() -> String {
    return diagnostics.isEmpty ? "none" : diagnostics.joined(separator: " > ")
  }
}

public class ZoomTransitionModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ZoomTransition")

    // testID(accessibilityIdentifier)로 **지금 보이는** 뷰를 찾아 등록한다 — 미니플레이어는 시스템 탭 바가 두 배치(regular·inline)를
    // 다 렌더하고 하나만 보이므로 창에 붙어 있고 숨겨지지 않은 것을 고른다. JS 가 ref 를 들고 있지 않아도 된다.
    // 반환: "armed" | "unavailable"(iOS 18 미만) | "no-view"
    AsyncFunction("arm") { (testId: String) -> String in
      guard #available(iOS 18.0, *) else { return "unavailable" }
      guard let view = Self.findVisibleView(testId: testId) else {
        ZoomTransitionRegistry.disarm()
        return "no-view"
      }
      ZoomTransitionRegistry.arm(view)
      return "armed"
    }.runOnQueue(.main)

    Function("disarm") {
      ZoomTransitionRegistry.disarm()
    }

    // 동기 — 패널 열림·목록 위 터치 시작 즉시 반영돼야 시스템 제스처가 시작되기 전에 막힌다
    Function("setInteractiveDismissBlocked") { (blocked: Bool) in
      ZoomTransitionRegistry.setInteractiveDismissBlocked(blocked)
    }

    Function("getDiagnostics") { () -> String in
      return ZoomTransitionRegistry.diagnosticsText()
    }

    // 줌으로 띄운 모달을 **UIKit 이 먼저** 닫는다(2026-09-27 02:57 실험으로 확정: JS 가 먼저 pop 하면 react-native-screens 가
    // dismiss 전에 화면 뷰를 스냅샷으로 갈아끼우고, 줌 dismiss 는 그 스냅샷 위에서 끝나지 못해 앱이 굳는다). 닫힘이 끝나면
    // RNS 가 viewDidDisappear 에서 JS 에 onDismissed 를 보내 라우트가 pop 되고, 그때 뷰는 이미 창 밖이라 스냅샷을 안 만든다.
    // 반환: "dismissed" | "none"(떠 있는 모달 없음)
    // mode: "zoom"(줌 축소) | "slide"(닫을 때만 줌 훅을 빼 기본 슬라이드) — 2026-09-27 04:35 실험 스위치(JS 상수로 OTA 전환).
    // 프록시 소스로도 닫힌 뒤 탭 전환 잔상이 남아, 줌 dismiss 자체가 남기는 이미지인지 가른다
    AsyncFunction("dismissPresentedScreen") { (mode: String) -> String in
      guard let top = Self.topPresentedViewController(), top.presentingViewController != nil else { return "none" }
      ZoomTransitionRegistry.noteDiagnostic("native-dismiss:\(mode)")
      if mode == "slide", #available(iOS 18.0, *) { top.preferredTransition = nil }
      // 닫기 **전에** 이 VC 를 감싼 UIKit 래퍼들을 적어 둔다 — 닫히고 나면 `top.view` 가 계층에서 빠져 위로 못 올라간다
      let containers = Self.presentationContainers(of: top)
      top.dismiss(animated: true) {
        if #available(iOS 18.0, *) { top.preferredTransition = nil }
        // 닫힌 뒤 살아 있는 동안 그릴 게 없게 숨긴다. 자식 뷰를 직접 떼면 안 된다 — Fabric 이 관리하는 트리라 React 가 나중에
        // 같은 자식을 unmount 하며 단언 실패로 크래시했다(2026-09-27 04:53, 빌드 35)
        top.view.isHidden = true
        top.view.layer.contents = nil
        Self.discardLeftoverContainers(containers)
        // UIKit 이 한 턴 뒤에 놓는 경우가 있어 다음 런루프에 한 번 더 본다(이미 정리됐으면 window 가 nil 이라 건너뛴다)
        DispatchQueue.main.async { Self.discardLeftoverContainers(containers) }
        ZoomTransitionRegistry.markZoomOver()
        ZoomTransitionRegistry.noteDiagnostic("native-dismiss:done")
      }
      return "dismissed"
    }.runOnQueue(.main)
  }

  /**
   닫을 VC 의 뷰를 감싼 **UIKit 소유 래퍼**(`_UITransitionView` · `UIDropShadowView` 등)를 창 바로 아래까지 모은다.

   창 전체를 클래스 이름으로 훑지 않는 이유: 정상 모달·시스템 화면의 컨테이너까지 지우면 검은 화면·터치 불가가 된다.
   `top.view` 에서 위로만 타면 **이 VC 의 것**만 잡힌다(추측 없음). Fabric 이 관리하는 `top.view` 의 자식은 건드리지 않는다.
   */
  private static func presentationContainers(of controller: UIViewController) -> [UIView] {
    guard let view = controller.viewIfLoaded else { return [] }
    var containers: [UIView] = []
    var current = view.superview
    // 깊이 상한 — 계층이 예상과 달라도 창까지 통째로 훑지 않는다
    while let parent = current, !(parent is UIWindow), containers.count < 6 {
      containers.append(parent)
      current = parent.superview
    }
    return containers
  }

  /**
   줌 dismiss 가 끝났는데도 창에 남아 있는 전환 컨테이너를 뗀다.

   **번쩍임의 실제 범인이다**(2026-09-27 05:16 실기기 확정 — 닫기를 `slide` 로 바꾸자 사라졌다): 줌으로 닫으면 UIKit 이
   이 컨테이너를 창에 분리된 채 남기고, 탭을 바꿀 때 창 레이아웃 패스가 그 transform 을 되돌려 **한 프레임 전체 화면으로**
   찍혔다. `top.view.isHidden` 이 안 들었던 것은 범인이 그 위 래퍼였기 때문이다.

   - 이미 창에서 빠졌으면(UIKit 이 정상 정리) 아무것도 하지 않는다.
   - 창의 루트 뷰이거나 루트를 품고 있으면 **절대 건드리지 않는다** — 앱이 검은 화면이 된다.
   */
  private static func discardLeftoverContainers(_ containers: [UIView]) {
    for container in containers {
      guard let window = container.window else { continue }
      if container === window.rootViewController?.viewIfLoaded { continue }
      if let root = window.rootViewController?.viewIfLoaded, root.isDescendant(of: container) { continue }
      container.isHidden = true
      container.removeFromSuperview()
      ZoomTransitionRegistry.noteDiagnostic("cleaned:\(String(describing: type(of: container)))")
    }
  }

  private static func topPresentedViewController() -> UIViewController? {
    let windows = UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap { $0.windows }
    guard let root = (windows.first { $0.isKeyWindow } ?? windows.first)?.rootViewController else { return nil }
    var top = root
    while let presented = top.presentedViewController { top = presented }
    return top
  }

  private static func findVisibleView(testId: String) -> UIView? {
    let windows = UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap { $0.windows }
    for window in windows where !window.isHidden {
      if let found = search(root: window, testId: testId) { return found }
    }
    return nil
  }

  private static func search(root: UIView, testId: String) -> UIView? {
    for subview in root.subviews {
      if subview.isHidden || subview.alpha < 0.01 { continue }
      if subview.accessibilityIdentifier == testId, subview.window != nil, !subview.bounds.isEmpty {
        return subview
      }
      if let found = search(root: subview, testId: testId) { return found }
    }
    return nil
  }
}
