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
        let isSignedIn = clerk.user != nil

        Group {
            if horizontalSizeClass == .compact {
                CompactRootView(
                    store: store,
                    showingSettings: $showingSettings,
                    showingAuth: $showingAuth,
                    isSignedIn: isSignedIn
                )
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
                                AccountToolbarButton(
                                    showingAuth: $showingAuth,
                                    isSignedIn: isSignedIn
                                )
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
    @Binding var showingAuth: Bool
    let isSignedIn: Bool

    var body: some View {
        NavigationStack {
            TaskListView(store: store) {
                HeaderActionCapsule {
                    AccountToolbarButton(
                        showingAuth: $showingAuth,
                        isSignedIn: isSignedIn
                    )
                    Button {
                        showingSettings = true
                    } label: {
                        Image(systemName: "slider.horizontal.3")
                    }
                    .buttonStyle(.plain)
                    .font(.system(size: 22, weight: .regular))
                    .foregroundStyle(.primary)
                    .accessibilityLabel("Settings")

                    Button {
                        Task { await store.refresh() }
                    } label: {
                        if store.isLoading {
                            ProgressView()
                        } else {
                            Image(systemName: "arrow.clockwise")
                        }
                    }
                    .buttonStyle(.plain)
                    .font(.system(size: 20, weight: .regular))
                    .foregroundStyle(.primary)
                    .accessibilityLabel("Refresh")
                }
            }
            .toolbar(.hidden, for: .navigationBar)
        }
    }
}

struct HeaderActionCapsule<Content: View>: View {
    @ViewBuilder let content: () -> Content

    var body: some View {
        HStack(spacing: 18) {
            content()
        }
        .frame(height: 44)
        .padding(.horizontal, 8)
        .background(Color(.secondarySystemGroupedBackground).opacity(0.72), in: Capsule())
        .overlay {
            Capsule()
                .stroke(Color.secondary.opacity(0.14), lineWidth: 1)
        }
        .tint(.primary)
        .controlSize(.small)
    }
}

struct AccountToolbarButton: View {
    @Binding var showingAuth: Bool
    let isSignedIn: Bool

    var body: some View {
        if isSignedIn {
            UserButton()
                .frame(width: 36, height: 36)
        } else {
            Button {
                showingAuth = true
            } label: {
                Image(systemName: "person.crop.circle")
            }
            .buttonStyle(.plain)
            .font(.system(size: 30, weight: .regular))
            .accessibilityLabel("Sign in")
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

struct TaskListView<HeaderActions: View>: View {
    @Bindable var store: TaskStore
    @ViewBuilder let headerActions: () -> HeaderActions
    @FocusState private var commandFocused: Bool
    @FocusState private var searchFocused: Bool
    @State private var searchVisible = false

    init(store: TaskStore, @ViewBuilder headerActions: @escaping () -> HeaderActions = { EmptyView() }) {
        self.store = store
        self.headerActions = headerActions
    }

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 14, pinnedViews: [.sectionHeaders]) {
                    VStack(alignment: .leading, spacing: 8) {
                        HStack(alignment: .center, spacing: 10) {
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
                                    .font(.headline)
                                    .symbolRenderingMode(.palette)
                                    .foregroundStyle(store.selectedFilter.tint, .secondary)
                                    .frame(width: 28, height: 28)
                                    .background(Color(.secondarySystemGroupedBackground), in: Circle())
                            }
                            .accessibilityLabel("Choose List")

                            Text(store.selectedFilter.title)
                                .font(.title3.weight(.semibold))
                                .lineLimit(1)

                            Spacer()

                            CountBadge(count: store.filteredTodos.count)
                            Button {
                                withAnimation(.smooth(duration: 0.18)) {
                                    searchVisible.toggle()
                                }
                                if searchVisible {
                                    searchFocused = true
                                } else {
                                    store.searchQuery = ""
                                    searchFocused = false
                                }
                            } label: {
                                Image(systemName: "magnifyingglass")
                                    .frame(width: 32, height: 32)
                                    .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .font(.system(size: 19, weight: .regular))
                            .foregroundStyle(searchVisible ? .primary : .secondary)
                            .accessibilityLabel(searchVisible ? "Close Search" : "Search")

                            headerActions()
                        }

                        if searchVisible {
                            HStack(spacing: 8) {
                                Image(systemName: "magnifyingglass")
                                    .foregroundStyle(.secondary)
                                TextField("search tasks", text: $store.searchQuery)
                                    .textInputAutocapitalization(.never)
                                    .disableAutocorrection(true)
                                    .focused($searchFocused)
                                if !store.searchQuery.isEmpty {
                                    Button {
                                        store.searchQuery = ""
                                    } label: {
                                        Image(systemName: "xmark.circle.fill")
                                            .foregroundStyle(.secondary)
                                    }
                                    .buttonStyle(.plain)
                                    .accessibilityLabel("Clear Search")
                                }
                            }
                            .font(.body)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 10)
                            .background(Color(.secondarySystemGroupedBackground), in: Capsule())
                            .transition(.opacity)
                        }

                        CommandBar(store: store)
                            .focused($commandFocused)
                    }

                    ForEach(store.sections) { section in
                        Section {
                            VStack(spacing: 0) {
                                ForEach(section.todos) { todo in
                                    TaskRow(store: store, todo: todo) {
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
                                    .draggable(todo.id) {
                                        Text(todo.title)
                                            .font(.caption.weight(.semibold))
                                            .padding(.horizontal, 12)
                                            .padding(.vertical, 8)
                                            .background(.regularMaterial, in: Capsule())
                                    }
                                    .dropDestination(for: String.self) { items, _ in
                                        guard let sourceId = items.first else { return false }
                                        Task { await store.move(sourceId, near: todo) }
                                        return true
                                    }
                                    Divider().padding(.leading, 44)
                                }
                            }
                            .background(.background)
                            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                            .dropDestination(for: String.self) { items, _ in
                                guard let sourceId = items.first else { return false }
                                Task { await store.move(sourceId, toSection: section) }
                                return true
                            }
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
                .padding(.top, 2)
                .padding(.bottom, 96)
            }
            .refreshable { await store.refresh() }
        }
        .background(Color.black.ignoresSafeArea())
        .safeAreaInset(edge: .top, spacing: 0) {
            Color.black
                .frame(height: 18)
                .allowsHitTesting(false)
        }
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
    }
}
