import SwiftUI
import ClerkKit

@main
struct IBXApp: App {
    @State private var store = TaskStore()

    init() {
        Clerk.configure(publishableKey: ClerkConfig.publishableKey)
    }

    var body: some Scene {
        WindowGroup {
            ContentView(store: store)
                .environment(Clerk.shared)
        }
    }
}
