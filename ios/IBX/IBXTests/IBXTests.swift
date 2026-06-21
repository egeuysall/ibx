import XCTest
@testable import IBX

final class IBXTests: XCTestCase {
    func testDateKeyUsesISOCalendarDate() {
        let components = DateComponents(calendar: .current, timeZone: .current, year: 2026, month: 6, day: 21, hour: 12)
        let date = components.date!

        XCTAssertEqual(TaskStore.dateKey(date), "2026-06-21")
    }

    func testDecodesTodoPayload() throws {
        let json = """
        {
          "todos": [{
            "id": "1",
            "thoughtId": "t1",
            "title": "ship ios app",
            "notes": null,
            "status": "open",
            "dueDate": null,
            "estimatedHours": 1,
            "timeBlockStart": null,
            "priority": 1,
            "recurrence": "none",
            "source": "manual",
            "createdAt": 1760000000000
          }]
        }
        """.data(using: .utf8)!

        let decoded = try JSONDecoder().decode(TodosResponse.self, from: json)
        XCTAssertEqual(decoded.todos.first?.title, "ship ios app")
        XCTAssertEqual(decoded.todos.first?.priority, 1)
    }

    func testDueDateKeyUsesUTCLikeWebApp() {
        let chicagoEvening = 1782000000000.0
        XCTAssertEqual(TodoItem.utcDateKey(fromMilliseconds: chicagoEvening), "2026-06-21")
    }

    func testMetadataLineIncludesTimedTaskFields() {
        let todo = TodoItem(
            id: "1",
            thoughtId: "t1",
            title: "timed task",
            notes: nil,
            status: .open,
            dueDate: 1782000000000,
            estimatedHours: 1.5,
            timeBlockStart: 1782001800000,
            priority: 1,
            recurrence: .weekly,
            source: .manual,
            createdAt: 1760000000000
        )

        XCTAssertTrue(todo.metadataLine.contains("p1"))
        XCTAssertTrue(todo.metadataLine.contains("hours: 1h 30m"))
        XCTAssertTrue(todo.metadataLine.contains("due: 2026-06-21"))
        XCTAssertTrue(todo.metadataLine.contains("weekly"))
        XCTAssertTrue(todo.metadataLine.contains("block:"))
    }

    @MainActor
    func testUnauthenticatedStoreStartsWithoutMockTodos() {
        let store = TaskStore()
        store.isAuthenticated = false
        store.todos = []

        XCTAssertFalse(store.isAuthenticated)
        XCTAssertTrue(store.todos.isEmpty)
        XCTAssertTrue(store.notificationsEnabled)
    }

    func testOfflineShortcutTodoPersistsPendingCreate() async throws {
        let fileURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("ibx-offline-\(UUID().uuidString).json")
        let storage = OfflineTaskStorage(fileURL: fileURL)

        let todo = try await storage.addShortcutTodo(title: "offline capture")
        let snapshot = try await storage.loadSnapshot()

        XCTAssertEqual(snapshot.todos, [todo])
        XCTAssertEqual(snapshot.pendingOperations.count, 1)
        XCTAssertEqual(snapshot.pendingOperations.first?.kind, .create)
        XCTAssertEqual(snapshot.pendingOperations.first?.payload?.title, "offline capture")

        try? FileManager.default.removeItem(at: fileURL)
    }
}
