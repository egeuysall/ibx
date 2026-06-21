import Foundation
import Observation
import SwiftUI

@MainActor
@Observable
final class TaskStore {
    var todos: [TodoItem] = []
    var selectedFilter: TaskFilter = .today
    var defaultFilter: TaskFilter = .today
    var themePreference: ThemePreference = .dark
    var notificationsEnabled = true
    var autoRefreshEnabled = true
    var commandText = ""
    var isAuthenticated = false
    var isLoading = false
    var isSavingSettings = false
    var statusMessage: String?
    var errorMessage: String?
    var pendingOfflineCount = 0

    private let keychain = KeychainStore()
    private static let productionBaseURL = URL(string: "https://ibx.egeuysal.com")!
    private let defaultFilterAccount = "default-filter"
    private let themeAccount = "theme"
    private let notificationsAccount = "notifications-enabled"
    private let autoRefreshAccount = "auto-refresh-enabled"
    private let notificationScheduler = NotificationScheduler()
    private let offlineStorage = OfflineTaskStorage()
    @ObservationIgnored private var toastDismissTask: Task<Void, Never>?
    @ObservationIgnored var authTokenProvider: (@Sendable () async throws -> String?)?

    init() {
        defaultFilter = TaskFilter(rawValue: keychain.read(defaultFilterAccount) ?? "") ?? .today
        selectedFilter = defaultFilter
        themePreference = ThemePreference(rawValue: keychain.read(themeAccount) ?? "") ?? .dark
        notificationsEnabled = keychain.read(notificationsAccount) != "0"
        autoRefreshEnabled = keychain.read(autoRefreshAccount) != "0"
    }

    var filteredTodos: [TodoItem] {
        filteredTodos(for: selectedFilter)
    }

    func count(for filter: TaskFilter) -> Int {
        filteredTodos(for: filter).count
    }

    private func filteredTodos(for filter: TaskFilter) -> [TodoItem] {
        let calendar = Calendar.current
        let now = Date()
        let todayKey = Self.dateKey(now)
        let openTodos = todos.filter { $0.status == .open }
        let today = openTodos.filter { $0.dueDateKey == todayKey }
        switch filter {
        case .zen:
            return openTodos.sortedForIBX().prefix(1).map { $0 }
        case .today:
            return today.sortedForIBX()
        case .upcoming:
            return openTodos.filter { todo in
                guard let dueDay = todo.dueDay, todo.dueDateKey != todayKey else { return false }
                return dueDay > calendar.startOfDay(for: now)
            }.sortedForIBX()
        case .archive:
            return todos.filter { $0.status == .done }.sortedForIBX()
        }
    }

    var sections: [TodoSection] {
        let items = filteredTodos
        if selectedFilter == .today {
            return [1, 2, 3].compactMap { priority in
                let matches = items.filter { TodoItem.normalizedPriority($0.priority) == priority }
                guard !matches.isEmpty else { return nil }
                return TodoSection(id: "priority-\(priority)", title: priorityTitle(priority), todos: matches)
            }
        }
        let groups = Dictionary(grouping: items) { todo in
            sectionTitle(for: todo)
        }
        return groups.keys.sorted().map { key in
            TodoSection(id: key, title: key, todos: groups[key]?.sortedForIBX() ?? [])
        }
    }

    func bootstrap() async {
        await loadOfflineSnapshot()
        guard isAuthenticated else { return }
        await refresh(showToast: false)
        await syncNotifications()
    }

    func saveSettings() async {
        isSavingSettings = true
        defer { isSavingSettings = false }

        do {
            try keychain.save(defaultFilter.rawValue, account: defaultFilterAccount)
            try keychain.save(themePreference.rawValue, account: themeAccount)
            try keychain.save(notificationsEnabled ? "1" : "0", account: notificationsAccount)
            try keychain.save(autoRefreshEnabled ? "1" : "0", account: autoRefreshAccount)
            showStatus("Settings saved.")
            if isAuthenticated {
                showStatus("Connected.")
                await refresh(showToast: false)
            }
        } catch {
            showError(error.localizedDescription)
        }
    }

    func setAuthenticationState(isAuthenticated nextValue: Bool) async {
        guard isAuthenticated != nextValue else { return }
        isAuthenticated = nextValue
        if nextValue {
            await refresh(showToast: false)
        } else {
            await loadOfflineSnapshot()
            await syncNotifications()
        }
    }

    func refresh(showToast: Bool = true) async {
        await loadOfflineSnapshot()
        guard isAuthenticated else {
            if showToast {
                showStatus("Offline tasks loaded.")
            }
            return
        }

        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            try await flushPendingOperations()
            let nextTodos = try await client.listTodos()
            todos = nextTodos
            try await saveOfflineSnapshot(todos: nextTodos, pendingOperations: [])
            await syncNotifications()
            if showToast {
                showStatus("Tasks refreshed.")
            }
        } catch {
            await loadOfflineSnapshot()
            if showToast {
                showStatus("Offline tasks loaded.")
            }
        }
    }

    func autoRefreshLoop() async {
        while !Task.isCancelled {
            try? await Task.sleep(for: .seconds(15))
            guard autoRefreshEnabled, isAuthenticated else { continue }
            await refresh(showToast: false)
        }
    }

    func addCommandAsTodo() async {
        let title = commandText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty else { return }

        let todo = OfflineTaskStorage.localTodo(title: title, source: .manual)
        commandText = ""
        withAnimation(.smooth(duration: 0.22)) {
            todos.append(todo)
        }
        await enqueue(.init(
            id: UUID().uuidString,
            kind: .create,
            todoId: todo.id,
            text: nil,
            payload: .createPayload(for: todo),
            createdAt: Date().millisecondsSince1970
        ))
        await syncNotifications()
        showStatus("Todo saved.")

        if isAuthenticated {
            await syncQueuedChanges(successMessage: "Todo added.")
        }
    }

    func runCommand() async {
        let text = commandText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }

        let placeholder = OfflineTaskStorage.localTodo(title: text, source: .ai)
        commandText = ""
        withAnimation(.smooth(duration: 0.22)) {
            todos.append(placeholder)
        }
        await enqueue(.init(
            id: UUID().uuidString,
            kind: .generate,
            todoId: placeholder.id,
            text: text,
            payload: nil,
            createdAt: Date().millisecondsSince1970
        ))
        await syncNotifications()
        showStatus("Command queued.")

        if isAuthenticated {
            await syncQueuedChanges(successMessage: "ibx processed the command.")
        }
    }

    func toggle(_ todo: TodoItem) async {
        let nextStatus: TodoStatus = todo.status == .done ? .open : .done
        if let index = todos.firstIndex(where: { $0.id == todo.id }) {
            withAnimation(.smooth(duration: 0.22)) {
                todos[index].status = nextStatus
            }
        }
        await enqueueUpdate(for: todo.id, payload: OfflineTodoPatch(status: nextStatus))
        await syncNotifications()
        if isAuthenticated {
            await syncQueuedChanges(successMessage: nil)
        }
    }

    func update(
        _ todo: TodoItem,
        title: String,
        notes: String?,
        dueDate: Date?,
        estimatedHours: Double?,
        timeBlockStart: Date?,
        recurrence: TodoRecurrence,
        priority: Int
    ) async {
        guard let index = todos.firstIndex(where: { $0.id == todo.id }) else { return }
        todos[index].title = title
        todos[index].notes = notes
        todos[index].dueDate = dueDate?.millisecondsSince1970
        todos[index].estimatedHours = estimatedHours
        todos[index].timeBlockStart = timeBlockStart?.millisecondsSince1970
        todos[index].recurrence = recurrence
        todos[index].priority = priority

        let dateKey = dueDate.map(Self.dateKey)
        await enqueueUpdate(for: todo.id, payload: OfflineTodoPatch(
            title: title,
            notes: notes,
            hasNotes: true,
            dueDate: dateKey,
            hasDueDate: true,
            estimatedHours: estimatedHours,
            hasEstimatedHours: true,
            timeBlockStart: timeBlockStart?.millisecondsSince1970,
            hasTimeBlockStart: true,
            recurrence: recurrence,
            priority: priority
        ))
        await syncNotifications()
        showStatus("Todo saved.")
        if isAuthenticated {
            await syncQueuedChanges(successMessage: "Todo updated.")
        }
    }

    func delete(_ todo: TodoItem) async {
        withAnimation(.smooth(duration: 0.22)) {
            todos.removeAll { $0.id == todo.id }
        }
        await enqueue(.init(
            id: UUID().uuidString,
            kind: .delete,
            todoId: todo.id,
            text: nil,
            payload: nil,
            createdAt: Date().millisecondsSince1970
        ))
        await syncNotifications()
        showStatus("Todo deleted.")
        if isAuthenticated {
            await syncQueuedChanges(successMessage: "Todo deleted.")
        }
    }

    func saveThemePreference() {
        do {
            try keychain.save(themePreference.rawValue, account: themeAccount)
        } catch {
            showError(error.localizedDescription)
        }
    }

    func saveNotificationPreference() async {
        do {
            try keychain.save(notificationsEnabled ? "1" : "0", account: notificationsAccount)
            await syncNotifications()
        } catch {
            showError(error.localizedDescription)
        }
    }

    func saveDefaultFilterPreference() {
        do {
            try keychain.save(defaultFilter.rawValue, account: defaultFilterAccount)
            selectedFilter = defaultFilter
        } catch {
            showError(error.localizedDescription)
        }
    }

    func saveAutoRefreshPreference() {
        do {
            try keychain.save(autoRefreshEnabled ? "1" : "0", account: autoRefreshAccount)
        } catch {
            showError(error.localizedDescription)
        }
    }

    private var client: IBXClient {
        IBXClient(
            baseURL: Self.productionBaseURL,
            authTokenProvider: authTokenProvider
        )
    }

    func loadOfflineSnapshot() async {
        do {
            let snapshot = try await offlineStorage.loadSnapshot()
            if !snapshot.todos.isEmpty || !snapshot.pendingOperations.isEmpty {
                todos = snapshot.todos
            }
            pendingOfflineCount = snapshot.pendingOperations.count
        } catch {
            showError("Could not load offline tasks.")
        }
    }

    private func saveOfflineSnapshot(
        todos: [TodoItem]? = nil,
        pendingOperations: [PendingTodoOperation]? = nil
    ) async throws {
        var snapshot = try await offlineStorage.loadSnapshot()
        if let todos {
            snapshot.todos = todos
        }
        if let pendingOperations {
            snapshot.pendingOperations = pendingOperations
        }
        pendingOfflineCount = snapshot.pendingOperations.count
        try await offlineStorage.saveSnapshot(snapshot)
    }

    private func enqueue(_ operation: PendingTodoOperation) async {
        do {
            var snapshot = try await offlineStorage.loadSnapshot()
            snapshot.todos = todos
            if operation.kind == .delete, let todoId = operation.todoId, todoId.hasPrefix("local-") {
                snapshot.pendingOperations.removeAll { $0.todoId == todoId }
            } else {
                snapshot.pendingOperations.append(operation)
            }
            pendingOfflineCount = snapshot.pendingOperations.count
            try await offlineStorage.saveSnapshot(snapshot)
        } catch {
            showError("Could not save offline change.")
        }
    }

    private func enqueueUpdate(for todoId: String, payload: OfflineTodoPatch) async {
        do {
            var snapshot = try await offlineStorage.loadSnapshot()
            snapshot.todos = todos
            if todoId.hasPrefix("local-"),
               let index = snapshot.pendingOperations.firstIndex(where: { $0.todoId == todoId && $0.kind == .create }) {
                snapshot.pendingOperations[index].payload = merge(
                    existing: snapshot.pendingOperations[index].payload,
                    next: payload
                )
            } else {
                snapshot.pendingOperations.append(.init(
                    id: UUID().uuidString,
                    kind: .update,
                    todoId: todoId,
                    text: nil,
                    payload: payload,
                    createdAt: Date().millisecondsSince1970
                ))
            }
            pendingOfflineCount = snapshot.pendingOperations.count
            try await offlineStorage.saveSnapshot(snapshot)
        } catch {
            showError("Could not save offline change.")
        }
    }

    private func syncQueuedChanges(successMessage: String?) async {
        guard isAuthenticated else { return }
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            try await flushPendingOperations()
            let nextTodos = try await client.listTodos()
            todos = nextTodos
            try await saveOfflineSnapshot(todos: nextTodos, pendingOperations: [])
            await syncNotifications()
            if let successMessage {
                showStatus(successMessage)
            }
        } catch {
            await loadOfflineSnapshot()
            showStatus("Saved offline.")
        }
    }

    private func flushPendingOperations() async throws {
        var snapshot = try await offlineStorage.loadSnapshot()
        guard !snapshot.pendingOperations.isEmpty else {
            pendingOfflineCount = 0
            return
        }

        var remaining: [PendingTodoOperation] = []
        for operation in snapshot.pendingOperations {
            do {
                try await apply(operation)
            } catch {
                remaining.append(operation)
                let pendingTail = snapshot.pendingOperations.drop { $0.id != operation.id }.dropFirst()
                remaining.append(contentsOf: pendingTail)
                snapshot.pendingOperations = remaining
                try await offlineStorage.saveSnapshot(snapshot)
                pendingOfflineCount = remaining.count
                throw error
            }
        }

        snapshot.pendingOperations = []
        try await offlineStorage.saveSnapshot(snapshot)
        pendingOfflineCount = 0
    }

    private func apply(_ operation: PendingTodoOperation) async throws {
        switch operation.kind {
        case .create:
            guard let payload = operation.payload,
                  let title = payload.title?.trimmingCharacters(in: .whitespacesAndNewlines),
                  !title.isEmpty else { return }
            _ = try await client.createTodo(title: title, payload: payload)
        case .generate:
            guard let text = operation.text?.trimmingCharacters(in: .whitespacesAndNewlines),
                  !text.isEmpty else { return }
            _ = try await client.generateTodos(from: text)
        case .update:
            guard let todoId = operation.todoId,
                  !todoId.hasPrefix("local-"),
                  let body = operation.payload?.requestBody,
                  !body.isEmpty else { return }
            try await client.updateTodo(todoId, payload: body)
        case .delete:
            guard let todoId = operation.todoId, !todoId.hasPrefix("local-") else { return }
            try await client.deleteTodo(todoId)
        }
    }

    private func merge(existing: OfflineTodoPatch?, next: OfflineTodoPatch) -> OfflineTodoPatch {
        var merged = existing ?? OfflineTodoPatch()
        if let title = next.title { merged.title = title }
        if next.hasNotes {
            merged.notes = next.notes
            merged.hasNotes = true
        }
        if next.hasDueDate {
            merged.dueDate = next.dueDate
            merged.hasDueDate = true
        }
        if next.hasEstimatedHours {
            merged.estimatedHours = next.estimatedHours
            merged.hasEstimatedHours = true
        }
        if next.hasTimeBlockStart {
            merged.timeBlockStart = next.timeBlockStart
            merged.hasTimeBlockStart = true
        }
        if let recurrence = next.recurrence { merged.recurrence = recurrence }
        if let priority = next.priority { merged.priority = priority }
        if let status = next.status { merged.status = status }
        return merged
    }

    private func performLoading(_ successMessage: String?, operation: () async throws -> Void) async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            try await operation()
            if let successMessage {
                showStatus(successMessage)
            }
        } catch {
            showError(error.localizedDescription)
        }
    }

    private func requireAuthentication() -> Bool {
        if isAuthenticated { return true }
        showError("Sign in with Clerk first.")
        return false
    }

    private func syncNotifications() async {
        await notificationScheduler.sync(todos: todos, enabled: notificationsEnabled && isAuthenticated)
    }

    private func showStatus(_ message: String) {
        statusMessage = message
        errorMessage = nil
        scheduleToastDismiss()
    }

    private func showError(_ message: String) {
        errorMessage = message
        statusMessage = nil
        scheduleToastDismiss()
    }

    private func scheduleToastDismiss() {
        toastDismissTask?.cancel()
        toastDismissTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(3))
            guard !Task.isCancelled else { return }
            await MainActor.run {
                self?.statusMessage = nil
                self?.errorMessage = nil
            }
        }
    }

    private func sectionTitle(for todo: TodoItem) -> String {
        if selectedFilter == .archive { return "done" }
        guard let dueDay = todo.dueDay else { return "no date" }
        if Calendar.current.isDateInToday(dueDay) { return "Today" }
        return dueDay.formatted(date: .abbreviated, time: .omitted)
    }

    private func priorityTitle(_ priority: Int) -> String {
        let matches = filteredTodos.filter { TodoItem.normalizedPriority($0.priority) == priority }
        return "p\(priority) // \(formatSectionHoursLabel(matches))"
    }

    private func formatSectionHoursLabel(_ todos: [TodoItem]) -> String {
        let total = todos.compactMap(\.estimatedHours).reduce(0, +)
        if total <= 0 { return "unsized" }
        return TodoItem.formatHours(total)
    }

    nonisolated static func dateKey(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = .current
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }
}

private extension Array where Element == TodoItem {
    func sortedForIBX() -> [TodoItem] {
        sorted {
            let leftPriority = Swift.min(3, Swift.max(1, $0.priority))
            let rightPriority = Swift.min(3, Swift.max(1, $1.priority))
            if leftPriority != rightPriority { return leftPriority < rightPriority }
            let leftTime = $0.timeBlockStart ?? Double.greatestFiniteMagnitude
            let rightTime = $1.timeBlockStart ?? Double.greatestFiniteMagnitude
            if leftTime != rightTime { return leftTime < rightTime }
            let leftDueDate = $0.dueDate ?? Double.greatestFiniteMagnitude
            let rightDueDate = $1.dueDate ?? Double.greatestFiniteMagnitude
            if leftDueDate != rightDueDate { return leftDueDate < rightDueDate }
            return $0.createdAt > $1.createdAt
        }
    }
}
