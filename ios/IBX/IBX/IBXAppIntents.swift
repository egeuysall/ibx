import AppIntents
import Foundation

struct AddIBXTodoIntent: AppIntent {
    static let title: LocalizedStringResource = "Add ibx Todo"
    static let description = IntentDescription("Save a todo to ibx. Works offline and syncs later.")
    static let openAppWhenRun = false

    @Parameter(title: "Todo", inputConnectionBehavior: .connectToPreviousIntentResult)
    var title: String

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedTitle.isEmpty else {
            return .result(dialog: "Todo is empty.")
        }

        _ = try await OfflineTaskStorage().addShortcutTodo(title: trimmedTitle)
        return .result(dialog: "Saved to ibx.")
    }
}

struct IBXShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: AddIBXTodoIntent(),
            phrases: [
                "Add todo to \(.applicationName)",
                "Capture in \(.applicationName)",
                "Save to \(.applicationName)",
            ],
            shortTitle: "Add Todo",
            systemImageName: "plus.circle"
        )
    }
}
