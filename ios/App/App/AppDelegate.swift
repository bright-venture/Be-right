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
        PrivacyCover.show(in: window)
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Hide addresses, phone numbers and documents from the app switcher snapshot.
        PrivacyCover.show(in: window)
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        PrivacyCover.hide(in: window)
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

    static func show(in window: UIWindow?) {
        guard let window = window, window.viewWithTag(tag) == nil else { return }
        let cover = UIVisualEffectView(effect: UIBlurEffect(style: .systemMaterial))
        cover.frame = window.bounds
        cover.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        cover.tag = tag
        window.addSubview(cover)
    }

    static func hide(in window: UIWindow?) {
        window?.viewWithTag(tag)?.removeFromSuperview()
    }
}
