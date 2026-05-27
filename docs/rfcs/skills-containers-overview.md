# Skills, Containers, and Code Execution in OGX

**Authors:** Francisco Javier Arceo, Varsha Prasad Narsing
**Status:** Draft | **Date:** 2026-05-14
**Full ADR:** [`docs/adrs/0002-skills-containers-api.md`](../adrs/0002-skills-containers-api.md)

## What and why

OGX can't run code in the OGX server today. When a model wants to execute a shell command or run Python, there's no sandbox to run it in. OpenAI solves this with their [Containers API](https://developers.openai.com/api/reference/resources/containers) and [Shell tool](https://developers.openai.com/api/docs/guides/tools-shell) — we need an equivalent that works on self-hosted infrastructure.

We're adding three things:

1. **[Skills API](https://developers.openai.com/api/docs/guides/tools-skills)** — Upload versioned code bundles (zip + `SKILL.md` manifest). Standard CRUD, OpenAI-compatible. Also conforms to the [Agent Skills standard](https://agentskills.io).
2. **[Containers API](https://developers.openai.com/api/reference/resources/containers)** — Create sandboxed Debian environments, upload files, manage lifecycle. Standard CRUD, OpenAI-compatible.
3. **ContainerRuntime provider** — The abstraction that actually runs containers. Three implementations (see below).

These are separate API surfaces but one feature: skills are code bundles, containers are where they run, and the Responses API ties them together. A skill without a container is just file storage — to actually execute skill code via the `shell` tool, you need both.

All endpoints launch at `/v1alpha`.

## Architecture

OGX is an API compatibility layer, not an infrastructure orchestrator. The `ContainerRuntime` provider has three implementations, each named after the technology it talks to:

| Provider | OGX talks to | Sandbox lifecycle owned by | When to use it |
|----------|-------------|---------------------------|----------------|
| `inline::docker` | Docker API | OGX directly | Simplest path. Docker/Podman on your machine, basic container isolation. Dev, CI, local demos. |
| `inline::openshell` | [OpenShell](https://docs.nvidia.com/openshell/latest/home) Gateway API | OpenShell Gateway | Policy-enforced isolation with your choice of compute driver (Docker, Podman, MicroVM, or K8s). The Gateway owns the full sandbox lifecycle — when backed by K8s, the Gateway creates and manages sandbox pods directly. |
| `remote::kubernetes` | Kubernetes API | K8s cluster (no OpenShell) | Direct pod submission. OGX sets `sandbox_required: true`; the cluster enforces isolation via native mechanisms (RuntimeClass, NetworkPolicy, etc.). |

`inline::docker` is `inline::` (not `remote::`) because the provider code ships in-tree and manages container lifecycle directly. Docker's API is the same whether the daemon is local or remote — you just change the socket URL — so there's no need for a separate `remote::docker` provider.

The key distinction between `inline::openshell` on K8s and `remote::kubernetes` is **who owns sandbox policy**. With `inline::openshell`, OGX controls policy through the OpenShell Gateway, which runs as a StatefulSet and creates sandbox pods in a configured namespace. With `remote::kubernetes`, OGX submits pods and the cluster handles everything — OGX doesn't know or care how sandboxing is enforced.

```text
┌──────────────────────────────────────────────────────────┐
│                      Client / Agent                      │
└──────────────────────┬───────────────────────────────────┘
                       │ POST /v1alpha/responses
                       │ (tools: [{ type: "shell", ... }])
                       ▼
┌──────────────────────────────────────────────────────────┐
│                         OGX                              │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │ Skills   │  │  Containers  │  │ Responses         │  │
│  │ API      │  │  API         │  │ (shell tool)      │  │
│  └──────────┘  └──────┬───────┘  └────────┬──────────┘  │
│                       │ delegates          │ executes    │
│                       ▼                    ▼             │
│              ┌──────────────────────────────────┐       │
│              │        ContainerRuntime           │       │
│              └──┬──────────┬────────────┬────────┘       │
└─────────────────┼──────────┼────────────┼────────────────┘
                  │          │            │
                  ▼          ▼            ▼
       ┌─────────-─┐  ┌─────────────┐  ┌──────────────┐
       │  Docker   │  │  OpenShell  │  │  Kubernetes  │
       │  API      │  │  Gateway    │  │  API         │
       │ (Podman)  │  │ (StatefulSet│  │ (direct pod  │
       │           │  │   on K8s or │  │  submission, │
       │           │  │   local)    │  │  no OpenShell│
       │           │  │             │  │  involved)   │
       │           │  │  ┌────────┐ │  │              │
       │           │  │  │Compute │ │  │              │
       │           │  │  │Driver: │ │  │              │
       │           │  │  │Docker, │ │  │              │
       │           │  │  │Podman, │ │  │              │
       │           │  │  │MicroVM,│ │  │              │
       │           │  │  │or K8s  │ │  │              │
       │           │  │  └────────┘ │  │              │
       └───-───────┘  └─────────────┘  └──────────────┘
```

## How it works in the Responses API

When a client includes a `shell` tool in a request, three environment modes:

- **`container_auto`** — OGX spins up an ephemeral container, runs commands, destroys it when done. Zero setup.
- **`container_reference`** — Client pre-creates a container via `POST /containers`, references it across requests. State persists between turns.
- **`local`** — Model generates commands, streams them to the client. Client executes locally and sends output back. No server-side execution.

`code_interpreter` uses the same container substrate — it's shell execution with language-specific wrappers.

## Security defaults

Matches [OpenAI's posture](https://developers.openai.com/api/docs/guides/tools-shell): network disabled, no root, no TTY, ephemeral by default. Operators set a policy ceiling in config; per-request policy can restrict further but never expand beyond it.

## Rollout

| Phase | What |
|-------|------|
| 1 | Skills + Containers APIs, `inline::docker`, shell tool integration, OpenAI wire compatibility validation |
| 2 | `remote::kubernetes` provider |
| 3 | `inline::openshell` provider (MicroVM + policy-enforced isolation) |
| 4 | `code_interpreter` unification |
| 5 | API graduation (`/v1alpha` → `/v1beta` → `/v1`) |

## Open questions

1. **Custom container images** — Should operators bring their own base images? Flexibility vs. attack surface.
2. **Skill sharing** — Do we need a registry/marketplace, or is CRUD enough for v1alpha?
3. **GPU access** — Add a `gpu` field to container creation for ML-heavy skills?
4. **Container-to-inference networking** — When a skill calls an LLM, loopback through OGX or direct to provider? Likely a deployment concern.
5. **Multi-tenant isolation** — API-key-level for now. K8s can layer namespaces + RBAC.
6. **Wire compatibility** — Models based on docs, not tested against live API. Phase 1 validates.

## References

- [Full ADR (data models, protocols, file structure)](../adrs/0002-skills-containers-api.md)
- [OpenAI Skills API](https://developers.openai.com/api/docs/guides/tools-skills) | [Containers API](https://developers.openai.com/api/reference/resources/containers) | [Shell Tool](https://developers.openai.com/api/docs/guides/tools-shell) | [Code Interpreter](https://developers.openai.com/api/docs/guides/tools-code-interpreter#containers)
- [NVIDIA OpenShell](https://github.com/NVIDIA/OpenShell) | [Agent Skills Standard](https://agentskills.io)
