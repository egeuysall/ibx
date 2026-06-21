import SwiftUI
import UIKit

struct CommandBar: View {
    @Bindable var store: TaskStore

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "chevron.right")
                .foregroundStyle(.secondary)
            TextField(
                "",
                text: $store.commandText,
                prompt: Text("type once, ibx can create, update, schedule").foregroundStyle(Color(.secondaryLabel)),
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
            .accessibilityLabel("Run ibx")
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
                        .font(.body)
                        .textInputAutocapitalization(.never)

                    TextField("Notes", text: $notes, axis: .vertical)
                        .font(.subheadline)
                        .textInputAutocapitalization(.never)
                        .lineLimit(2...8)

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

                    HStack {
                        Button("Save") {
                            update(
                                title.trimmingCharacters(in: .whitespacesAndNewlines),
                                notes.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : notes.trimmingCharacters(in: .whitespacesAndNewlines),
                                hasDate ? selectedDate : nil,
                                hasEstimatedHours ? estimatedHours : nil,
                                hasTimeBlock ? Self.combinedDate(date: hasDate ? selectedDate : timeBlockStart, time: timeBlockStart) : nil,
                                recurrence,
                                priority
                            )
                            withAnimation(.snappy(duration: 0.18)) { isExpanded = false }
                        }
                        .buttonStyle(.borderedProminent)
                        .disabled(title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)

                        Button("Delete", role: .destructive) {
                            isConfirmingDelete = true
                        }
                    }
                }
                .padding(.leading, 46)
                .padding(.trailing, 12)
                .padding(.bottom, 14)
            }
        }
        .animation(.smooth(duration: 0.2), value: todo.status)
        .confirmationDialog("Delete todo?", isPresented: $isConfirmingDelete, titleVisibility: .visible) {
            Button("Delete", role: .destructive, action: delete)
            Button("Cancel", role: .cancel) {}
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

struct ZenView: View {
    @Bindable var store: TaskStore

    var body: some View {
        VStack(spacing: 18) {
            if let todo = store.filteredTodos.first {
                Text("zen")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Button {
                    Task { await store.toggle(todo) }
                } label: {
                    ZStack {
                        Circle()
                            .stroke(.blue.opacity(0.2), lineWidth: 16)
                            .frame(width: 132, height: 132)
                        Circle()
                            .trim(from: 0, to: 0.78)
                            .stroke(.blue, style: StrokeStyle(lineWidth: 16, lineCap: .round))
                            .rotationEffect(.degrees(-90))
                            .frame(width: 132, height: 132)
                        Image(systemName: "checkmark")
                            .font(.system(size: 42, weight: .semibold))
                    }
                }
                .buttonStyle(.plain)
                Text(todo.title)
                    .font(.title2.weight(.semibold))
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 30)
                Text(todo.notes ?? "One task. Finish it, then move on.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 30)
            } else {
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 72))
                    .foregroundStyle(.blue)
                Text("All Done")
                    .font(.title2.weight(.semibold))
                Text("No open tasks are ready.")
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
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
            Text(isAuthenticated ? "No \(filter.title.lowercased()) tasks" : "Connect ibx")
                .font(.headline)
            Text(isAuthenticated ? "Use the command bar to add or generate tasks." : "Sign in with Clerk to load live tasks.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding(.horizontal, 24)
    }
}

struct StatusToast: View {
    let message: String?
    let isError: Bool

    var body: some View {
        if let message, !message.isEmpty {
            Text(message)
                .font(.footnote.weight(.semibold))
                .padding(.horizontal, 14)
                .padding(.vertical, 9)
                .background(isError ? Color.red.opacity(0.94) : Color.white, in: Capsule())
                .foregroundStyle(isError ? Color.white : Color.black)
                .overlay {
                    Capsule()
                        .stroke(isError ? Color.clear : Color.black.opacity(0.12), lineWidth: 1)
                }
                .shadow(color: Color.black.opacity(0.25), radius: 12, y: 4)
                .transition(.move(edge: .bottom).combined(with: .opacity))
        }
    }
}
