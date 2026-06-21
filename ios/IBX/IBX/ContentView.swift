import SwiftUI
import ClerkKit
import ClerkKitUI

struct ContentView: View {
    @Environment(Clerk.self) private var clerk
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @Environment(\.scenePhase) private var scenePhase
    @Bindable var store: TaskStore
    @State private var showingSettings = false
    @State private var showingAuth = false

    var body: some View {
        Group {
            if clerk.user == nil {
                SignedOutRootView(showingAuth: $showingAuth)
            } else if horizontalSizeClass == .compact {
                CompactRootView(store: store, showingSettings: $showingSettings)
            } else {
                NavigationSplitView {
                    SidebarView(store: store)
                        .navigationTitle("ibx")
                        .toolbar {
                            ToolbarItem(placement: .topBarTrailing) {
                                Button {
                                    showingSettings = true
                                } label: {
                                    Image(systemName: "slider.horizontal.3")
                                }
                                .accessibilityLabel("Settings")
                            }
                            ToolbarItem(placement: .topBarTrailing) {
                                UserButton()
                            }
                        }
                } detail: {
                    TaskListView(store: store)
                }
            }
        }
        .task {
            store.authTokenProvider = { [clerk] in
                try await clerk.auth.getToken()
            }
            await store.loadOfflineSnapshot()
            await store.setAuthenticationState(isAuthenticated: clerk.user != nil)
            await store.bootstrap()
        }
        .task(id: clerk.user?.id) {
            store.authTokenProvider = { [clerk] in
                try await clerk.auth.getToken()
            }
            await store.setAuthenticationState(isAuthenticated: clerk.user != nil)
        }
        .task(id: store.isAuthenticated) {
            guard store.isAuthenticated else { return }
            await store.autoRefreshLoop()
        }
        .onChange(of: scenePhase) {
            guard scenePhase == .active else { return }
            Task {
                await store.loadOfflineSnapshot()
                await store.refresh(showToast: false)
            }
        }
        .sheet(isPresented: $showingSettings) {
            SettingsView(store: store)
        }
        .sheet(isPresented: $showingAuth) {
            AuthView()
        }
        .prefetchClerkImages()
        .preferredColorScheme(store.themePreference.colorScheme)
    }
}

struct SignedOutRootView: View {
    @Binding var showingAuth: Bool

    var body: some View {
        VStack(spacing: 22) {
            Image(systemName: "checkmark.circle")
                .font(.system(size: 58, weight: .semibold))
                .foregroundStyle(.blue)
            VStack(spacing: 8) {
                Text("ibx")
                    .font(.largeTitle.weight(.semibold))
                Text("Sign in to sync your tasks, schedule, and generated todos.")
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 30)
            }
            Button {
                showingAuth = true
            } label: {
                Text("Sign in or create account")
                    .frame(maxWidth: 260)
            }
            .buttonStyle(.borderedProminent)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

struct CompactRootView: View {
    @Bindable var store: TaskStore
    @Binding var showingSettings: Bool

    var body: some View {
        NavigationStack {
            TaskListView(store: store)
                .toolbar {
                    ToolbarItem(placement: .topBarLeading) {
                        Menu {
                            ForEach(TaskFilter.allCases) { filter in
                                Button {
                                    store.selectedFilter = filter
                                } label: {
                                    Label(filter.title, systemImage: filter.symbol)
                                }
                            }
                        } label: {
                            Image(systemName: store.selectedFilter.symbol)
                                .symbolRenderingMode(.palette)
                                .foregroundStyle(store.selectedFilter.tint, .secondary)
                        }
                        .accessibilityLabel("Choose List")
                    }

                    ToolbarItem(placement: .topBarTrailing) {
                        HStack {
                            UserButton()
                            Button {
                                showingSettings = true
                            } label: {
                                Image(systemName: "slider.horizontal.3")
                            }
                            .accessibilityLabel("Settings")
                        }
                    }
                }
        }
    }
}

struct SidebarView: View {
    @Bindable var store: TaskStore

    var body: some View {
        List {
            Section {
                ForEach(TaskFilter.allCases) { filter in
                    Button {
                        store.selectedFilter = filter
                    } label: {
                        Label {
                            HStack {
                                Text(filter.title)
                                Spacer()
                                CountBadge(count: store.count(for: filter))
                            }
                        } icon: {
                            Image(systemName: filter.symbol)
                                .symbolRenderingMode(.palette)
                                .foregroundStyle(filter.tint, .secondary)
                        }
                    }
                    .foregroundStyle(.primary)
                    .listRowBackground(store.selectedFilter == filter ? Color.secondary.opacity(0.14) : Color.clear)
                }
            }
        }
        .listStyle(.sidebar)
        .safeAreaInset(edge: .bottom) {
            Button {
                store.commandText = ""
                store.selectedFilter = .today
            } label: {
                Label("New Task", systemImage: "plus")
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .buttonStyle(.plain)
            .padding()
        }
    }

}

struct TaskListView: View {
    @Bindable var store: TaskStore
    @FocusState private var commandFocused: Bool

    var body: some View {
        VStack(spacing: 0) {
            CommandBar(store: store)
                .focused($commandFocused)
                .padding(.horizontal, 18)
                .padding(.top, 12)
                .padding(.bottom, 8)

            if store.selectedFilter == .zen {
                ZenView(store: store)
            } else {
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 20, pinnedViews: [.sectionHeaders]) {
                        ForEach(store.sections) { section in
                            Section {
                                VStack(spacing: 0) {
                                    ForEach(section.todos) { todo in
                                        TaskRow(todo: todo) {
                                            Task { await store.toggle(todo) }
                                        } update: { title, notes, dueDate, estimatedHours, timeBlockStart, recurrence, priority in
                                            Task {
                                                await store.update(
                                                    todo,
                                                    title: title,
                                                    notes: notes,
                                                    dueDate: dueDate,
                                                    estimatedHours: estimatedHours,
                                                    timeBlockStart: timeBlockStart,
                                                    recurrence: recurrence,
                                                    priority: priority
                                                )
                                            }
                                        } delete: {
                                            Task { await store.delete(todo) }
                                        }
                                        Divider().padding(.leading, 44)
                                    }
                                }
                                .background(.background)
                                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                            } header: {
                                SectionHeader(title: section.title, count: section.todos.count)
                            }
                        }

                        if store.filteredTodos.isEmpty {
                            EmptyListView(filter: store.selectedFilter, isAuthenticated: store.isAuthenticated)
                                .frame(maxWidth: .infinity)
                                .padding(.top, 80)
                        }
                    }
                    .padding(.horizontal, 18)
                    .padding(.bottom, 96)
                }
                .refreshable { await store.refresh() }
            }
        }
        .navigationTitle(store.selectedFilter.title)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    Task { await store.refresh() }
                } label: {
                    if store.isLoading {
                        ProgressView()
                    } else {
                        Image(systemName: "arrow.clockwise")
                    }
                }
                .accessibilityLabel("Refresh")
            }
        }
        .overlay(alignment: .bottom) {
            StatusToast(message: store.errorMessage ?? store.statusMessage, isError: store.errorMessage != nil)
                .padding(.bottom, 12)
                .animation(.smooth(duration: 0.2), value: store.errorMessage ?? store.statusMessage)
        }
    }
}
