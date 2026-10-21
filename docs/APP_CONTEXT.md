
> **Architectural Metaphor:** The application acts as *"the classroom usher and stage setup manager"* — it mounts and orchestrates the workspace environment, but does not author the assessment rules or determine grades; those decisions remain strictly on the server side.

---

## Overview

The **TPI Desktop Client** is an Electron-based desktop application developed for the **TPI** (*Trabajo Práctico Integrador*, 2026 — UTN FRCórdoba, Programación IV & Metodología de Sistemas II) platform. 

Executing directly on the student's machine, it acts as the local orchestrator for the assessment experience. It provisions containerized execution environments, launches the isolated web IDE, records signed telemetry events, and securely manages assessment submissions.

### Core Architectural Principles
* **Zero-Trust Network Model:** Exposes no public ports or local databases.
* **Gateway Communication:** Communicates exclusively with the API Gateway (`API_GATEWAY_URL`).
* **Cryptographic Identity:** Authenticates via an opaque session token combined with an **Ed25519** hardware/device key pair generated during initial pairing.

---

## Repository Structure

```text
├── apps/
│   └── desktop/            # Primary Electron desktop client
├── packages/
│   ├── core/               # Shared domain logic & utility modules
│   └── contracts/          # API schemas, events, & type definitions
├── agent/                  # Telemetry agent & process supervisor
├── mock-server/            # Local API gateway stub for development/testing
├── images/                 # Static assets & branding resources
├── docker/
│   └── desktop/            # Container definitions & Dockerfiles
├── contracts/              # Shared cryptographic & payload contracts
├── openspec/               # OpenAPI / API contract specifications
└── docs/                   # Extended architecture & design documentation
```

---

## Assessment Session Lifecycle

```text
┌─────────┐    ┌─────────┐    ┌─────────┐    ┌──────────┐    ┌──────────┐
│  Checks │ ──>│ Pairing │ ──>│ Consent │ ──>│ Exchange │ ──>│ Refresh  │
└─────────┘    └─────────┘    └─────────┘    └──────────┘    └──────────┘
                                                                   │
┌─────────┐    ┌─────────┐    ┌─────────┐                          │
│ Logout  │ <──│ Submit  │ <──│ Work    │ <────────────────────────┘
└─────────┘    └─────────┘    └─────────┘ (Setup Pipeline)
```

1. **Environment Checks:** Validates baseline prerequisites: Docker >= 24, adequate system RAM, WSL2 state (Windows), available disk space, and API gateway reachability.
2. **Device Pairing:** Intercepts `tpi-assessment://pair?code=XXXX-XXXX` deep links to generate a unique **Ed25519** key pair for device binding.
3. **Consent Verification:** Downloads the agreement text from the backend and verifies its `SHA-256` checksum locally. The session halts immediately if consent is declined.
4. **Token Exchange:** Executes `POST /public/assessment/sessions` returning `sessionId`, `token`, and `expiresAt`. Cryptographic credentials are encrypted at rest using OS-native `safeStorage`.
5. **Token Lifecycle Management:** Triggers an Ed25519-signed background token refresh at **75%** of token expiration.
6. **Workspace Setup Pipeline:** Executes a 7-stage deterministic orchestration state machine:
   `VALIDATING` -> `PULLING_IMAGES` -> `PREPARING_WORKSPACE` -> `PROVISIONING_REPOSITORY` -> `STARTING_IDE` -> `REPORTING` -> `READY`
7. **Active Evaluation Work:**
   * Runs the IDE (`code-server`) inside an isolated `--internal` Docker network without external internet access.
   * Assessment execution commands (`tpi-run`) run in ephemeral toolchain containers with strict resource quotas (CPU, RAM, PID limits).
   * Background telemetry agent sequence-indexes, redirects, and cryptographically signs all session events with auto-push cycles every 60 seconds.
8. **Assessment Submission:** Dispatches `POST /assessment/attempts/{id}/submit` signed using the local device key (never using plain SHA hashes).
9. **Session Cleanup / Logout:** Invalidates remote session, purges local session tokens and cryptographic keys, while persisting the anonymous `installId`.

---

## Security Architecture (Critical Subsystem)

Security is the primary non-functional requirement of this repository.

* **Layered Network Isolation:** The IDE and proxy containers run on an `--internal` bridge network with outbound egress filtered by a host allowlist. Only a single loopback port is exposed on `127.0.0.1`.
* **Fail-Closed Guarantees:** The `assertNetworkIsolation` module continuously inspects `docker network inspect` states and immediately halts execution upon drift detection. The `editor-gateway` enforces strict `Host` and `Origin` header validation and rejects HTTP `CONNECT` tunneling.
* **Credential Isolation:** The raw session token is never injected into the IDE container. Signing keys are kept in secure memory and never exposed via `argv`, environment variables, or log streams.
* **Resource Tagging & Lifecycle:** Every Docker container/volume carries strict metadata tags (`tpi.session`, `tpi.attempt`, `tpi.role`) allowing precise per-session teardown without risking workspace volume loss.
* **Container Hardening:** Electron/Chromium hardened flags (`NODE_OPTIONS` stripped, `DOCKER_HOST` isolated, `seccomp` sandboxing active, privilege drop to non-root `uid 1000`).

---

## Tech Stack & Tooling

| Category | Technology / Library |
| :--- | :--- |
| **Language & Runtimes** | TypeScript 6 (Strict ESM), Node.js >= 24, npm Workspaces |
| **Frameworks** | Electron 44, `electron-vite` 5, Vite 7 |
| **Validation & Specs** | Zod 4, JSON Canonicalization Scheme (JCS) |
| **Testing** | Vitest 5 (Coverage thresholds: 80% Stmts / 80% Branch / 80% Funcs / 70% Lines) |
| **Code Quality** | ESLint 10, Prettier, `esbuild` |
| **Containerization** | Docker CLI via `execFile` (Shell-less invocation for command injection protection) |
| **Cryptography** | Node Crypto, `safeStorage`, Ed25519 signing algorithms |

---
