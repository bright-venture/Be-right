import UIKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        for window in PrivacyCover.windows(of: application, fallback: window) {
            PrivacyCover.show(in: window)
        }
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Hide addresses, phone numbers and documents from the app switcher snapshot.
        for window in PrivacyCover.windows(of: application, fallback: window) where !PrivacyCover.isCovered(window) {
            window.addSubview(PrivacyCover.makeView(covering: window))
        }
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        for window in PrivacyCover.windows(of: application, fallback: window) {
            PrivacyCover.hide(in: window)
        }
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration",
                                          sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }
}

/// Covers the app with a blur while it is in the background, so the snapshot iOS keeps for the
/// app switcher shows no personal details. The app uses scenes, so SceneDelegate calls this;
/// the AppDelegate calls cover iOS versions that run without scenes.
enum PrivacyCover {
    private static let tag = 0xB12_6417

    /// Every window the app shows: the scenes' windows, or the app's own one without scenes.
    static func windows(of application: UIApplication, fallback: UIWindow?) -> [UIWindow] {
        let sceneWindows = application.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }
        return sceneWindows.isEmpty ? [fallback].compactMap { $0 } : sceneWindows
    }

    static func isCovered(_ window: UIWindow) -> Bool {
        window.viewWithTag(tag) != nil
    }

    /// A blur the size of the window, resizing with it.
    static func makeView(covering window: UIWindow) -> UIView {
        let cover = UIVisualEffectView(effect: UIBlurEffect(style: .systemMaterial))
        cover.frame = window.bounds
        cover.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        cover.tag = tag
        return cover
    }

    static func show(in window: UIWindow?) {
        guard let window = window, !isCovered(window) else { return }
        window.addSubview(makeView(covering: window))
    }

    static func hide(in window: UIWindow?) {
        window?.viewWithTag(tag)?.removeFromSuperview()
    }
}
