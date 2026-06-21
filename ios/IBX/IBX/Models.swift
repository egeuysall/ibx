import Foundation
import SwiftUI

enum TaskFilter: String, CaseIterable, Identifiable {
    case zen
    case today
    case upcoming
    case archive

    var id: String { rawValue }

    var title: String {
        switch self {
        case .zen: "Zen"
        case .today: "Today"
        case .upcoming: "Upcoming"
        case .archive: "Archive"
        }
    }

    var symbol: String {
        switch self {
        case .zen: "checkmark.circle"
        case .today: "star.fill"
        case .upcoming: "calendar"
        case .archive: "archivebox"
        }
    }

    var tint: Color {
        switch self {
        case .zen: .blue
        case .today: .yellow
        case .upcoming: .pink
        case .archive: .green
        }
    }
}

enum ThemePreference: String, CaseIterable, Identifiable {
    case system
    case light
    case dark

    var id: String { rawValue }

    var title: String {
        switch self {
        case .system: "System"
        case .light: "Light"
        case .dark: "Dark"
        }
    }

    var colorScheme: ColorScheme? {
        switch self {
        case .system: nil
        case .light: .light
        case .dark: .dark
        }
    }
}

enum TodoStatus: String, Codable {
    case open
    case done
}

enum TodoRecurrence: String, Codable, CaseIterable {
    case none
    case daily
    case weekly
    case monthly
}

enum TodoSource: String, Codable {
    case ai
    case manual
}

struct TodoItem: Identifiable, Codable, Hashable {
    let id: String
    let thoughtId: String
    var title: String
    var notes: String?
    var status: TodoStatus
    var dueDate: Double?
    var estimatedHours: Double?
    var timeBlockStart: Double?
    var priority: Int
    var recurrence: TodoRecurrence
    var source: TodoSource
    let createdAt: Double
}

struct TodoSection: Identifiable {
    let id: String
    let title: String
    let todos: [TodoItem]
}

extension TodoItem {
    var dueDateKey: String? {
        guard let dueDate else { return nil }
        return Self.utcDateKey(fromMilliseconds: dueDate)
    }

    var dueDay: Date? {
        guard let dueDateKey else { return nil }
        return Self.localNoon(forDateKey: dueDateKey)
    }

    var timeBlock: Date? {
        guard let timeBlockStart else { return nil }
        return Date(timeIntervalSince1970: timeBlockStart / 1000)
    }

    var sourceLabel: String {
        source == .ai ? "ai" : "manual"
    }

    var priorityLabel: String {
        "p\(Self.normalizedPriority(priority))"
    }

    var recurrenceLabel: String {
        recurrence == .none ? "once" : recurrence.rawValue
    }

    var estimatedHoursLabel: String {
        guard let estimatedHours, estimatedHours > 0 else { return "hours: unsized" }
        return "hours: \(Self.formatHours(estimatedHours))"
    }

    var timeBlockLabel: String {
        guard let timeBlock else { return "block: unscheduled" }
        let end = timeBlock.addingTimeInterval((estimatedHours ?? 1) * 60 * 60)
        return "block: \(timeBlock.formatted(date: .omitted, time: .shortened).lowercased()) - \(end.formatted(date: .omitted, time: .shortened).lowercased())"
    }

    var metadataLine: String {
        var parts = [priorityLabel, estimatedHoursLabel, dueLabel, recurrenceLabel]
        if timeBlockStart != nil {
            parts.append(timeBlockLabel)
        }
        return parts.joined(separator: " / ")
    }

    var dueLabel: String {
        guard let dueDateKey else { return "due: no date" }
        return "due: \(dueDateKey)"
    }

    static func normalizedPriority(_ priority: Int) -> Int {
        if priority == 1 || priority == 3 { return priority }
        return 2
    }

    static func utcDateKey(fromMilliseconds milliseconds: Double) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: Date(timeIntervalSince1970: milliseconds / 1000))
    }

    static func localNoon(forDateKey dateKey: String) -> Date? {
        let parts = dateKey.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        return Calendar.current.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2], hour: 12))
    }

    static func formatHours(_ hours: Double) -> String {
        let totalMinutes = Int((hours * 60).rounded())
        let wholeHours = totalMinutes / 60
        let minutes = totalMinutes % 60
        if wholeHours > 0 && minutes > 0 { return "\(wholeHours)h \(minutes)m" }
        if wholeHours > 0 { return "\(wholeHours)h" }
        return "\(minutes)m"
    }
}

struct SessionResponse: Decodable {
    let authenticated: Bool
}

struct TodosResponse: Decodable {
    let todos: [TodoItem]
}

struct GenerateResponse: Decodable {
    let ok: Bool
    let created: Int
    let updated: Int?
    let deleted: Int?
    let message: String?
}

struct CreateTodoResponse: Decodable {
    let ok: Bool
    let id: String
    let thoughtId: String
}

struct OkResponse: Decodable {
    let ok: Bool
}

struct APIErrorResponse: Decodable {
    let error: String?
}

extension Date {
    var millisecondsSince1970: Double { timeIntervalSince1970 * 1000 }
}
