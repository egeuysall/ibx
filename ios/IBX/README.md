# ibx iOS

Native SwiftUI client for the ibx HTTP API.

## Run

Open `IBX.xcodeproj` in Xcode or run:

```sh
xcodebuild -project ios/IBX/IBX.xcodeproj -scheme IBX -destination 'platform=iOS Simulator,name=iPhone 16e' build
```

## Authentication

The app does not ship with bundled credentials or mock data. Add a read/write API key in Settings. The key is stored in the iOS Keychain and sent as:

```http
Authorization: Bearer iak_...
```

Production defaults to `https://ibx.egeuysal.com`. Non-HTTPS URLs are rejected except localhost development URLs.

## Features

- Live Today, Upcoming, Zen, and Archive views from `/api/todos`
- Command bar for add and AI run workflows
- Toggle done/open
- Edit title, notes, due date, estimated hours, time block, recurrence, and priority
- Delete todos
- Apple Shortcuts action for offline todo capture with optional notes, due date, estimated hours, and priority
- Dark, light, and system appearance modes
- Silent foreground auto-refresh
- Local notifications five minutes before open tasks with time blocks
