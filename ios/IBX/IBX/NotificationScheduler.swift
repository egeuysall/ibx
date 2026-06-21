import Foundation
import UserNotifications

actor NotificationScheduler {
    private let center = UNUserNotificationCenter.current()
    private let identifierPrefix = "ibx-todo-"
    private let prestartSeconds: TimeInterval = 5 * 60

    func sync(todos: [TodoItem], enabled: Bool) async {
        let pending = await center.pendingNotificationRequests()
        let ibxIdentifiers = pending
            .map(\.identifier)
            .filter { $0.hasPrefix(identifierPrefix) }
        center.removePendingNotificationRequests(withIdentifiers: ibxIdentifiers)

        guard enabled else { return }
        guard await ensureAuthorization() else { return }

        let now = Date()
        let upcomingTimedTodos = todos
            .filter { $0.status == .open && $0.timeBlockStart != nil }
            .sortedForNotificationScheduling()
            .prefix(60)

        for todo in upcomingTimedTodos {
            guard let timeBlock = todo.timeBlock else { continue }
            let notificationDate = timeBlock.addingTimeInterval(-prestartSeconds)
            let fireDate = notificationDate > now ? notificationDate : timeBlock
            guard fireDate > now else { continue }

            let content = UNMutableNotificationContent()
            content.title = todo.title
            content.body = todo.timeBlockLabel
            content.sound = .default
            content.threadIdentifier = "ibx-tasks"

            let components = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: fireDate)
            let trigger = UNCalendarNotificationTrigger(dateMatching: components, repeats: false)
            let request = UNNotificationRequest(identifier: identifierPrefix + todo.id, content: content, trigger: trigger)
            try? await center.add(request)
        }
    }

    private func ensureAuthorization() async -> Bool {
        let settings = await center.notificationSettings()
        switch settings.authorizationStatus {
        case .authorized, .provisional, .ephemeral:
            return true
        case .denied:
            return false
        case .notDetermined:
            return (try? await center.requestAuthorization(options: [.alert, .badge, .sound])) ?? false
        @unknown default:
            return false
        }
    }
}

private extension Array where Element == TodoItem {
    func sortedForNotificationScheduling() -> [TodoItem] {
        sorted {
            ($0.timeBlockStart ?? .greatestFiniteMagnitude) < ($1.timeBlockStart ?? .greatestFiniteMagnitude)
        }
    }
}
