import AppIntents
import Foundation

enum IBXShortcutPriority: String, AppEnum {
    case p1
    case p2
    case p3

    static let typeDisplayRepresentation = TypeDisplayRepresentation(name: "Priority")
    static let caseDisplayRepresentations: [IBXShortcutPriority: DisplayRepresentation] = [
        .p1: "p1",
        .p2: "p2",
        .p3: "p3",
    ]

    var value: Int {
        switch self {
        case .p1: 1
        case .p2: 2
        case .p3: 3
        }
    }
}

struct AddIBXTodoIntent: AppIntent {
    static let title: LocalizedStringResource = "Add ibx Todo"
    static let description = IntentDescription("Save a todo to ibx. Notes, dates, priority, and estimates work offline and sync later.")
    static let openAppWhenRun = false

    @Parameter(title: "Todo", inputConnectionBehavior: .connectToPreviousIntentResult)
    var title: String

    @Parameter(title: "Notes")
    var notes: String?

    @Parameter(title: "Due Date")
    var dueDate: Date?

    @Parameter(title: "Estimated Hours")
    var estimatedHours: Double?

    @Parameter(title: "Priority")
    var priority: IBXShortcutPriority?

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedTitle.isEmpty else {
            return .result(dialog: "Todo is empty.")
        }

        let trimmedNotes = notes?.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedNotes = trimmedNotes?.isEmpty == false ? trimmedNotes : nil
        let normalizedHours = estimatedHours.flatMap { hours in
            hours.isFinite && hours > 0 ? min(hours, 24) : nil
        }

        _ = try await OfflineTaskStorage().addShortcutTodo(
            title: trimmedTitle,
            notes: normalizedNotes,
            dueDate: dueDate,
            estimatedHours: normalizedHours,
            priority: priority?.value ?? 1
        )
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
