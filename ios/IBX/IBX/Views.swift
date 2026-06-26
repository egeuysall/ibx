import SwiftUI
import UIKit
import PhotosUI

struct CommandBar: View {
    @Bindable var store: TaskStore

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "chevron.right")
                .foregroundStyle(.secondary)
            TextField(
                "",
                text: $store.commandText,
                prompt: Text("new todo or ask ibx").foregroundStyle(Color(.secondaryLabel)),
                axis: .vertical
            )
                .textInputAutocapitalization(.never)
                .lineLimit(1...3)
                .submitLabel(.go)
                .onSubmit { Task { await store.runCommand() } }

            Button {
                Task { await store.addCommandAsTodo() }
            } label: {
                Image(systemName: "plus")
            }
            .accessibilityLabel("Add Todo")
            .disabled(store.commandText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || store.isLoading)

            Button {
                Task { await store.runCommand() }
            } label: {
                Image(systemName: "sparkles")
            }
            .accessibilityLabel("Generate with ibx")
            .buttonStyle(.borderedProminent)
            .disabled(store.commandText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || store.isLoading)
        }
        .padding(.horizontal, 13)
        .padding(.vertical, 10)
        .background(Color(.systemGray6), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(Color.secondary.opacity(0.18))
        }
    }
}

struct TaskRow: View {
    @Bindable var store: TaskStore
    let todo: TodoItem
    let toggle: () -> Void
    let update: (String, String?, Date?, Double?, Date?, TodoRecurrence, Int) -> Void
    let delete: () -> Void

    @State private var isExpanded = false
    @State private var title = ""
    @State private var notes = ""
    @State private var selectedDate = Date()
    @State private var hasDate = false
    @State private var estimatedHours = 0.0
    @State private var hasEstimatedHours = false
    @State private var timeBlockStart = Date()
    @State private var hasTimeBlock = false
    @State private var recurrence: TodoRecurrence = .none
    @State private var priority = 1
    @State private var isConfirmingDelete = false
    @State private var selectedPhotoItem: PhotosPickerItem?
    @State private var previewAttachment: AttachmentRecord?
    @State private var autosaveTask: Task<Void, Never>?
    @State private var autosaveState = "saved"
    @State private var hasSeededEditor = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button {
                withAnimation(.snappy(duration: 0.18)) {
                    isExpanded.toggle()
                    seedEditor()
                }
            } label: {
                HStack(alignment: .top, spacing: 12) {
                    Button(action: toggle) {
                        let isDone = todo.status == .done
                        ZStack {
                            Circle()
                                .stroke(isDone ? .blue : .secondary.opacity(0.45), lineWidth: 2)
                                .frame(width: 24, height: 24)
                                .background(Circle().fill(isDone ? Color.blue.opacity(0.14) : Color.clear))
                            if isDone {
                                Image(systemName: "checkmark")
                                    .font(.caption2.bold())
                                    .foregroundStyle(.blue)
                            }
                        }
                        .contentTransition(.symbolEffect(.replace))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(todo.status == .done ? "Mark open" : "Mark done")
                    .simultaneousGesture(TapGesture().onEnded {
                        UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    })

                    VStack(alignment: .leading, spacing: 4) {
                        if isExpanded {
                            Text("Editing task")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(.secondary)
                        } else {
                            Text(todo.title)
                                .font(.body)
                                .strikethrough(todo.status == .done)
                                .foregroundStyle(todo.status == .done ? .secondary : .primary)
                                .multilineTextAlignment(.leading)

                            Text(todo.metadataLine)
                                .font(.caption)
                                .foregroundStyle(Color(.secondaryLabel))
                                .lineLimit(2)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    Spacer(minLength: 8)
                    Image(systemName: "chevron.down")
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                        .rotationEffect(.degrees(isExpanded ? 180 : 0))
                }
                .contentShape(Rectangle())
                .padding(.vertical, 12)
                .padding(.horizontal, 12)
            }
            .buttonStyle(.plain)

            if isExpanded {
                VStack(alignment: .leading, spacing: 12) {
                    TextField("Title", text: $title, axis: .vertical)
                        .font(.title3.weight(.semibold))
                        .textInputAutocapitalization(.never)

                    MarkdownNotesEditor(text: $notes)

                    Toggle("Scheduled", isOn: $hasDate)
                    if hasDate {
                        DatePicker("Date", selection: $selectedDate, displayedComponents: .date)
                    }
                    Toggle("Estimated", isOn: $hasEstimatedHours)
                    if hasEstimatedHours {
                        Stepper(value: $estimatedHours, in: 0.25...24, step: 0.25) {
                            Text("Hours \(TodoItem.formatHours(estimatedHours))")
                        }
                    }
                    Toggle("Time block", isOn: $hasTimeBlock)
                    if hasTimeBlock {
                        DatePicker("Start", selection: $timeBlockStart, displayedComponents: [.date, .hourAndMinute])
                    }
                    Picker("Recurrence", selection: $recurrence) {
                        ForEach(TodoRecurrence.allCases, id: \.rawValue) { recurrence in
                            Text(recurrence == .none ? "Once" : recurrence.rawValue.capitalized).tag(recurrence)
                        }
                    }
                    .pickerStyle(.segmented)
                    Picker("Priority", selection: $priority) {
                        Text("p1").tag(1)
                        Text("p2").tag(2)
                        Text("p3").tag(3)
                    }
                    .pickerStyle(.segmented)

                    BriPublishingPanel(
                        todo: todo,
                        publication: store.publication(for: todo),
                        isPublishing: store.publishingTodoIds.contains(todo.id),
                        publish: { Task { await store.publishToBri(todo) } },
                        unpublish: { Task { await store.unpublishFromBri(todo) } }
                    )

                    AttachmentsPanel(
                        attachments: store.attachments(for: todo),
                        isUploading: store.uploadingAttachmentTodoIds.contains(todo.id),
                        url: { store.attachmentURL($0) },
                        preview: { previewAttachment = $0 },
                        delete: { attachment in
                            Task { await store.deleteAttachment(attachment) }
                        },
                        photoPicker: {
                            PhotosPicker(selection: $selectedPhotoItem, matching: .images) {
                                Label("Add image", systemImage: "photo.badge.plus")
                            }
                            .disabled(todo.id.hasPrefix("local-") || store.uploadingAttachmentTodoIds.contains(todo.id))
                        }
                    )

                    HStack {
                        Label(autosaveState, systemImage: autosaveState == "saving..." ? "arrow.triangle.2.circlepath" : "checkmark.circle")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Button("Delete", role: .destructive) {
                            isConfirmingDelete = true
                        }
                    }
                }
                .padding(.leading, 46)
                .padding(.trailing, 12)
                .padding(.bottom, 14)
                .task(id: isExpanded) {
                    guard isExpanded else { return }
                    await store.loadDetails(for: todo)
                }
                .onChange(of: selectedPhotoItem) {
                    guard let selectedPhotoItem else { return }
                    Task {
                        defer { self.selectedPhotoItem = nil }
                        guard let data = try? await selectedPhotoItem.loadTransferable(type: Data.self) else {
                            return
                        }
                        let contentType =
                            selectedPhotoItem.supportedContentTypes.first?.preferredMIMEType ?? "image/jpeg"
                        let fileExtension =
                            selectedPhotoItem.supportedContentTypes.first?.preferredFilenameExtension ?? "jpg"
                        await store.uploadAttachment(
                            for: todo,
                            fileName: "image.\(fileExtension)",
                            contentType: contentType,
                            data: data
                        )
                    }
                }
                .onChange(of: title) { scheduleAutosave() }
                .onChange(of: notes) { scheduleAutosave() }
                .onChange(of: selectedDate) { scheduleAutosave() }
                .onChange(of: hasDate) { scheduleAutosave() }
                .onChange(of: estimatedHours) { scheduleAutosave() }
                .onChange(of: hasEstimatedHours) { scheduleAutosave() }
                .onChange(of: timeBlockStart) { scheduleAutosave() }
                .onChange(of: hasTimeBlock) { scheduleAutosave() }
                .onChange(of: recurrence) { scheduleAutosave() }
                .onChange(of: priority) { scheduleAutosave() }
            }
        }
        .animation(.smooth(duration: 0.2), value: todo.status)
        .onDisappear {
            autosaveTask?.cancel()
        }
        .confirmationDialog("Delete todo?", isPresented: $isConfirmingDelete, titleVisibility: .visible) {
            Button("Delete", role: .destructive, action: delete)
            Button("Cancel", role: .cancel) {}
        }
        .sheet(item: $previewAttachment) { attachment in
            AttachmentPreviewSheet(attachment: attachment, url: store.attachmentURL(attachment))
        }
    }

    private func seedEditor() {
        title = todo.title
        notes = todo.notes ?? ""
        selectedDate = todo.dueDay ?? Date()
        hasDate = todo.dueDay != nil
        estimatedHours = todo.estimatedHours ?? 0.25
        hasEstimatedHours = todo.estimatedHours != nil
        timeBlockStart = Self.combinedDate(date: todo.dueDay ?? Date(), time: todo.timeBlock ?? Date())
        hasTimeBlock = todo.timeBlockStart != nil
        recurrence = todo.recurrence
        priority = TodoItem.normalizedPriority(todo.priority)
        autosaveState = "saved"
        hasSeededEditor = true
    }

    private func scheduleAutosave() {
        guard isExpanded, hasSeededEditor else { return }
        let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedTitle.isEmpty else {
            autosaveState = "title required"
            return
        }

        autosaveState = "saving..."
        autosaveTask?.cancel()
        autosaveTask = Task {
            try? await Task.sleep(for: .milliseconds(700))
            guard !Task.isCancelled else { return }
            await MainActor.run {
                update(
                    trimmedTitle,
                    notes.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : notes.trimmingCharacters(in: .whitespacesAndNewlines),
                    hasDate ? selectedDate : nil,
                    hasEstimatedHours ? estimatedHours : nil,
                    hasTimeBlock ? Self.combinedDate(date: hasDate ? selectedDate : timeBlockStart, time: timeBlockStart) : nil,
                    recurrence,
                    priority
                )
                autosaveState = "saved"
            }
        }
    }

    private static func combinedDate(date: Date, time: Date) -> Date {
        let calendar = Calendar.current
        let dateParts = calendar.dateComponents([.year, .month, .day], from: date)
        let timeParts = calendar.dateComponents([.hour, .minute], from: time)
        return calendar.date(from: DateComponents(
            year: dateParts.year,
            month: dateParts.month,
            day: dateParts.day,
            hour: timeParts.hour,
            minute: timeParts.minute
        )) ?? time
    }
}

struct MarkdownNotesEditor: View {
    @Binding var text: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                markdownButton("H", prefix: "## ")
                markdownButton("B", wrapper: "**")
                markdownButton("•", prefix: "- ")
                markdownButton("[]", prefix: "- [ ] ")
                markdownButton("`", wrapper: "`")
                markdownButton(">", prefix: "> ")
                markdownButton("link", snippet: "[text](https://)")
                markdownButton("img", snippet: "![image](https://)")
                markdownButton("tbl", snippet: "| Item | Amount |\n| --- | --- |\n|  |  |")
                Spacer()
            }
            .font(.caption.weight(.semibold))
            .foregroundStyle(.secondary)

            TextEditor(text: $text)
                .font(.system(.body, design: .monospaced))
                .textInputAutocapitalization(.sentences)
                .scrollContentBackground(.hidden)
                .frame(height: 170)
                .padding(10)
                .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay(alignment: .topLeading) {
                    if text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        Text("Notes in Markdown")
                            .font(.body)
                            .foregroundStyle(.tertiary)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 18)
                            .allowsHitTesting(false)
                    }
                }
        }
    }

    private func markdownButton(_ title: String, prefix: String? = nil, wrapper: String? = nil, snippet: String? = nil) -> some View {
        Button {
            if let prefix {
                insert(prefix: prefix)
            } else if let wrapper {
                wrap(wrapper)
            } else if let snippet {
                insert(snippet: snippet)
            }
        } label: {
            Text(title)
                .frame(minWidth: 28, minHeight: 28)
                .background(Color(.tertiarySystemFill), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    private func insert(prefix: String) {
        if text.isEmpty {
            text = prefix
        } else if text.hasSuffix("\n") {
            text += prefix
        } else {
            text += "\n\(prefix)"
        }
    }

    private func insert(snippet: String) {
        if text.isEmpty {
            text = snippet
        } else if text.hasSuffix("\n") {
            text += snippet
        } else {
            text += "\n\(snippet)"
        }
    }

    private func wrap(_ token: String) {
        if text.isEmpty {
            text = "\(token)\(token)"
        } else {
            text = "\(token)\(text)\(token)"
        }
    }
}

struct BriPublishingPanel: View {
    let todo: TodoItem
    let publication: PublicationRecord?
    let isPublishing: Bool
    let publish: () -> Void
    let unpublish: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Bri")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)

            HStack(spacing: 10) {
                Image(systemName: publication == nil ? "paperplane" : "checkmark.seal.fill")
                    .foregroundStyle(publication == nil ? Color.secondary : Color.green)

                VStack(alignment: .leading, spacing: 2) {
                    Text(publication == nil ? "Not published" : "Published")
                        .font(.subheadline.weight(.semibold))
                    if let publication {
                        Text(publication.url)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    } else {
                        Text(todo.id.hasPrefix("local-") ? "Sync before publishing" : "Publish this todo as a Bri note")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }

                Spacer()

                if isPublishing {
                    ProgressView()
                } else if publication == nil {
                    Button("Publish", action: publish)
                        .buttonStyle(.borderedProminent)
                        .disabled(todo.id.hasPrefix("local-"))
                } else {
                    Menu {
                        if let url = URL(string: publication?.url ?? "") {
                            Link("Open Bri", destination: url)
                        }
                        Button("Update Bri", action: publish)
                        Button("Unpublish", role: .destructive, action: unpublish)
                    } label: {
                        Image(systemName: "ellipsis.circle")
                    }
                }
            }
            .padding(12)
            .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
    }
}

struct AttachmentsPanel<PickerContent: View>: View {
    let attachments: [AttachmentRecord]
    let isUploading: Bool
    let url: (AttachmentRecord) -> URL
    let preview: (AttachmentRecord) -> Void
    let delete: (AttachmentRecord) -> Void
    @ViewBuilder let photoPicker: () -> PickerContent

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Attachments")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                Spacer()
                if isUploading {
                    ProgressView()
                } else {
                    photoPicker()
                        .font(.caption.weight(.semibold))
                }
            }

            if attachments.isEmpty {
                Text("No attachments")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(12)
                    .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            } else {
                VStack(spacing: 8) {
                    ForEach(attachments) { attachment in
                        AttachmentRow(
                            attachment: attachment,
                            url: url(attachment),
                            preview: { preview(attachment) },
                            delete: { delete(attachment) }
                        )
                    }
                }
            }
        }
    }
}

struct AttachmentRow: View {
    let attachment: AttachmentRecord
    let url: URL
    let preview: () -> Void
    let delete: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            Button(action: preview) {
                ZStack {
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .fill(Color(.tertiarySystemFill))
                    if attachment.isImage {
                        AsyncImage(url: url) { image in
                            image.resizable().scaledToFill()
                        } placeholder: {
                            Image(systemName: "photo")
                                .foregroundStyle(.secondary)
                        }
                    } else {
                        Image(systemName: "doc")
                            .foregroundStyle(.secondary)
                    }
                }
                .frame(width: 44, height: 44)
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            }
            .buttonStyle(.plain)

            VStack(alignment: .leading, spacing: 2) {
                Text(attachment.fileName)
                    .font(.subheadline.weight(.medium))
                    .lineLimit(1)
                Text(attachment.fileLabel)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            Menu {
                Link("Open", destination: url)
                Button("Preview", action: preview)
                Button("Delete", role: .destructive, action: delete)
            } label: {
                Image(systemName: "ellipsis.circle")
            }
        }
        .padding(10)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}

struct AttachmentPreviewSheet: View {
    @Environment(\.dismiss) private var dismiss
    let attachment: AttachmentRecord
    let url: URL

    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                if attachment.isImage {
                    AsyncImage(url: url) { image in
                        image
                            .resizable()
                            .scaledToFit()
                    } placeholder: {
                        ProgressView()
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    Image(systemName: "doc")
                        .font(.system(size: 56))
                        .foregroundStyle(.secondary)
                    Link("Open Attachment", destination: url)
                }
            }
            .padding()
            .navigationTitle(attachment.fileName)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }
}

struct SettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @Bindable var store: TaskStore

    var body: some View {
        NavigationStack {
            Form {
                Section("Account") {
                    Text("Authentication is handled by Clerk. API keys remain available for the CLI and other integrations from web settings.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    LabeledContent("Sync", value: store.isAuthenticated ? "Signed in" : "Offline")
                    LabeledContent("Open tasks", value: "\(store.todos.filter { $0.status == .open }.count)")
                    LabeledContent("Archived", value: "\(store.todos.filter { $0.status == .done }.count)")
                }
                Section("Bri") {
                    Text("Publishing uses the Bri connection configured in web Settings. Published todos can be updated or unpublished from each expanded todo.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    LabeledContent("Published todos", value: "\(store.publicationsByTodoId.count)")
                    Text("Attachments and Bri controls live inside each expanded task.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Section("Startup") {
                    Picker("Default list", selection: $store.defaultFilter) {
                        ForEach(TaskFilter.allCases) { filter in
                            Text(filter.title).tag(filter)
                        }
                    }
                    .onChange(of: store.defaultFilter) {
                        store.saveDefaultFilterPreference()
                    }

                    Toggle("Auto refresh", isOn: $store.autoRefreshEnabled)
                        .onChange(of: store.autoRefreshEnabled) {
                            store.saveAutoRefreshPreference()
                        }
                    Text("ibx refreshes signed-in tasks every 15 seconds when auto refresh is enabled.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Section("Appearance") {
                    Picker("Theme", selection: $store.themePreference) {
                        ForEach(ThemePreference.allCases) { preference in
                            Text(preference.title).tag(preference)
                        }
                    }
                    .pickerStyle(.segmented)
                    .onChange(of: store.themePreference) {
                        store.saveThemePreference()
                    }
                }
                Section("Notifications") {
                    Toggle("Task time alerts", isOn: $store.notificationsEnabled)
                        .onChange(of: store.notificationsEnabled) {
                            Task { await store.saveNotificationPreference() }
                        }
                    Text("ibx schedules local alerts five minutes before open tasks with a time block.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Section("Offline") {
                    LabeledContent("Queued changes", value: "\(store.pendingOfflineCount)")
                    Text("Shortcuts and in-app edits save locally first. Queued changes sync when Clerk is signed in and the network is available.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Section("Editor") {
                    LabeledContent("Markdown", value: "headings, lists, tasks, links, images, tables")
                    Text("Long notes scroll inside the editor so schedule, priority, attachments, and Bri controls stay reachable.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Section("Drag and Drop") {
                    Text("Long-press a task and drop it on another task or priority section to move its day and priority.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                if let errorMessage = store.errorMessage {
                    Section("Last Error") {
                        Text(errorMessage)
                            .font(.caption)
                            .foregroundStyle(.red)
                        Button("Clear") {
                            store.clearError()
                        }
                    }
                }
                Section {
                    Button(store.isSavingSettings ? "Syncing..." : "Sync Now") {
                        Task {
                            await store.saveSettings()
                            if store.errorMessage == nil { dismiss() }
                        }
                    }
                }
            }
            .navigationTitle("Settings")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }
}

struct SectionHeader: View {
    let title: String
    let count: Int

    var body: some View {
        HStack {
            Text(title)
                .font(.headline)
            Spacer()
            Text("\(count)")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(.top, 8)
        .padding(.bottom, 6)
        .background(.background)
    }
}

struct CountBadge: View {
    let count: Int

    var body: some View {
        if count > 0 {
            Text("\(count)")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
        }
    }
}

struct EmptyListView: View {
    let filter: TaskFilter
    let isAuthenticated: Bool

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: filter.symbol)
                .font(.largeTitle)
                .foregroundStyle(filter.tint)
            Text("No \(filter.title.lowercased()) tasks")
                .font(.headline)
            Text(isAuthenticated ? "Use the command bar to add or generate tasks." : "Add tasks offline now. Sign in to sync when ready.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding(.horizontal, 24)
    }
}
