/* toolboy shell — adding a repo on purpose.

   Loading a repo used to mean knowing to type `gh:owner/repo@ref` into the search box
   and trusting that it worked. That's a fine power-user path and a terrible only path:
   the syntax is undiscoverable, and a typo is indistinguishable from an empty result.

   So: an explicit panel that checks before it commits. It answers the two questions that
   actually fail — does the repo resolve, and is there a valid toolboy.json in it — and
   won't let you add something it couldn't confirm. The check is debounced while typing
   and re-run on Enter, and `ref` is optional (defaults to main). */
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Icon, Input, Kbd } from "../components";
import { probeSource, type SourceProbe } from "../loader/load";
import { normalizeUserSource } from "../loader/resolver";

const DEBOUNCE_MS = 450;

type Check = { state: "idle" | "checking" } | { state: "done"; result: SourceProbe };

export function AddRepo({ onAdd, onCancel }: { onAdd: (spec: string) => void; onCancel: () => void }) {
  const [raw, setRaw] = useState("");
  const [check, setCheck] = useState<Check>({ state: "idle" });
  // only the newest probe may write state — an earlier, slower one landing last would
  // show a verdict for a repo the user has already typed past
  const run = useRef(0);

  const spec = normalizeUserSource(raw);

  const probe = useCallback((s: string) => {
    const seq = ++run.current;
    setCheck({ state: "checking" });
    probeSource(s).then((result) => {
      if (seq === run.current) setCheck({ state: "done", result });
    });
  }, []);

  useEffect(() => {
    run.current++; // invalidate anything in flight for the previous text
    if (!spec) { setCheck({ state: "idle" }); return; }
    const t = window.setTimeout(() => probe(spec), DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [spec, probe]);

  const ok = check.state === "done" && check.result.ok;
  const add = () => { if (ok && spec) onAdd(spec); };

  return (
    <div style={{ padding: "16px 18px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Icon name="git-branch" size={15} />
        <span style={{ font: "var(--type-label)", color: "var(--fg-1)" }}>Add a repository</span>
      </div>

      <Input
        size="lg"
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); ok ? add() : spec && probe(spec); }
          if (e.key === "Escape") { e.preventDefault(); onCancel(); }
        }}
        placeholder="owner/repo"
        autoFocus
      />

      <Status check={check} raw={raw} spec={spec} />

      <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
        <Button
          variant="primary"
          size="sm"
          disabled={!ok}
          iconLeft={<Icon name="plus" size={15} />}
          style={{ flex: 1, opacity: ok ? 1 : 0.5 }}
          onClick={add}
        >
          Add repository
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

function Status({ check, raw, spec }: { check: Check; raw: string; spec: string | null }) {
  const line = (color: string, icon: string, text: React.ReactNode, spin = false) => (
    <div style={{ display: "flex", alignItems: "center", gap: 7, minHeight: 20, font: "var(--type-caption)", color }}>
      <Icon name={icon} size={13} style={spin ? { animation: "tbSpin 0.9s linear infinite" } : undefined} />
      <span>{text}</span>
    </div>
  );

  if (check.state === "checking") return line("var(--fg-3)", "loader", "Checking…", true);

  if (check.state === "done") {
    const r = check.result;
    if (r.ok) {
      const bits = [
        `${r.tools} tool${r.tools === 1 ? "" : "s"}`,
        ...(r.toolchains ? [`${r.toolchains} toolchain${r.toolchains === 1 ? "" : "s"}`] : []),
      ];
      return line("var(--ok)", "check", <>“{r.repoName}” · {bits.join(" · ")} · pinned to {r.pin.slice(0, 7)}</>);
    }
    return line("var(--danger)", "x", r.reason);
  }

  // idle: nothing typed yet, or what's typed isn't a repo reference at all
  if (raw.trim() && !spec) return line("var(--fg-4)", "info", "Expected owner/repo, optionally with @ref");
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, minHeight: 20, font: "var(--type-caption)", color: "var(--fg-4)" }}>
      <span>Defaults to <Kbd>@main</Kbd> · private repos need a token</span>
    </div>
  );
}
