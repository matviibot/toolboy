/* toolboy trust chrome — host-drawn, unspoofable. Near-solid (NOT glass), sits
   above everything with a system scrim. Permission summary → secret entry → grant.
   A tool can never draw or imitate this. */
import { useState } from "react";
import type { CSSProperties } from "react";
import { Button, PermissionLine, Badge, Icon } from "../components";
import type { AggPerms, Origin, Perms } from "./types";

export interface TrustSubject {
  name: string;
  kind: "tool" | "toolchain";
  origin: Origin;
  toolCount: number;
}

export interface TrustDialogProps {
  subject: TrustSubject;
  perms: Perms | AggPerms;
  secretsNeeded: string[];
  onGrant: (secrets: Record<string, string>) => void;
  onCancel: () => void;
}

export function TrustDialog({ subject, perms, secretsNeeded, onGrant, onCancel }: TrustDialogProps) {
  const [stage, setStage] = useState<"summary" | "secret">("summary");
  const [secretVals, setSecretVals] = useState<Record<string, string>>({});
  const isPublic = subject.origin === "public";

  const netDomains: string[] = (perms.net || []).map((n) => (typeof n === "string" ? n : n.domain));
  const needsSecret = (perms.secrets || []).length > 0;
  const proceed = () => { if (needsSecret) setStage("secret"); else onGrant({}); };

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: "var(--z-system)",
        background: "var(--system-scrim)",
        backdropFilter: "blur(3px) saturate(120%)", WebkitBackdropFilter: "blur(3px) saturate(120%)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
        animation: "tbFade var(--dur-base) var(--ease-out)",
      } as CSSProperties}
    >
      <div
        role="dialog"
        aria-modal="true"
        style={{
          width: "min(480px, 94vw)",
          background: "var(--system-fill)",
          border: "1px solid var(--system-stroke)",
          borderRadius: "var(--radius-xl)",
          boxShadow: "var(--shadow-4), 0 0 0 1px var(--accent-faint), 0 0 60px var(--accent-faint)",
          overflow: "hidden",
          animation: "tbPaletteIn var(--dur-base) var(--ease-out)",
        }}
      >
        {/* SYSTEM header band — clearly host chrome */}
        <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "13px 18px", borderBottom: "1px solid var(--glass-stroke)", background: "var(--accent-faint)" }}>
          <span style={{ display: "inline-grid", placeItems: "center", width: 28, height: 28, borderRadius: "var(--radius-sm)", background: "var(--accent)", color: "#fff" }}>
            <Icon name="shield-check" size={16} />
          </span>
          <span className="tb-eyebrow" style={{ color: "var(--accent)" }}>toolboy · permission</span>
          <span style={{ marginLeft: "auto", font: "var(--type-kbd)", color: "var(--fg-4)", letterSpacing: "var(--tracking-caps)", textTransform: "uppercase" }}>system</span>
        </div>

        {stage === "summary" && (
          <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
              <span style={{ display: "inline-grid", placeItems: "center", width: 40, height: 40, borderRadius: "var(--radius-md)", background: isPublic ? "var(--public-soft)" : "var(--accent-soft)", color: isPublic ? "var(--public)" : "var(--accent)" }}>
                <Icon name={subject.kind === "toolchain" ? "workflow" : "box"} size={20} />
              </span>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ font: "var(--type-heading)", color: "var(--fg-1)" }}>{subject.name}</span>
                  <Badge tone={isPublic ? "public" : "yours"}>{isPublic ? "public" : "yours"}</Badge>
                </div>
                <span style={{ font: "var(--type-caption)", color: "var(--fg-3)" }}>
                  {subject.kind === "toolchain" ? `Scene of ${subject.toolCount} tools wants to run` : "This tool wants to run"}
                </span>
              </div>
            </div>

            {isPublic && (
              <div style={{ display: "flex", gap: 9, alignItems: "flex-start", padding: "10px 12px", borderRadius: "var(--radius-md)", background: "var(--public-faint)", border: "1px solid var(--public-ring)" }}>
                <span style={{ color: "var(--public)", flex: "none", marginTop: 1, display: "inline-flex" }}><Icon name="info" size={16} /></span>
                <span style={{ font: "var(--type-caption)", color: "var(--fg-2)" }}>Public code from a guest repo. Review what it can touch before granting.</span>
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              <span className="tb-eyebrow">Will be able to</span>
              {perms.storage && <PermissionLine kind="storage" value="namespaced" detail="Read & write its own local data" />}
              {(perms.secrets || []).map((s) => (
                <PermissionLine key={s} kind="secret" value={s} detail="Injected by the host; never seen by tool code" />
              ))}
              {netDomains.map((d) => (
                <PermissionLine key={d} kind="net" value={d} detail="Reach this domain only" />
              ))}
              {!perms.storage && !(perms.secrets || []).length && !netDomains.length && (
                <div style={{ font: "var(--type-caption)", color: "var(--fg-3)", padding: "6px 2px" }}>Nothing — fully offline, no storage.</div>
              )}
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 2 }}>
              <Button variant="ghost" onClick={onCancel}>Cancel</Button>
              <Button variant="primary" origin={isPublic ? "public" : undefined} onClick={proceed} iconLeft={<Icon name={needsSecret ? "key" : "check"} size={16} />}>
                {needsSecret ? "Continue" : "Grant & run"}
              </Button>
            </div>
          </div>
        )}

        {stage === "secret" && (
          <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ font: "var(--type-heading)", color: "var(--fg-1)" }}>Add a secret</span>
              <span style={{ font: "var(--type-caption)", color: "var(--fg-3)" }}>Stored in your local keyring. Never shared with tool code, never sent to our servers.</span>
            </div>
            {secretsNeeded.map((s) => (
              <div key={s} style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                <span style={{ font: "var(--type-mono-sm)", color: "var(--public)" }}>{s}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 13px", borderRadius: "var(--radius-md)", background: "var(--secret-field)", border: "1px solid var(--accent-ring)", boxShadow: "inset 0 1px 2px rgba(0,0,0,0.2)" }}>
                  <span style={{ color: "var(--fg-3)", flex: "none", display: "inline-flex" }}><Icon name="key-round" size={16} /></span>
                  <input
                    type="password"
                    placeholder="sk-…"
                    value={secretVals[s] || ""}
                    onChange={(e) => setSecretVals((v) => ({ ...v, [s]: e.target.value }))}
                    style={{ flex: 1, border: "none", outline: "none", background: "transparent", color: "var(--fg-1)", font: "var(--type-mono)" }}
                  />
                  <span style={{ color: "var(--ok)", flex: "none", display: "inline-flex" }}><Icon name="lock" size={14} /></span>
                </div>
              </div>
            ))}
            <div style={{ display: "flex", gap: 8, alignItems: "center", font: "var(--type-caption)", color: "var(--fg-3)" }}>
              <span style={{ color: "var(--ok)", display: "inline-flex" }}><Icon name="shield" size={14} /></span>
              Entered in host chrome — outside any tool's frame.
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <Button variant="ghost" onClick={() => setStage("summary")}>Back</Button>
              <Button variant="primary" onClick={() => onGrant(secretVals)} iconLeft={<Icon name="check" size={16} />}>Save & run</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
