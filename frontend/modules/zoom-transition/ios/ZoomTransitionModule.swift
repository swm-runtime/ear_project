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
  private static var diagnostics: [String] = []

  @objc public static func noteDiagnostic(_ note: String) {
    diagnostics.append(note)
    if diagnostics.count > 8 { diagnostics.removeFirst(diagnostics.count - 8) }
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
