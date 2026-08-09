---
sidebar_position: 7
---

# Security Model

PaTab custom widgets are **third-party ZIPs imported locally by the user**, not software reviewed or hosted by PaTab. The platform's design premise is that all package contents are untrusted: even a valid signature only means the package matches that public key — it does not mean PaTab makes any security guarantee about the widget's contents.

## Sandbox Isolation

- Widget surfaces can only run in a **`sandbox="allow-scripts"` iframe without `allow-same-origin`** (with `referrerpolicy="no-referrer"` also set). Widgets cannot access the host DOM, Pinia store, localStorage, or browser extension APIs, and forms, downloads, top-level navigation, and popups are not granted.
- On the **Web side**, surfaces are injected via `srcdoc` (opaque origin); on the **browser extension side (MV3)**, a fixed sandbox page declared in the manifest plus a unique inner iframe is used, and the fixed page itself is constrained by the MV3 sandbox CSP.
- The pre-installation review page **does not insert or execute** any HTML from the package and creates no third-party iframes — all validation is purely static.

## Content Security Policy (CSP)

The host injects a fixed CSP into every surface before it runs (no `unsafe-eval`):

```text
default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline';
img-src data: blob:; font-src data:; media-src data: blob:;
connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'
```

Key points:

- `connect-src 'none'`: widgets **cannot make any network requests directly**; the only exit is `network.fetch`
- Scripts/styles are inline-only (artifacts are self-contained HTML anyway); images/fonts/media are limited to `data:`/`blob:`
- Surfaces carrying their own CSP meta, external resources, `meta refresh`, inline `import(`, and the like are all rejected before injection

## Communication and the Capability Broker

After the handshake completes, a single `MessagePort` channel exists between the widget and the host, and every request is validated one by one by the host-side **Capability Broker**:

- **Protocol and shape**: fixed `protocol: 'patab-widget'`, `apiVersion: 1`, matching session ID, request field allowlist, request ID format, and replay protection
- **Permissions**: every call re-checks authorization in real time (no caching) — after the user revokes a permission, the old iframe's next call is immediately rejected; after a widget is updated or uninstalled, calls from old sessions likewise fail immediately
- **Quotas and rate limits**: 256 KiB per request, 64 KiB per channel message, 100 requests per 10 seconds, 16 concurrent (4 for network), 3 toasts per 10 seconds; 3 consecutive limit violations trigger flood protection and destroy the iframe
- **Error sanitization**: only 19 stable error codes and safe messages are returned — widget-private data, request bodies, `Authorization`, host stack traces, and local paths are never exposed

## Data Isolation

- Widget packages, grants, instance-private data, rollback versions, and health records are stored in a **dedicated IndexedDB database** (`patab-custom-components`), separate from the host's main state; the home screen's localStorage only keeps lightweight instance references (plus separate security-state boolean/counter keys)
- Instance storage is isolated by `widget ID + instance ID`, 1 MiB per instance; change events broadcast only key names, never values
- Updates, uninstalls, and quota writes use atomic transactions

## Failure Recovery and Safe Mode

- A surface must **complete the handshake within 5 seconds**, otherwise startup is judged failed and the iframe is destroyed
- 3 consecutive startup failures/floods/incomplete startups within 24 hours: the instance is automatically disabled (calls return `INSTANCE_DISABLED`)
- 3 consecutive sessions with incomplete startup: enter **safe mode** — all third-party iframes are blocked, but management and uninstall entry points remain; leaving safe mode does not automatically re-enable instances
- Uninstall requires a second confirmation and atomically deletes the package, grants, all instances, private data, health records, and rollback versions

## Known Boundaries (for Users and Developers)

- Browser sandboxes have no reliable hard CPU/memory quotas; the platform mitigates resource abuse with startup markers, automatic disabling, and safe mode
- An authorized network origin can still receive data actively sent by the widget — the Manifest's `reason` is shown to the user on the install confirmation page
- Unsigned packages have no publisher identity continuity guarantee on update
- On the Web side, `network.fetch` is subject to the target site's CORS (PaTab provides no proxy bypass); on the extension side, host permissions can be revoked by the user at any time

## Security Checklist for Widget Developers

- Declare only the permissions and network origins you truly need, and write a clear purpose in `reason`
- Use `ui.openExternal` only for navigations explicitly triggered by the user
- Do not send `client.sessionId` or instance-private data to external services
- Handle errors such as `PERMISSION_DENIED`, `QUOTA_EXCEEDED`, and `RATE_LIMITED` with graceful degradation
- Keep the signing private key safe (passphrase-protected, never committed to the repository); changing the key means a change of publisher identity
