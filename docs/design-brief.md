# UI-agnostic design brief

The prompt below is the canonical visual brief for toolboy. It's deliberately
implementation-agnostic — it describes the *experience* and *visual system*, not
components or framework. Hand it to a design generation pass; lock the resulting tokens.

---

```
Design "toolboy" — a personal toolbox. A calm, near-empty home surface from which the
user summons small single-purpose tools (and saved compositions of them) through a
command palette, then runs them full-surface or several side by side.

OVERALL FEEL
Quiet, spacious, glassmorphism. Frosted translucent panels with soft blur over a
subtle ambient gradient; thin light-catching borders; depth from layered shadow, not
hard edges. Generous whitespace, restrained palette, one accent color. A precision
utility, not a dashboard — nothing competes for attention until summoned. Fast, fluid
micro-motion; nothing bounces or distracts. Intentional in both light and dark.

THE HOME SURFACE
Near-empty by default: the app mark and a faint hint that Cmd+K opens search.
Optionally a small set of pinned/recent items as glass cards. The emptiness is the
point — a launchpad, not a control center. A quiet, non-blocking "updates available"
affordance may live at the edge; it never interrupts.

COMMAND PALETTE (Cmd+K) — the core interaction
Cmd+K floats a centered glass popover: one search field over a live result list.
Results mix two kinds of entity, visually distinguishable at a glance:
  - TOOLS — a single tool (icon, name, short description).
  - TOOLCHAINS — a saved composition of several tools wired together; should read as
    "a scene", not a single tool.
Each result also signals its ORIGIN: something the user authored/owns vs. a PUBLIC tool
pulled in from someone else's shared repo. Public entities read as trusted-but-guest
(a subtle badge/border treatment), never second-class. Fuzzy search, full keyboard
control (arrows + enter), instant. Enter opens; a modifier (e.g. Cmd+Enter) opens into
a new split pane. Escape dismisses. The palette feels weightless — appears instantly,
dims the surface behind it.

OPENING A TOOL
A tool opens into a clean glass workspace panel filling the surface. Minimal header:
name, an origin marker, a "split" affordance, close. The tool owns its content area
entirely — the shell provides only the frame. IMPORTANT: a tool's interior may NOT
match toolboy's visual language (tools are sandboxed and authored by anyone). Design
the frame so a foreign-looking interior still sits gracefully inside the glass shell.

SPLIT & TOOLCHAINS (up to N panes)
The user can run multiple tools side by side in resizable glass panes with draggable
dividers; show how panes are added, closed, and rearranged, and how the surface stays
one continuous glass plane rather than separate windows.
Tools can pass data to each other. Each tool exposes typed INPUT/OUTPUT ports. The user
connects a pane's output to a compatible pane's input via a clear, low-friction gesture
(e.g. "send output → [pane]"); only type-compatible targets are offered. A connected
pair shows a subtle, legible WIRED indicator — the user should always be able to see
what feeds what. When a connection is made, the downstream pane reflects the latest
value immediately (data is sticky), so wiring feels alive, not inert.
A TOOLCHAIN is this whole arrangement — tools + layout + wiring — saved and reopened as
one. Design how opening a toolchain reconstructs the multi-pane scene.

TRUST & PERMISSIONS (host chrome — must be unspoofable)
Before a tool runs, the shell surfaces a concise PERMISSION SUMMARY of what it has
declared it needs: local storage, named secrets/API keys, and which network domains.
For a toolchain, this is one aggregated summary for the whole scene. Secret entry and
grant dialogs are drawn by the shell itself and must be visually distinct from any tool
content — a tool can never be mistaken for, or imitate, these dialogs. Make them feel
authoritative and clearly "system", outside the tool's frame.

DELIVER
- Home / empty surface
- Cmd+K palette: empty state, and with mixed tool + toolchain results showing origin
- A single tool open (including the foreign-interior case)
- A multi-pane toolchain with at least one visible wire between ports
- A permission/trust dialog as host chrome (with a secret-entry moment)
Define the glass material recipe (blur, border, shadow, translucency), type scale,
spacing system, accent, motion language, and light + dark. Keep everything
implementation-agnostic — describe the experience and the visual system, not specific
components or framework.
```
