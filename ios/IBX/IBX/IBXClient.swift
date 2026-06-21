import Foundation

struct IBXClient: Sendable {
    var baseURL: URL
    var authTokenProvider: (@Sendable () async throws -> String?)?
    var urlSession: URLSessionProtocol = URLSession.shared

    func session() async throws -> SessionResponse {
        try await request("/api/session")
    }

    func listTodos(today: String = Date.ibxDateKey) async throws -> [TodoItem] {
        let response: TodosResponse = try await request("/api/todos?today=\(today)")
        return response.todos
    }

    func createTodo(title: String, payload: OfflineTodoPatch? = nil) async throws -> CreateTodoResponse {
        var body = payload?.requestBody ?? [:]
        body["title"] = .string(title)
        if body["priority"] == nil {
            body["priority"] = .int(1)
        }
        return try await request("/api/todos", method: "POST", body: body)
    }

    func generateTodos(from text: String, today: String = Date.ibxDateKey) async throws -> GenerateResponse {
        try await request("/api/todos/generate", method: "POST", body: ["text": .string(text), "today": .string(today)])
    }

    func updateTodo(_ id: String, payload: [String: EncodableValue]) async throws {
        let _: OkResponse = try await request("/api/todos/\(id)", method: "PATCH", body: payload)
    }

    func deleteTodo(_ id: String) async throws {
        let _: OkResponse = try await request("/api/todos/\(id)", method: "DELETE")
    }

    private func request<Response: Decodable>(_ path: String, method: String = "GET", body: [String: EncodableValue]? = nil) async throws -> Response {
        let url = URL(string: path, relativeTo: baseURL)!
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = 15
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let token = try await authTokenProvider?(), !token.isEmpty {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let body {
            request.httpBody = try JSONEncoder().encode(body)
        }

        let (data, response) = try await urlSession.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw IBXClientError.invalidResponse
        }
        guard (200..<300).contains(httpResponse.statusCode) else {
            let apiError = try? JSONDecoder().decode(APIErrorResponse.self, from: data)
            throw IBXClientError.server(status: httpResponse.statusCode, message: apiError?.error ?? "Request failed.")
        }
        return try JSONDecoder().decode(Response.self, from: data)
    }
}

enum IBXClientError: LocalizedError, Equatable {
    case invalidResponse
    case server(status: Int, message: String)

    var errorDescription: String? {
        switch self {
        case .invalidResponse:
            "The server returned an invalid response."
        case .server(_, let message):
            message
        }
    }
}

enum EncodableValue: Encodable, ExpressibleByStringLiteral, ExpressibleByIntegerLiteral, ExpressibleByFloatLiteral, ExpressibleByBooleanLiteral, ExpressibleByNilLiteral {
    case string(String)
    case int(Int)
    case double(Double)
    case bool(Bool)
    case null

    init(stringLiteral value: String) { self = .string(value) }
    init(integerLiteral value: Int) { self = .int(value) }
    init(floatLiteral value: Double) { self = .double(value) }
    init(booleanLiteral value: Bool) { self = .bool(value) }
    init(nilLiteral: ()) { self = .null }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .string(let value): try container.encode(value)
        case .int(let value): try container.encode(value)
        case .double(let value): try container.encode(value)
        case .bool(let value): try container.encode(value)
        case .null: try container.encodeNil()
        }
    }
}

protocol URLSessionProtocol: Sendable {
    func data(for request: URLRequest) async throws -> (Data, URLResponse)
}

extension URLSession: URLSessionProtocol {}

extension Date {
    static var ibxDateKey: String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = .current
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: Date())
    }
}
