# ADR-0002: Skills API, Containers API, and ContainerRuntime Provider

- **Status:** Draft
- **Date:** 2026-05-14
- **Authors:** Francisco Javier Arceo, Varsha Prasad Narsing

## Summary

This RFC proposes adding three new capabilities to OGX:

1. **Skills API** — CRUD endpoints for managing versioned skill bundles (zip archives with `SKILL.md` manifests), conforming to the [OpenAI Skills API](https://developers.openai.com/api/docs/guides/tools-skills) and the open [Agent Skills standard](https://agentskills.io).
2. **Containers API** — CRUD endpoints for managing sandboxed execution environments and their files, conforming to the [OpenAI Containers API](https://developers.openai.com/api/reference/resources/containers).
3. **ContainerRuntime provider** — A new provider protocol abstracting over container execution backends, with two implementations: `inline::local` (Docker/Podman, with optional sandbox backend) for local and single-machine deployments, and `remote::kubernetes` for production cluster deployments. Sandbox technologies like [NVIDIA OpenShell](https://github.com/NVIDIA/OpenShell) and [Kagenti](https://kagenti.github.io/.github/) are deployment-side choices, not OGX providers.

Together, these enable OGX to support the `shell` tool and `code_interpreter` tool in the Responses API, executing model-generated commands in secure, sandboxed containers with skill code mounted into the filesystem.

All new endpoints launch at **`/v1alpha`** and will graduate through the standard API leveling process.

## Motivation

### The problem

OGX implements the OpenAI Responses API, but currently lacks support for two tool types that require server-side code execution:

- **`shell`** — The model generates terminal commands and the server executes them in a sandboxed container, returning stdout/stderr/exit_code. This enables agents to install packages, run scripts, manipulate files, and perform arbitrary computation.
- **`code_interpreter`** — The model generates code (Python, etc.) and the server executes it in a sandbox, returning output including generated files (charts, data, etc.).

Both tools require a secure execution substrate: sandboxed containers with configurable network access, resource limits, and filesystem isolation. OpenAI provides this through their Containers API. OGX needs an equivalent that works with self-hosted infrastructure.

### Why now

- The OpenAI Skills API and Shell tool are generally available and seeing adoption.
- The `ResponseItemInclude` enum in `ogx_api/responses/models.py` already references `code_interpreter_call.outputs` as an include option, indicating this capability was anticipated, though no actual tool types, input types, or output item types for shell or code_interpreter exist yet in the codebase.
- NVIDIA OpenShell and Kagenti have reached sufficient maturity to serve as production container backends.
- Users evaluating OGX for production agent workloads expect feature parity with OpenAI's tool execution capabilities.

### External projects

**NVIDIA OpenShell** provides a lightweight, policy-driven sandbox runtime. Its architecture has four components: a Gateway (control plane for sandbox lifecycle and auth), Sandboxes (isolated containers with policy-enforced egress), a Policy Engine (declarative YAML constraints across filesystem/network/process/inference layers), and a Privacy Router. It supports Docker, Podman, VM (MicroVM-backed), and Kubernetes compute drivers. OpenShell fits the "run one skill securely" primitive — fine-grained per-sandbox policy enforcement for single-node or small-cluster deployments.

**Kagenti** provides a Kubernetes-native orchestration platform for AI agents. Its architecture includes a Control Plane (web dashboard), Workload Runtime (K8s-native with A2A protocol), Lifecycle Orchestration (K8s operators + AgentCard CRDs), Networking (MCP Gateway + Istio mesh), Security (AuthBridge zero-trust identity + SPIRE + Keycloak), and Observability (Kiali + Phoenix tracing). Kagenti fits the "manage and route across many skills at scale" control plane — fleet-wide agent orchestration and governance for large Kubernetes deployments.

These projects are complementary: OpenShell provides single-sandbox security enforcement while Kagenti provides fleet-wide orchestration. An OGX deployment could use either or both depending on infrastructure and security requirements.

## Design Decisions

### Architecture: Two New APIs + ContainerRuntime Provider

The design follows OGX's established pattern: each API gets its own module in `ogx_api/` with models, protocol, and routes. A new `ContainerRuntime` provider protocol abstracts over execution backends.

Three alternatives were considered:

1. **Two APIs + ContainerRuntime provider** (chosen) — Clean separation of concerns, OpenAI-compatible API surface (pending wire-level validation), follows existing OGX patterns. The API layer (HTTP routing and validation) is separate from the runtime layer (actual container orchestration).
2. **Single unified "Sandbox" API** — Merges containers and skills into one API. Simpler internally but diverges from OpenAI's resource separation, making it harder to evolve skill management (sharing, discovery) independently of container lifecycle.
3. **Tool Runtime extension only** — Extends existing `ToolRuntime` provider without new API surfaces. Minimal new code but doesn't expose the Containers/Skills CRUD API, breaking OpenAI compatibility for clients that pre-create containers or manage skills.

### Unified Execution Substrate

Containers serve as the unified execution substrate for both `shell_call` and `code_interpreter_call`. A single `ContainerRuntime` provider handles all sandboxed execution rather than having separate implementations. This matches OpenAI's model where code interpreter runs inside containers.

### Provider Model: `inline::local` and `remote::kubernetes`

OGX is an API compatibility layer, not an infrastructure orchestrator. The ContainerRuntime provider model reflects this:

- **`inline::local`** — A fully functional, first-class provider. Runs containers on the same machine as OGX using Docker or Podman. Suitable for development, testing, CI, and single-machine deployments. Optionally, operators can configure a local sandbox backend (e.g., an OpenShell Gateway) for policy-enforced or VM/MicroVM-backed isolation without requiring Kubernetes.
- **`remote::kubernetes`** — The production-grade provider for cluster deployments. OGX submits container workloads to a Kubernetes cluster. What sandbox technology the cluster uses underneath (OpenShell, agent-sandbox, or any future alternative) is a cluster-side decision — not OGX's concern. OGX exposes a `sandbox_required` knob so operators can declare that workloads must run in a sandboxed environment, but the sandbox implementation is chosen and enforced by the cluster infrastructure.

**OpenShell, Kagenti, and other sandbox/orchestration technologies are not OGX providers.** They are implementation details of the deployment:

- **OpenShell** can appear at the inline level (as an optional local sandbox backend behind `inline::local`) or at the cluster level (as the sandbox technology that Kubernetes uses to isolate pods). In both cases, OGX does not couple to OpenShell's API — the provider talks to Docker/Podman or Kubernetes respectively, and OpenShell operates as infrastructure beneath those layers.
- **Kagenti** is a Kubernetes-native orchestration/governance layer. In a `remote::kubernetes` deployment, Kagenti may manage agent lifecycle, identity (SPIRE), and tool routing (MCP Gateway). This is a cluster-side concern — OGX submits workloads and the cluster decides how to orchestrate them.

This separation means OGX can adopt new sandbox technologies (e.g., swapping OpenShell for agent-sandbox) by changing cluster configuration, without modifying OGX provider code.

### Operator-Configurable Security Policy

Security policy defaults to network-disabled containers (matching OpenAI) but is operator-configurable. For `remote::kubernetes`, sandbox enforcement is a cluster-side responsibility — OGX passes the `sandbox_required` flag and policy configuration, and the cluster infrastructure (whether OpenShell, agent-sandbox, or native K8s security) enforces it. For `inline::local`, basic policy uses Docker network and volume settings by default, or delegates to a local sandbox backend (e.g., OpenShell Gateway) when configured. Request-level policy can only restrict beyond operator defaults, never expand.

### OpenAI API Conformance

This RFC aims for OpenAI API compatibility but does not claim full conformance at launch. The endpoint paths and resource shapes are modeled after the OpenAI Skills and Containers APIs, but:

- Wire-level compatibility of request/response models must be validated against the current OpenAI API spec before implementation. The models in this RFC are based on available documentation and may diverge from the actual API wire format.
- OGX extensions (e.g., `NetworkPolicyExtended` with credential injection) are clearly marked and do not affect the base OpenAI-compatible surface.
- Full conformance testing will be part of the Phase 1 deliverable, using the same approach as existing OGX OpenAI conformance tracking in `docs/static/openai-coverage.json`.

## Skills API

### Endpoints

All endpoints are prefixed with `/v1alpha`.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/skills` | Create a skill (multipart zip upload, max 50 MB compressed / 25 MB uncompressed, 500 files per version) |
| `GET` | `/skills` | List skills |
| `GET` | `/skills/{skill_id}` | Get skill metadata |
| `POST` | `/skills/{skill_id}` | Update default_version |
| `DELETE` | `/skills/{skill_id}` | Delete skill |
| `GET` | `/skills/{skill_id}/content` | Download skill content (zip bundle for default version) |
| `POST` | `/skills/{skill_id}/versions` | Create new version (multipart zip upload) |
| `GET` | `/skills/{skill_id}/versions` | List versions |
| `GET` | `/skills/{skill_id}/versions/{version}` | Get version metadata |
| `GET` | `/skills/{skill_id}/versions/{version}/content` | Download skill content (zip bundle for specific version) |
| `DELETE` | `/skills/{skill_id}/versions/{version}` | Delete version (deleting last version deletes the skill) |

> **Note:** The endpoint list matches the OpenAI Skills API surface tracked in `docs/static/openai-coverage.json`, including the `/content` endpoints for downloading skill bundles.

### Data Models

```python
class Skill(BaseModel):
    id: str
    name: str
    description: str | None
    default_version: int
    latest_version: int
    created_at: str  # ISO 8601


class SkillVersion(BaseModel):
    version: int
    skill_id: str
    file_manifest: list[SkillFile]
    created_at: str


class SkillFile(BaseModel):
    name: str  # relative path within the bundle
    size: int  # bytes
    content_type: str


class SkillCreateRequest(BaseModel):
    name: str
    description: str | None = None
    # File content provided via multipart form data


class SkillUpdateRequest(BaseModel):
    default_version: int
```

### SKILL.md Manifest

Each skill bundle must contain a `SKILL.md` file at the root. The manifest uses YAML frontmatter followed by markdown instructions:

```markdown
---
name: data-analysis
description: Analyze CSV data and generate reports
version: 1
tools:
  - name: analyze_csv
    description: Parse and analyze a CSV file
---

# Data Analysis Skill

Instructions for the model on how to use this skill...
```

The manifest is parsed on upload. The `name` and `description` fields from frontmatter populate the `Skill` object if not provided in the create request.

### Storage

- Skill metadata (id, name, versions, timestamps) stored in `SqlStore` or `KVStore`, consistent with how other OGX resources are persisted.
- Skill file bundles stored via the existing `Files` provider as zip file objects.
- On mount, bundles are extracted into the container filesystem at `/mnt/skills/{skill_name}/`.

### Protocol

```python
class Skills(Protocol):
    async def create_skill(
        self, name: str, description: str | None, content: UploadFile
    ) -> Skill: ...

    async def list_skills(self) -> list[Skill]: ...

    async def get_skill(self, skill_id: str) -> Skill: ...

    async def update_skill(self, skill_id: str, default_version: int) -> Skill: ...

    async def delete_skill(self, skill_id: str) -> None: ...

    async def create_skill_version(
        self, skill_id: str, content: UploadFile
    ) -> SkillVersion: ...

    async def list_skill_versions(self, skill_id: str) -> list[SkillVersion]: ...

    async def get_skill_version(
        self, skill_id: str, version: int | str
    ) -> SkillVersion: ...

    async def delete_skill_version(self, skill_id: str, version: int) -> None: ...

    async def get_skill_content(
        self, skill_id: str, version: int | None = None
    ) -> AsyncIterator[bytes]: ...

    """Download skill bundle content. If version is None, uses default_version."""
```

## Containers API

### Endpoints

All endpoints are prefixed with `/v1alpha`.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/containers` | Create a container |
| `GET` | `/containers` | List containers |
| `GET` | `/containers/{container_id}` | Get container |
| `DELETE` | `/containers/{container_id}` | Delete container |
| `POST` | `/containers/{container_id}/files` | Upload file to container |
| `GET` | `/containers/{container_id}/files` | List container files |
| `GET` | `/containers/{container_id}/files/{file_id}` | Get file metadata |
| `GET` | `/containers/{container_id}/files/{file_id}/content` | Download file content |
| `DELETE` | `/containers/{container_id}/files/{file_id}` | Delete file |

### Data Models

```python
class Container(BaseModel):
    id: str
    name: str | None
    status: Literal["pending", "running", "stopped", "expired"]
    memory_limit: Literal["1g", "4g", "16g", "64g"]
    expires_after: ExpiresAfter | None
    network_policy: NetworkPolicy
    skills: list[str]  # skill IDs mounted in this container
    created_at: str
    last_active_at: str


class ExpiresAfter(BaseModel):
    anchor: Literal["last_active_at"]
    minutes: int  # default 20


class NetworkPolicy(BaseModel):
    type: Literal["allowlist", "disabled"]
    allowed_domains: list[str] | None = None  # matches OpenAI: plain domain strings


# OGX Extension: NetworkPolicyExtended adds credential injection, which is not
# part of OpenAI's Containers API. When wire-compatibility with OpenAI is required,
# use NetworkPolicy with plain string domains. The extended model is for OGX
# operator-level configuration where secrets need to be injected into containers.
class NetworkPolicyExtended(NetworkPolicy):
    domain_credentials: list[NetworkDomainCredential] | None = None


class NetworkDomainCredential(BaseModel):
    domain: str
    credentials: list[NetworkCredential]


class NetworkCredential(BaseModel):
    env_var: str  # environment variable name injected into container
    secret: str  # actual value (stored encrypted, masked from model context)


class ContainerFile(BaseModel):
    id: str
    object: Literal["container.file"] = "container.file"
    container_id: str
    path: str  # file path within the container (OpenAI uses 'path', not 'name')
    bytes: int  # file size in bytes (OpenAI uses 'bytes', not 'size')
    source: Literal["user", "assistant"]  # who created the file
    created_at: int  # Unix timestamp


class ContainerCreateRequest(BaseModel):
    name: str | None = None
    memory_limit: Literal["1g", "4g", "16g", "64g"] = "4g"
    expires_after: ExpiresAfter | None = None
    network_policy: NetworkPolicy = NetworkPolicy(type="disabled")
    skills: list[str] | None = None  # skill IDs to mount
```

### Container Lifecycle

1. **Create**: Client calls `POST /containers`. The `ContainerRuntime` provider provisions the sandbox. Status transitions from `pending` → `running`.
2. **Use**: Container is referenced in Responses requests via `container_reference` environment type. Each use updates `last_active_at`.
3. **Expire**: If `expires_after` is set, the container is automatically stopped and cleaned up after `minutes` of inactivity (measured from `last_active_at`).
4. **Delete**: Client calls `DELETE /containers/{id}`. The runtime destroys the sandbox and all files.

### Protocol

The Containers API protocol delegates to the `ContainerRuntime` provider for actual container management:

```python
class Containers(Protocol):
    async def create_container(self, config: ContainerCreateRequest) -> Container: ...

    async def list_containers(self) -> list[Container]: ...

    async def get_container(self, container_id: str) -> Container: ...

    async def delete_container(self, container_id: str) -> None: ...

    async def upload_file(
        self, container_id: str, file: UploadFile
    ) -> ContainerFile: ...

    async def list_files(self, container_id: str) -> list[ContainerFile]: ...

    async def get_file(self, container_id: str, file_id: str) -> ContainerFile: ...

    async def get_file_content(
        self, container_id: str, file_id: str
    ) -> AsyncIterator[bytes]: ...

    async def delete_file(self, container_id: str, file_id: str) -> None: ...
```

## ContainerRuntime Provider

### Protocol

`ContainerRuntime` is a new provider protocol. This requires adding three new members to the `Api` enum in `src/ogx_api/datatypes.py` (which currently has members like `inference`, `responses`, `files`, `tool_runtime`, etc., but no skills, containers, or container_runtime):

```python
# New Api enum members to add
skills = "skills"
containers = "containers"
container_runtime = "container_runtime"
```

Corresponding provider registry modules, router factories, and resolver wiring must also be added — following the same pattern as existing APIs (e.g., `inference`, `vector_io`). `ContainerRuntime` is the abstraction boundary between the API layer and the execution backend.

```python
class ContainerRuntime(Protocol):
    # Container lifecycle
    async def create_container(self, config: ContainerCreateRequest) -> Container: ...

    async def get_container(self, container_id: str) -> Container: ...

    async def list_containers(self) -> list[Container]: ...

    async def delete_container(self, container_id: str) -> None: ...

    # Container file management
    async def upload_file(
        self, container_id: str, file: UploadFile
    ) -> ContainerFile: ...

    async def list_files(self, container_id: str) -> list[ContainerFile]: ...

    async def get_file(self, container_id: str, file_id: str) -> ContainerFile: ...

    async def get_file_content(
        self, container_id: str, file_id: str
    ) -> AsyncIterator[bytes]: ...

    async def delete_file(self, container_id: str, file_id: str) -> None: ...

    # Execution
    async def execute_shell(
        self,
        container_id: str,
        commands: list[str],
        timeout_ms: int = 30000,
        max_output_length: int = 10000,
    ) -> ShellCallOutput: ...

    # Skill mounting
    async def mount_skills(
        self, container_id: str, skill_bundles: list[SkillBundle]
    ) -> None: ...
```

### Execution Model

```python
class ShellCallOutput(BaseModel):
    stdout: str
    stderr: str
    outcome: ShellOutcome


class ShellOutcome(BaseModel):
    type: Literal["exit", "timeout"]
    exit_code: int | None = None  # present when type == "exit"
```

### Provider Implementations

#### `inline::local` — Local Container Execution

A fully functional, first-class provider for running containers on the same machine as OGX. Suitable for development, testing, CI, and single-machine production deployments.

**Direct mode** (default): Uses Docker or Podman directly.

- Uses the Docker SDK for Python (`docker` package) or Podman equivalent to manage containers.
- Default container image: A Debian-based image with common language runtimes (Python, Node, Go, Java). The exact versions should track what OpenAI's hosted containers provide at the time of implementation — OpenAI's shell tool documentation describes a Debian environment with multiple runtimes pre-installed, though the specific versions are not guaranteed to be stable.
- Commands executed via `container.exec_run()`.
- Skill bundles extracted into `/mnt/skills/` via volume mounts or `container.put_archive()`.
- Network isolation via Docker network settings (`--network=none` for disabled).
- Resource limits via Docker cgroup settings (`--memory`, `--cpus`).
- Container expiration managed by a background asyncio task that periodically checks `last_active_at`.

**Sandbox mode** (optional): Delegates to a local sandbox backend for policy-enforced isolation. When `sandbox_backend` is configured, OGX delegates container lifecycle and policy enforcement to the sandbox backend rather than managing Docker/Podman directly. For example, a local OpenShell Gateway can provide four-layer security enforcement (filesystem, network, process, inference) and VM/MicroVM-backed isolation via its `vm` compute driver — without requiring Kubernetes.

> **Acknowledged coupling:** Sandbox mode introduces a direct dependency on the sandbox backend's API (e.g., the OpenShell Gateway API). This contradicts the principle that sandbox technology is a deployment-side concern, not an OGX concern. We accept this trade-off because the alternative — requiring Kubernetes for any production-grade isolation — raises the barrier for single-machine deployments significantly. The coupling is contained to the `inline::local` provider's sandbox adapter code and does not affect `remote::kubernetes`, which remains fully decoupled. If a different sandbox technology (e.g., agent-sandbox) needs local support in the future, it would require a new sandbox adapter in this provider — a small, localized change rather than a new top-level OGX provider.

Configuration:

```python
class LocalContainerRuntimeConfig(BaseModel):
    runtime: Literal["docker", "podman"] = Field(
        default="docker",
        description="Container runtime for direct execution (used when sandbox_backend is 'none')",
    )
    sandbox_backend: Literal["none", "openshell"] = Field(
        default="none",
        description="Optional sandbox backend. 'openshell' delegates to a local OpenShell Gateway "
        "for policy-enforced isolation. 'none' uses Docker/Podman directly.",
    )
    sandbox_gateway_url: str | None = Field(
        default=None,
        description="URL of the local sandbox gateway (required when sandbox_backend is not 'none')",
    )
    default_image: str = Field(
        default="debian:12-slim",
        description="Default container image for sandbox environments",
    )
    max_containers: int = Field(
        default=50,
        description="Maximum number of concurrent containers",
    )
    working_directory: str = Field(
        default="/mnt/data",
        description="Default working directory inside containers",
    )
```

**Security trade-offs:** Direct mode provides basic container isolation via Docker/Podman but lacks fine-grained policy enforcement. Sandbox mode (e.g., with a local OpenShell Gateway) adds policy-enforced network egress, filesystem restrictions, process-level syscall controls, and optionally VM-backed isolation. Operators should choose based on their threat model.

#### `remote::kubernetes` — Kubernetes Cluster Execution (Production)

The production-grade provider for cluster deployments. OGX submits container workloads to a Kubernetes cluster via the Kubernetes API. What sandbox technology the cluster uses underneath is a cluster-side decision — not OGX's concern.

- Creates containers as Kubernetes pods via the K8s API.
- Files uploaded to containers via pod exec or init containers.
- Shell commands executed via pod exec.
- Container expiration managed via K8s TTL controllers or OGX-side cleanup.
- OGX exposes a `sandbox_required` knob: when `true`, OGX annotates pods to signal that the cluster must run them in a sandboxed environment. How the cluster enforces this (OpenShell, agent-sandbox, gVisor, Kata Containers, etc.) is determined by cluster-side admission controllers, operators, or runtime classes.

Configuration:

```python
class KubernetesContainerRuntimeConfig(BaseModel):
    kubeconfig: str | None = Field(
        default=None,
        description="Path to kubeconfig file (uses in-cluster config if not set)",
    )
    namespace: str = Field(
        default="ogx-containers",
        description="Kubernetes namespace for container workloads",
    )
    service_account: str = Field(
        default="ogx-container-runtime",
        description="Kubernetes service account for container pods",
    )
    sandbox_required: bool = Field(
        default=True,
        description="Whether container workloads must run in a sandboxed environment. "
        "When true, pods are annotated to signal sandbox enforcement to cluster infrastructure.",
    )
    default_image: str = Field(
        default="debian:12-slim",
        description="Default container image for sandbox environments",
    )
    resource_defaults: dict | None = Field(
        default=None,
        description="Default K8s resource requests/limits for container pods",
    )
```

**Sandbox technology is a cluster-side decision.** The cluster administrator chooses how to sandbox pods:

- **OpenShell**: Deploy an OpenShell Gateway with the `kubernetes` compute driver. OpenShell intercepts pod creation and enforces its four-layer security policy (filesystem, network, process, inference). OpenShell also supports `docker`, `podman`, and `vm` compute drivers for non-K8s environments — but when running on K8s, the `kubernetes` driver is used and OpenShell operates as cluster infrastructure.
- **Kagenti**: Deploy Kagenti for fleet-wide agent orchestration, zero-trust identity (SPIRE + AuthBridge), and MCP Gateway-based tool routing. Kagenti may wrap OpenShell for per-pod isolation.
- **Native K8s**: Use RuntimeClasses (gVisor, Kata Containers), Pod Security Standards, and NetworkPolicies directly.
- **Future alternatives**: Any sandbox technology that integrates with Kubernetes admission controllers or runtime classes can be used without changing OGX code.

### Dependency Graph

```text
Responses Provider
    ├── ContainerRuntime (for shell_call / code_interpreter_call execution)
    └── Skills (for resolving skill_reference attachments)

Containers Provider (API layer)
    ├── ContainerRuntime (delegates actual container management)
    └── Skills (for mounting skills into containers)

Skills Provider
    ├── Files (stores skill zip bundles)
    └── KVStore or SqlStore (stores skill metadata)

ContainerRuntime Provider
    └── (no OGX API dependencies — talks to Docker/Podman or Kubernetes API)
```

## Responses API Integration

### Shell Tool

When a client includes a `shell` tool in a Responses request, the server must handle three environment types:

#### `container_auto` — Ephemeral containers

1. Responses provider creates an ephemeral container via `ContainerRuntime.create_container()`.
2. If skills are attached to the request, they are mounted via `ContainerRuntime.mount_skills()`.
3. Model generates `shell_call` output items.
4. Each `shell_call` is executed via `ContainerRuntime.execute_shell()`.
5. `ShellCallOutput` (stdout, stderr, outcome) is appended to the conversation.
6. Model continues until it stops generating `shell_call` items.
7. Ephemeral container is destroyed when the response completes.

#### `container_reference` — Persistent containers

1. Client pre-creates a container via `POST /containers` (with optional skills and files).
2. Responses request references the container: `{type: "shell", environment: {type: "container_reference", container_id: "ctr_abc123"}}`.
3. Execution proceeds as above, but the container persists across requests.
4. `last_active_at` is updated on each use.
5. Multi-turn workflows use `previous_response_id` to continue conversations within the same container.

#### `local` — Client-side execution

1. Client sends Responses request with `{type: "shell", environment: {type: "local"}}`.
2. Model generates `shell_call` output items.
3. Items are streamed back to the client (no server-side execution).
4. Client executes commands locally and submits output via a follow-up `POST /responses` with `shell_call_output` input items containing stdout, stderr, and exit_code.
5. Conversation continues with the output in context.

### New Types Required in `openai_responses.py`

The following types are entirely new — none of them exist in the codebase today. The current `OpenAIResponseInputTool` union in `src/ogx_api/openai_responses.py:582` only includes `web_search`, `file_search`, `function`, and `mcp` tool types; it must be extended to include `shell` and `code_interpreter`.

**New input tool type:**

```python
class OpenAIResponseInputToolShell(BaseModel):
    type: Literal["shell"]
    environment: ShellEnvironment  # container_auto | container_reference | local


# Add to the OpenAIResponseInputTool union:
# OpenAIResponseInputTool = Annotated[
#     ... | OpenAIResponseInputToolShell,
#     Field(discriminator="type"),
# ]
```

**New output item types:**

```python
class ShellCall(BaseModel):
    type: Literal["shell_call"]
    id: str
    call_id: str
    commands: list[str]
    timeout_ms: int | None = None
    max_output_length: int | None = None
    status: Literal["completed", "failed"]


class ShellCallOutputItem(BaseModel):
    type: Literal["shell_call_output"]
    call_id: str
    stdout: str
    stderr: str
    outcome: ShellOutcome
```

**New code interpreter types (also entirely new):**

```python
class CodeInterpreterCall(BaseModel):
    type: Literal["code_interpreter_call"]
    id: str
    call_id: str
    code: str
    language: str
    status: Literal["completed", "failed"]


class CodeInterpreterCallOutput(BaseModel):
    type: Literal["code_interpreter_call_output"]
    call_id: str
    output: str
    files: list[ContainerFile]
```

> **Note:** While `ResponseItemInclude` in `src/ogx_api/responses/models.py` already references `code_interpreter_call.outputs` as an include option, no actual tool input types, output item types, or execution logic exists. All of the above must be implemented from scratch.

### Code Interpreter Integration

Since containers serve as the unified execution substrate, `code_interpreter` follows the same pattern:

1. Code interpreter requests create or reuse a container (same lifecycle as shell).
2. Model generates code → wrapped in a language-specific execution command (e.g., `python3 -c "..."` or writing to a temp file and executing).
3. Output including generated files (images, charts, data) returned via `ContainerFile` objects.
4. All code interpreter types listed above must be added to the response item union types in `openai_responses.py`.

### Skill Attachment in Responses

Skills can be attached to a Responses request in three ways:

```python
class SkillAttachment(BaseModel):
    type: Literal["skill_reference", "inline", "path"]


class SkillReferenceAttachment(SkillAttachment):
    type: Literal["skill_reference"]
    skill_id: str
    version: int | str | None = None  # None = default, "latest" = latest


class InlineSkillAttachment(SkillAttachment):
    type: Literal["inline"]
    content: str  # base64-encoded zip


class LocalSkillAttachment(SkillAttachment):
    type: Literal["path"]
    path: str  # local filesystem path (local mode only)
```

When skills are attached:

1. The Responses provider resolves the skill bundle (from Skills API for `skill_reference`, from base64 for `inline`).
2. `ContainerRuntime.mount_skills()` extracts bundles into `/mnt/skills/{skill_name}/` in the container.
3. The `SKILL.md` instructions are added to the model's system context so the model knows how to use the skill.
4. The model can invoke skill code via shell commands (e.g., `python3 /mnt/skills/data-analysis/analyze.py`).

## Security Model

### Default Posture

Following OpenAI's model:

- **Network disabled by default** — containers cannot make outbound connections unless explicitly allowed via `NetworkPolicy`.
- **No sudo/root** — containers run as an unprivileged user.
- **No interactive TTY** — commands run non-interactively with timeout enforcement.
- **Ephemeral by default** — `container_auto` containers are destroyed when the response completes.
- **Skills are untrusted code** — SKILL.md instructions are injected into model context, creating prompt injection risk. Operators should review skills before deployment.

### Operator Policy Configuration

Operators configure default policy and ceilings via distribution config:

```yaml
# Production: Kubernetes cluster with sandbox enforcement
container_runtime:
  provider_type: remote::kubernetes
  config:
    namespace: ogx-containers
    service_account: ogx-container-runtime
    sandbox_required: true
    default_image: debian:12-slim

# Development: Local Docker with direct execution
container_runtime:
  provider_type: inline::local
  config:
    runtime: docker
    sandbox_backend: none
    default_image: debian:12-slim

# Single-machine production: Local with OpenShell sandbox
container_runtime:
  provider_type: inline::local
  config:
    runtime: docker
    sandbox_backend: openshell
    sandbox_gateway_url: http://localhost:8443
    default_image: debian:12-slim
```

### Policy Layering

Request-level policy can only restrict beyond operator defaults, never expand:

1. **Operator ceiling** — set in distribution config. Defines maximum memory, allowed network domains, filesystem constraints.
2. **Request-level policy** — set in `ContainerCreateRequest` or shell tool config. Can narrow the operator ceiling (e.g., disable network even if operator allows some domains) but cannot exceed it.

If a request specifies a domain not in the operator's `allowed_network_domains`, the request is rejected with a 403 error.

### Policy Enforcement by Backend

| Concern | remote::kubernetes | inline::local (direct) | inline::local (sandbox mode) |
|---------|-------------------|----------------------|------------------------------|
| Network | Cluster-side (K8s NetworkPolicy, OpenShell, Istio) | Docker `--network=none` (basic) | Sandbox backend enforces (e.g., OpenShell policy engine) |
| Filesystem | Cluster-side (volume mounts, seccomp, sandbox) | Docker volume mounts (coarse) | Sandbox backend enforces path rules |
| Process | Cluster-side (Pod Security Standards, sandbox) | Docker default seccomp profile | Sandbox backend enforces syscall restrictions |
| Identity | Cluster-side (SPIRE, service accounts) | Docker user namespace (basic) | Sandbox backend manages identity |
| Resources | K8s resource requests/limits | Docker `--memory` / `--cpus` cgroups | Sandbox backend manages cgroups |
| Credential injection | K8s Secrets | Environment variables in `exec_run()` | Sandbox backend manages secrets |

> **Note:** For `remote::kubernetes`, security enforcement is entirely a cluster-side responsibility. OGX signals intent (`sandbox_required`, `NetworkPolicy`) but does not enforce — the cluster infrastructure (OpenShell, Kagenti, native K8s, etc.) does. For `inline::local` in direct mode, security isolation is basic. For `inline::local` in sandbox mode (e.g., with a local OpenShell Gateway), isolation is comparable to production depending on the sandbox backend and its configuration.

### Credential Masking

Network credentials (API keys, tokens) are:

- Injected into the container as environment variables.
- **Never** included in model context or logged.
- Sent in plaintext to destination domains (TLS required for security).
- Stored encrypted at rest in OGX's credential store.

## File Structure

### New files

```text
src/ogx_api/
  skills/
    __init__.py
    models.py              # Skill, SkillVersion, SkillCreateRequest, etc.
    api.py                 # Skills protocol
    fastapi_routes.py      # create_router(impl) → APIRouter

  containers/
    __init__.py
    models.py              # Container, ContainerFile, NetworkPolicy, etc.
    api.py                 # Containers protocol + ContainerRuntime protocol
    fastapi_routes.py      # create_router(impl) → APIRouter

src/ogx/providers/
  registry/
    container_runtime.py   # available_providers() for ContainerRuntime
    skills.py              # available_providers() for Skills
    containers.py          # available_providers() for Containers

  inline/
    container_runtime/
      local/
        __init__.py        # get_provider_impl()
        config.py          # LocalContainerRuntimeConfig
        impl.py            # DockerContainerRuntime

    skills/
      builtin/
        __init__.py        # get_provider_impl()
        impl.py            # BuiltinSkillsProvider (uses Files + KVStore)

    containers/
      builtin/
        __init__.py        # get_provider_impl()
        impl.py            # BuiltinContainersProvider (delegates to ContainerRuntime)

  remote/
    container_runtime/
      kubernetes/
        __init__.py        # get_adapter_impl()
        config.py          # KubernetesContainerRuntimeConfig
        impl.py            # KubernetesContainerRuntime

tests/
  unit/
    skills/                # Skills API unit tests
    containers/            # Containers API unit tests
    container_runtime/     # ContainerRuntime provider tests

  integration/
    containers/            # Integration tests with Docker backend
```

### Modified files

- `src/ogx_api/datatypes.py` — Add `Api.skills`, `Api.containers`, `Api.container_runtime` to the `Api` enum.
- `src/ogx_api/openai_responses.py` — Add `OpenAIResponseInputToolShell` and extend the `OpenAIResponseInputTool` union (currently only web_search, file_search, function, mcp). Add `ShellCall`, `ShellCallOutputItem`, `CodeInterpreterCall`, `CodeInterpreterCallOutput` output item types. All of these are new types — no existing shell or code_interpreter types exist in the codebase.
- `src/ogx/providers/inline/responses/` — Extend Responses provider to handle `shell` tool and `code_interpreter` tool by delegating to `ContainerRuntime`.
- `src/ogx/distributions/starter/` — Add optional `container_runtime` provider configuration.
- `src/ogx/distributions/ci-tests/` — Add `ci-tests-containers` configuration with `inline::local` provider.

## Testing Strategy

### Unit tests

- **Skills API**: CRUD operations, version management, SKILL.md manifest parsing (valid and malformed), zip validation (size limits, file count limits, missing SKILL.md).
- **Containers API**: CRUD operations, file upload/download, expiration logic, network policy validation, policy layering (request vs operator ceiling).
- **ContainerRuntime protocol**: Mock implementations testing the interface contract, ensuring both `inline::local` and `remote::kubernetes` backends can satisfy the protocol.
- **Shell/code interpreter integration**: Mock `ContainerRuntime`, verify the Responses provider correctly delegates `shell_call` and `code_interpreter_call` execution.
- **Response item types**: Serialization/deserialization of `ShellCall`, `ShellCallOutput`.

### Integration tests

- Use `inline::local` provider with Docker as the real backend.
- Extend the existing recording/replay system for container interactions (new recording category).
- Test scenarios:
  - `shell_call` with `container_auto` — verify ephemeral container create → execute → destroy lifecycle.
  - `shell_call` with `container_reference` — verify persistent container reuse across multiple requests.
  - Skill upload → mount → execute flow — create skill, create container with skill, execute skill code.
  - Network policy enforcement — verify `disabled` blocks outbound, `allowlist` permits only listed domains.
  - Container expiration — verify inactive containers are cleaned up after `expires_after` minutes.
  - File operations — upload file to container, list files, download content, delete file.

### CI configuration

- Add `ci-tests-containers` distribution config with `inline::local` provider.
- CI environment requires Docker-in-Docker or rootless Podman for container tests.
- Integration tests for `remote::kubernetes` run separately in environments with a K8s cluster available.

## Rollout Plan

### Phase 1: API Surface + `inline::local` Provider + Wire Compatibility Validation

- Implement `ogx_api/skills/` and `ogx_api/containers/` — full CRUD endpoints at `/v1alpha`.
- Implement `inline::local` ContainerRuntime using Docker/Podman (direct mode).
- Integrate shell tool into the Responses provider.
- **Validate wire-level compatibility** of all request/response models against the current OpenAI API spec. Update models in this RFC as needed before implementation proceeds.
- Update `docs/static/openai-coverage.json` to track Skills and Containers endpoint conformance.
- Unit and integration tests.

### Phase 2: `remote::kubernetes` Provider (Production)

- Implement `remote::kubernetes` ContainerRuntime provider.
- OGX submits container workloads via the Kubernetes API with `sandbox_required` annotation.
- Test with multiple cluster sandbox configurations (OpenShell, native K8s security, etc.).
- Document how cluster administrators configure sandbox enforcement.

### Phase 3: `inline::local` Sandbox Mode

- Add `sandbox_backend` support to `inline::local` (e.g., delegation to a local OpenShell Gateway).
- Test with OpenShell running locally using Docker, Podman, and VM compute drivers.
- Document the security trade-offs between direct mode and sandbox mode.

### Phase 4: Code Interpreter Unification

- Wire `code_interpreter_call` through `ContainerRuntime`.
- Language-specific execution wrappers (Python, Node, etc.).
- File output handling — generated images, charts, and data files returned as `ContainerFile` objects.

### Phase 5: API Graduation

- Evaluate stability, gather operator feedback.
- Graduate endpoints from `/v1alpha` → `/v1beta` → `/v1` per the API leveling process documented in `docs/docs/concepts/apis/api_leveling.mdx`.

## Open Questions

1. **Container image customization**: Should operators be able to specify custom base images for containers (e.g., with domain-specific tools pre-installed), or should the image be fixed? Custom images add flexibility but increase the attack surface. OpenShell's Gateway may manage image selection independently.

2. **Skill discovery and sharing**: OpenAI ships curated first-party skills (e.g., `openai-spreadsheets`). Should OGX have a skill registry or marketplace concept, or is CRUD + manual management sufficient for v1alpha?

3. **GPU access in containers**: OpenShell supports GPU passthrough via CDI/NVIDIA runtime. Should the `ContainerCreateRequest` model include a `gpu` field for requesting GPU access? This matters for ML-heavy skills but adds complexity to resource management.

4. **Container networking with inference providers**: When a container needs to call an inference API (e.g., a skill that uses an LLM internally), should this go through OGX's own inference endpoint (loopback) or directly to the provider? This is likely a deployment-side concern — e.g., OpenShell's Privacy Router can reroute LLM calls, and Kubernetes NetworkPolicies can restrict egress. OGX should document the pattern without implementing routing logic.

5. **Multi-tenant isolation**: If multiple users share an OGX deployment, how are containers isolated between users? The current design relies on API key-level isolation. For `remote::kubernetes`, cluster-side mechanisms (namespaces, RBAC, SPIRE workload identity) can provide stronger isolation. For `inline::local`, isolation depends on the sandbox backend configuration.

6. **Wire compatibility gaps**: The data models in this RFC are based on available OpenAI documentation and may not be fully wire-compatible. Phase 1 includes a validation step, but specific gaps (e.g., exact field names, pagination shapes, error response formats) may emerge during implementation.

## Corrections from Verification

The following corrections were applied after review against the OGX codebase and external API documentation:

1. **Api enum does not have `skills`, `containers`, or `container_runtime` today.** The `Api` enum in `src/ogx_api/datatypes.py` currently includes `inference`, `responses`, `files`, `tool_runtime`, etc. This RFC requires adding three new members (`skills`, `containers`, `container_runtime`) along with corresponding provider registry modules, router factories, and resolver wiring.

2. **Skills endpoints aligned with repo conformance metadata.** The endpoint list now includes `/skills/{skill_id}/content` and `/skills/{skill_id}/versions/{version}/content`, matching the OpenAI Skills API surface tracked in `docs/static/openai-coverage.json`.

3. **`ContainerFile` fields aligned with OpenAI wire format.** OpenAI uses `path` (not `name`), `bytes` (not `size`), and includes `object` and `source` fields. The model in this RFC now matches.

4. **`NetworkPolicy.allowed_domains` uses plain strings (OpenAI-compatible).** Credential injection via `NetworkDomainCredential` is explicitly marked as an OGX extension (`NetworkPolicyExtended`) that is not part of the OpenAI Containers API.

5. **No existing shell or code_interpreter types in the codebase.** The `OpenAIResponseInputTool` union in `src/ogx_api/openai_responses.py` currently only includes `web_search`, `file_search`, `function`, and `mcp`. All shell and code interpreter tool types, input types, and output item types must be implemented from scratch. The only existing reference is the `code_interpreter_call.outputs` string in the `ResponseItemInclude` enum — this is an include option, not an implementation.

6. **OpenShell compute driver literal is `vm`, not `microvm`.** OpenShell's documented compute drivers are `docker`, `podman`, `kubernetes`, and `vm`. The `vm` driver provides VM/MicroVM-backed isolation. Prose in this RFC describes the capability as "VM/MicroVM-backed" but uses the correct `vm` literal in configuration.

7. **OpenAI container runtime versions not authoritatively documented.** The RFC no longer claims specific runtime versions (Python 3.11, Node 22, etc.) and instead states that the default image should track what OpenAI provides at implementation time.

8. **Provider model simplified to `inline::local` and `remote::kubernetes`.** OGX is an API compatibility layer, not an infrastructure orchestrator. Sandbox technology selection (OpenShell, agent-sandbox, Kagenti, gVisor, etc.) is a deployment-side decision, not an OGX provider concern. `inline::local` handles local execution with an optional sandbox backend (e.g., local OpenShell Gateway). `remote::kubernetes` delegates to K8s and exposes a `sandbox_required` knob. OpenShell and Kagenti are not OGX providers — they are infrastructure that operates beneath Docker/Podman or Kubernetes.

9. **`inline::local` elevated to first-class provider.** Not dev-only — it is a fully functional provider suitable for development, testing, CI, and single-machine deployments, with clear documentation of security trade-offs. Optional sandbox mode (e.g., local OpenShell Gateway) provides production-grade isolation without Kubernetes.

10. **OpenAI conformance language tightened.** The RFC does not claim full OpenAI conformance. Wire-level validation against the current OpenAI API spec is an explicit Phase 1 deliverable. Data models are based on available documentation and may require adjustment.

## References

- [OpenAI Skills API Guide](https://developers.openai.com/api/docs/guides/tools-skills)
- [OpenAI Shell Tool Guide](https://developers.openai.com/api/docs/guides/tools-shell)
- [OpenAI Code Interpreter Containers Guide](https://developers.openai.com/api/docs/guides/tools-code-interpreter#containers)
- [OpenAI Containers API Reference](https://developers.openai.com/api/reference/resources/containers)
- [Agent Skills Standard](https://agentskills.io)
- [NVIDIA OpenShell](https://github.com/NVIDIA/OpenShell) / [OpenShell Docs](https://docs.nvidia.com/openshell/latest/home)
- [Kagenti](https://kagenti.github.io/.github/)
- [OGX API Leveling](docs/docs/concepts/apis/api_leveling.mdx)
- [OGX Microservices Decomposition RFC](docs/rfcs/2026-04-30-microservices-decomposition.md)
