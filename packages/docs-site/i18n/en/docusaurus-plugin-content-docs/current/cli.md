---
sidebar_position: 5
---

# CLI Reference

`@patab/widget-cli` provides the `patab-widget` command for local debugging, validation, building, packing, and signing of widgets. Node requirement: `^22.18.0 || >=24.12.0`.

```text
patab-widget <dev|check|build|pack|inspect|keygen> [--root 目录] [--out 文件] [--sign 私钥]
```

Running with no arguments prints help and exits with code 1; `patab-widget help` exits with code 0; an unknown command reports `CHECK_FAILED`.

## General Conventions

- **Configuration source**: The CLI only reads `patab.manifest.json` at the project root (validated against the SDK Schema plus an API version compatibility check). There is no separate CLI configuration file.
- **Output**: All output is single-line JSON `{"ok": true|false, "code": "...", "message": "..."}`; exit code 0 on success, 1 on failure. Errors never leak absolute paths, keys, or raw exceptions from underlying tools.
- **Argument style**: Long options only, space-separated values (`--root dir`; `--root=dir` is not supported). Any unknown argument is an outright error — there is deliberately no `--force`-style switch to bypass security checks.
- **Stable error codes**: `API_INCOMPATIBLE | BUILD_FAILED | CHECK_FAILED | INTEGRITY_FAILED | INVALID_PACKAGE | MANIFEST_INVALID | SIGNATURE_INVALID | TYPE_CHECK_FAILED`.

## Options

| Option | Commands | Meaning | Default |
|---|---|---|---|
| `--root 目录` | all | Widget project root directory | Current working directory |
| `--host 地址` | `dev` | Listen address | `127.0.0.1` |
| `--port 端口` | `dev` | Listen port (1–65535) | `5174` (strictPort; fails if occupied) |
| `--out 文件` | `pack` | Output ZIP path (relative to project root) | `dist/<id>-<version>.patab.zip` |
| `--sign 私钥` | `pack` | PKCS#8 PEM private key path (relative to project root) | Unsigned |
| `--key-out 文件` | `keygen` | Private key output path | `.patab-widget-keys/` outside the project |

## dev — Local Simulator

```bash
patab-widget dev [--root 目录] [--host 地址] [--port 端口]
```

Starts the local simulator and prints the debug URL (default `http://127.0.0.1:5174/__patab_widget_simulator__`). Surfaces run in a `sandbox="allow-scripts"` iframe identical to production, and the SDK completes the same MessagePort handshake with the host via a bridge script; the left panel can switch surface/size/variant/theme/locale and mock confirm, network, and toast. Ctrl+C to exit. See [Local Debugging and Testing](./guide/testing.md).

## check — Validate the Project

```bash
patab-widget check [--root 目录]
```

Loads the Manifest → builds all surfaces → generates the integrity manifest → runs full package validation (file set, images, quotas, integrity, signature rules), **without writing a ZIP**. On success it prints `组件校验通过：<id>@<version>`.

:::note
`check` does **not** run the TypeScript type check; type checking is only enforced in `pack`.
:::

## build — Verify Buildability

```bash
patab-widget build [--root 目录]
```

Uses the project's own Vite config to build each surface into a fully self-contained HTML file and reports the count (`已构建 N 个自包含 surface。`). Artifacts are built in a temporary directory and deleted immediately, **never written to disk** — this command exists to verify buildability.

## pack — Package

```bash
patab-widget pack [--root 目录] [--out 文件] [--sign 私钥]
```

Full pipeline:

1. Load and validate the Manifest and API version compatibility
2. **Forcibly run the project's `npm run type-check`** (failures report `TYPE_CHECK_FAILED`)
3. Build and inline all surfaces + read declared assets + normalize the JSON Manifest → generate `integrity.json` (SHA-256 integrity manifest)
4. When `--sign` is given, generate `signature.json` with an Ed25519 private key; **signing failure aborts outright — it never falls back to an unsigned package**
5. Run the same full validation as `check` before packing
6. Write a **deterministic ZIP** (Deflate level 9, mtime fixed to 1980-01-01, entries sorted by path): identical inputs produce byte-identical packages
7. Atomic write: write to a temporary directory → run a full `inspect` self-check on the temporary package → `rename` to the final path → `inspect` the final package again; any failure deletes the temporary artifacts

On success it prints `组件包已生成：<fileName>（已签名|未签名）`. `pack` does not accept extra positional arguments.

## inspect — Re-check a Finished Package

```bash
patab-widget inspect <zip路径> [--root 目录]
```

Reads the ZIP → validates the central directory structure → extracts → runs the same full validation as `check` (Manifest Schema, file set, images, integrity, signature; signature status must be `unsigned` or `valid`). On success it prints `组件包检查通过：<id>@<version>`. `inspect` never executes surface code and never leaks archive paths or HTML content.

## keygen — Generate a Signing Key Pair

```bash
patab-widget keygen [--root 目录] [--key-out 文件]
```

Generates an Ed25519 key pair for package signing:

- Private key: PKCS#8 PEM, **AES-256-CBC passphrase-encrypted**, permissions `0o600`; refuses to overwrite an existing file
- Passphrase: entered twice (no echo) on an interactive terminal, at least 12 characters; in non-interactive environments provide it via the **`PATAB_WIDGET_KEY_PASSPHRASE`** environment variable
- Default output is **outside the project root** at `<project parent directory>/.patab-widget-keys/<id>.ed25519.pem`, to avoid accidental commits to version control
- The printed `publicKeyBase64` must be **manually** copied into `publisher.publicKey` in `patab.manifest.json`

## Typical Workflow

```bash
patab-widget dev          # 开发调试
patab-widget check        # 提交前校验
patab-widget pack         # 产出 dist/<id>-<version>.patab.zip
patab-widget inspect dist/<id>-<version>.patab.zip
patab-widget keygen       # 需要签名时先生成密钥
patab-widget pack --sign ../.patab-widget-keys/<id>.ed25519.pem
```
