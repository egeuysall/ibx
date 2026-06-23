import Foundation

struct OfflineTodoPatch: Codable, Hashable {
    var title: String?
    var notes: String?
    var hasNotes = false
    var dueDate: String?
    var hasDueDate = false
    var estimatedHours: Double?
    var hasEstimatedHours = false
    var timeBlockStart: Double?
    var hasTimeBlockStart = false
    var recurrence: TodoRecurrence?
    var priority: Int?
    var status: TodoStatus?

    var requestBody: [String: EncodableValue] {
        var body: [String: EncodableValue] = [:]
        if let title {
            body["title"] = .string(title)
        }
        if hasNotes {
            body["notes"] = notes.map(EncodableValue.string) ?? .null
        }
        if hasDueDate {
            body["dueDate"] = dueDate.map(EncodableValue.string) ?? .null
        }
        if hasEstimatedHours {
            body["estimatedHours"] = estimatedHours.map(EncodableValue.double) ?? .null
        }
        if hasTimeBlockStart {
            body["timeBlockStart"] = timeBlockStart.map(EncodableValue.double) ?? .null
        }
        if let recurrence {
            body["recurrence"] = .string(recurrence.rawValue)
        }
        if let priority {
            body["priority"] = .int(priority)
        }
        if let status {
            body["status"] = .string(status.rawValue)
        }
        return body
    }

    static func createPayload(for todo: TodoItem) -> OfflineTodoPatch {
        OfflineTodoPatch(
            title: todo.title,
            notes: todo.notes,
            hasNotes: true,
            dueDate: todo.dueDateKey,
            hasDueDate: true,
            estimatedHours: todo.estimatedHours,
            hasEstimatedHours: true,
            timeBlockStart: todo.timeBlockStart,
            hasTimeBlockStart: true,
            recurrence: todo.recurrence,
            priority: todo.priority,
            status: nil
        )
    }
}

struct PendingTodoOperation: Identifiable, Codable, Hashable {
    enum Kind: String, Codable {
        case create
        case generate
        case update
        case delete
    }

    var id: String
    var kind: Kind
    var todoId: String?
    var text: String?
    var payload: OfflineTodoPatch?
    var createdAt: Double
}

struct OfflineTaskSnapshot: Codable, Hashable {
    var todos: [TodoItem] = []
    var pendingOperations: [PendingTodoOperation] = []
}

actor OfflineTaskStorage {
    private let fileURL: URL
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    init(fileURL: URL? = nil) {
        if let fileURL {
            self.fileURL = fileURL
        } else {
            let directory = FileManager.default.urls(
                for: .applicationSupportDirectory,
                in: .userDomainMask
            )[0].appendingPathComponent("IBX", isDirectory: true)
            self.fileURL = directory.appendingPathComponent("offline-tasks.json")
        }
    }

    func loadSnapshot() throws -> OfflineTaskSnapshot {
        guard FileManager.default.fileExists(atPath: fileURL.path) else {
            return OfflineTaskSnapshot()
        }
        let data = try Data(contentsOf: fileURL)
        return try decoder.decode(OfflineTaskSnapshot.self, from: data)
    }

    func saveSnapshot(_ snapshot: OfflineTaskSnapshot) throws {
        let directory = fileURL.deletingLastPathComponent()
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let data = try encoder.encode(snapshot)
        try data.write(to: fileURL, options: [.atomic])
    }

    func replaceTodos(_ todos: [TodoItem]) throws {
        var snapshot = try loadSnapshot()
        snapshot.todos = todos
        try saveSnapshot(snapshot)
    }

    @discardableResult
    func addShortcutTodo(
        title: String,
        notes: String? = nil,
        dueDate: Date? = nil,
        estimatedHours: Double? = nil,
        priority: Int = 1
    ) throws -> TodoItem {
        let todo = Self.localTodo(
            title: title,
            notes: notes,
            dueDate: dueDate,
            estimatedHours: estimatedHours,
            priority: priority,
            source: .manual
        )
        var snapshot = try loadSnapshot()
        snapshot.todos.removeAll { $0.id == todo.id }
        snapshot.todos.append(todo)
        snapshot.pendingOperations.append(PendingTodoOperation(
            id: UUID().uuidString,
            kind: .create,
            todoId: todo.id,
            text: nil,
            payload: .createPayload(for: todo),
            createdAt: Date().millisecondsSince1970
        ))
        try saveSnapshot(snapshot)
        return todo
    }

    static func localTodo(
        title: String,
        notes: String? = nil,
        dueDate: Date? = Date(),
        estimatedHours: Double? = 2,
        priority: Int = 1,
        source: TodoSource
    ) -> TodoItem {
        let now = Date()
        let id = "local-\(UUID().uuidString)"
        return TodoItem(
            id: id,
            thoughtId: id,
            title: title,
            notes: notes,
            status: .open,
            dueDate: dueDate?.millisecondsSince1970,
            estimatedHours: estimatedHours,
            timeBlockStart: nil,
            priority: TodoItem.normalizedPriority(priority),
            recurrence: .none,
            source: source,
            createdAt: now.millisecondsSince1970
        )
    }
}

extension TodoItem {
    var isLocalOnly: Bool {
        id.hasPrefix("local-")
    }
}
