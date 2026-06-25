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

    func getPublication(sourceKind: String = "todo", sourceId: String) async throws -> PublicationRecord? {
        let query = "sourceKind=\(sourceKind.urlQueryEncoded)&sourceId=\(sourceId.urlQueryEncoded)"
        let response: PublicationResponse = try await request("/api/publications/bri?\(query)")
        return response.publication
    }

    func publishToBri(todo: TodoItem, visibility: String = "public") async throws -> PublicationRecord {
        let response: PublishResponse = try await request("/api/publications/bri", method: "POST", body: [
            "sourceKind": "todo",
            "sourceId": .string(todo.id),
            "title": .string(todo.title),
            "notes": todo.notes.map(EncodableValue.string) ?? .null,
            "visibility": .string(visibility),
        ])
        return response.publication
    }

    func unpublishFromBri(sourceKind: String = "todo", sourceId: String) async throws {
        let query = "sourceKind=\(sourceKind.urlQueryEncoded)&sourceId=\(sourceId.urlQueryEncoded)"
        let _: OkResponse = try await request("/api/publications/bri?\(query)", method: "DELETE")
    }

    func listAttachments(parentKind: String = "todo", parentId: String) async throws -> [AttachmentRecord] {
        let query = "parentKind=\(parentKind.urlQueryEncoded)&parentId=\(parentId.urlQueryEncoded)"
        let response: AttachmentsResponse = try await request("/api/attachments?\(query)")
        return response.attachments
    }

    func attachmentFileURL(_ attachment: AttachmentRecord) -> URL {
        URL(string: "/api/attachments/\(attachment.id.urlPathEncoded)/file", relativeTo: baseURL)!
    }

    func deleteAttachment(_ attachmentId: String) async throws {
        let _: OkResponse = try await request("/api/attachments/\(attachmentId.urlPathEncoded)", method: "DELETE")
    }

    func uploadAttachment(
        parentKind: String = "todo",
        parentId: String,
        fileName: String,
        contentType: String,
        data: Data
    ) async throws -> String {
        let uploadConfig: AttachmentUploadUrlResponse = try await request(
            "/api/attachments/upload-url",
            method: "POST",
            body: [:]
        )
        if Double(data.count) > uploadConfig.limits.maxBytes {
            throw IBXClientError.server(status: 400, message: "Attachment file is too large.")
        }

        let uploadURL = URL(string: uploadConfig.uploadUrl)!
        var uploadRequest = URLRequest(url: uploadURL)
        uploadRequest.httpMethod = "POST"
        uploadRequest.timeoutInterval = 30
        uploadRequest.setValue(contentType, forHTTPHeaderField: "Content-Type")
        uploadRequest.httpBody = data

        let (uploadData, uploadResponse) = try await URLSession.shared.data(for: uploadRequest)
        guard let httpResponse = uploadResponse as? HTTPURLResponse else {
            throw IBXClientError.invalidResponse
        }
        guard (200..<300).contains(httpResponse.statusCode),
              let storage = try? JSONDecoder().decode(ConvexStorageUploadResponse.self, from: uploadData) else {
            throw IBXClientError.server(status: httpResponse.statusCode, message: "Attachment upload failed.")
        }

        let created: AttachmentCreateResponse = try await request("/api/attachments", method: "POST", body: [
            "parentKind": .string(parentKind),
            "parentId": .string(parentId),
            "storageId": .string(storage.storageId),
            "fileName": .string(fileName),
            "contentType": .string(contentType),
            "size": .double(Double(data.count)),
        ])
        return created.id
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

private extension String {
    var urlQueryEncoded: String {
        addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? self
    }

    var urlPathEncoded: String {
        addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? self
    }
}

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
