## 4.0.0

### Breaking changes

- Replaced `Socket` and `Transport` with typed, bidirectional main and renderer sessions over `MessageChannelMain`.
- Removed the v3 API and all legacy runtime dependencies.
- Published conditional ESM and CommonJS entry points for the package root, `main`, `preload`, and `renderer`.
- Raised the runtime requirement to Node.js 22.12 and Electron 41 through 43.

### Added

- Contract-inferred requests and events in both directions.
- Mandatory synchronous main-frame authorization and an isolated preload bridge that never exposes `ipcRenderer`.
- Invocation timeouts, `AbortSignal` cancellation propagation, safe remote errors, state subscriptions, and reload reconnection.
- Unit, type-contract, real-Electron, and package-consumer fixtures.
- Strict request-map contract checks and optional complete Standard Schema V1 validation for request inputs, results, and events.

### Security

- Removed the vulnerable legacy `nanoid` dependency and all production dependencies.
- Payloads use structured clone, protocol envelopes are validated before dispatch, and remote stacks are never transmitted.

## 3.0.0

### Changed

- Updated dependencies

## 2.1.1

### Changed

- Updated dependencies

## 2.1.0

### Changed

- `Socket.open` now requires a channel

## 2.0.0

- New API

## 1.2.4

### Fixed

- Request handling in Socket class.

## 1.2.3

### Fixed

- Message handling in Bridge class.

## 1.2.2

### Fixed

- Removed double 'Error:' word in error message.

## 1.2.1

### Fixed

- Improved error handling.

## 1.2.0

### Added

- Bridge. Creates a bridge between two sockets.
- `open` and `close` events to a Socket class.

### Fixed

- Fixed not passed event name for event handlers.

## 1.1.2

### Fixed

- Fixed WebView events when no data was passing.

## 1.1.1

### Fixed

- WebView messaging.

## 1.1.0

### Added

- Support for WebView Element as an IPC object.
