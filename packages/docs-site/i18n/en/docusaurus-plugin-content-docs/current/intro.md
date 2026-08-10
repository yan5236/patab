---
sidebar_position: 1
slug: /
---

# PaTab Custom Widget Platform

PaTab is a local-first browser new-tab workbench. In addition to the built-in search, shortcuts, folders, and to-dos, PaTab provides a **custom widget platform**: developers can write their own widgets and run them as tiles on the new-tab page grid.

## Platform Capabilities

- **Framework-agnostic**: Write widgets with any frontend stack (vanilla TypeScript, Vue, etc.). The toolchain only validates the final artifacts and does not restrict the source framework. The official scaffolder ships with two templates: `vue-ts` and `vanilla-ts`.
- **Public SDK**: Interact with the host through `@patab/widget-sdk` — read context, read and write instance-private storage, invoke host UI (toast, confirm dialogs, external links, modals), subscribe to lifecycle events such as theme/language/size, and access to-do data and controlled network requests according to permissions.
- **Complete toolchain**: the `create-patab-widget` scaffolder creates a project in one step; `@patab/widget-cli` provides local simulator debugging, validation, building, packaging, and signing.
- **Distributable**: Widgets are packaged as deterministic `.patab.zip` files (standard ZIP archives) with optional Ed25519 signatures, and can be shared directly with other PaTab users for import and installation.

## Architecture at a Glance

Widgets **never enter the host application**: third-party code runs in a `sandbox="allow-scripts"` iframe without `allow-same-origin`, with no access to the host DOM, Pinia, localStorage, or browser extension APIs. The only channel between a widget and the host is a `MessagePort` transferred to the iframe during the handshake, and every API call is validated one by one by the host-side **Capability Broker** (protocol version, session identity, message shape, permissions, quotas, and rate limits).

```text
┌─ PaTab Host ──────────────────────────────────┐
│                                               │
│   Capability Broker ── storage / todos / UI / net │
│        ▲                                      │
│        │ MessagePort RPC (patab-widget / v1)  │
│        ▼                                      │
│   ┌───────────────────────────────┐           │
│   │ sandbox iframe (widget surface)│           │
│   │  @patab/widget-sdk            │           │
│   └───────────────────────────────┘           │
└───────────────────────────────────────────────┘
```

## Documentation Map

- [Getting Started](./getting-started.mdx): create, debug, package, and install your first widget with the scaffolder
- [Development Guide](./guide/project-structure.md): project structure, Manifest, lifecycle, capabilities, theming and i18n, local debugging and testing
- [Widget SDK Reference](./sdk/connection.md): all APIs, events, types, and error codes of `@patab/widget-sdk`
- [CLI Reference](./cli.md): all commands and options of `patab-widget`
- [Package Format and Distribution](./package-format.md): the physical format of `.patab.zip`, integrity, and signing
- [Security Model](./security.md): sandbox, CSP, Broker validation, quotas, and failure recovery
- [Example Walkthrough](./examples/vanilla.md): key code explanations of the two official examples, vanilla and Vue

:::tip
The source code of the main PaTab project is at [GitHub - yan5236/patab](https://github.com/yan5236/patab). The widget-related toolchain lives in the `packages/` directory of the repository, and the official examples live in the `examples/` directory.
:::
