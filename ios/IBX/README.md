# ibx iOS

Native SwiftUI client for the ibx HTTP API.

## Run

Open `IBX.xcodeproj` in Xcode or run:

```sh
xcodebuild -project ios/IBX/IBX.xcodeproj -scheme IBX -destination 'platform=iOS Simulator,name=iPhone 16e' build
```

## Authentication

Authentication is handled by Clerk. Signed-out users can still use cached and
Shortcut-created tasks offline; signing in enables live sync to the production
IBX API at `https://ibx.egeuysal.com`.

## Features

- Live Today, Upcoming, Zen, and Archive views from `/api/todos`
- Command bar for add and AI run workflows
- Toggle done/open
- Edit title, notes, due date, estimated hours, time block, recurrence, and priority
- Delete todos
- Apple Shortcuts action for offline todo capture with optional notes, due date, estimated hours, and priority
- Signed-out offline task access with Clerk sign-in from the toolbar
- Dark, light, and system appearance modes
- Silent foreground auto-refresh
- Local notifications five minutes before open tasks with time blocks
