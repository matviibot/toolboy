/* toolboy shell — the vault's bit of host chrome.

   Exporting, importing, and connecting the folder the vault mirrors into. Small on
   purpose: the vault's job is to be boring and out of the way, and the only thing the
   user should have to think about is "is there a copy of this somewhere". The status
   line answers exactly that. */
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Glass, Icon, IconButton } from "../components";
import {
  connectFolder,
  disconnectFolder,
  exportToFile,
  importFromFile,
  regrantFolder,
  status as vaultStatus,
  type VaultStatus,
} from "./vault";

const when = (ts?: number): string => {
  if (!ts) return "not yet";
  const mins = Math.floor((Date.now() - ts) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

export function VaultMenu({ onToast }: { onToast: (m: string, t: "info" | "success" | "error") => void }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<VaultStatus>({ state: "off" });
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => {
    void vaultStatus().then(setStatus);
  }, []);
  useEffect(refresh, [refresh]);
  // the mirror writes on a debounce, so the "last saved" line goes stale while open
  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(refresh, 5_000);
    return () => window.clearInterval(id);
  }, [open, refresh]);

  const guard = async (run: () => Promise<unknown>, fail: string) => {
    try {
      await run();
      refresh();
    } catch (err) {
      // an aborted directory picker is the user saying no, not an error worth a toast
      if (err instanceof DOMException && err.name === "AbortError") return;
      onToast(`${fail}: ${err instanceof Error ? err.message : err}`, "error");
    }
  };

  const onPick = async (file: File | undefined) => {
    if (!file) return;
    try {
      const { favourites, entries } = await importFromFile(file);
      onToast(`Imported ${entries} item${entries === 1 ? "" : "s"}, ${favourites} new favourite${favourites === 1 ? "" : "s"}`, "success");
      // tools read their storage at mount, so a reload is what makes an import visible
      setTimeout(() => window.location.reload(), 900);
    } catch (err) {
      onToast(`Couldn't import: ${err instanceof Error ? err.message : err}`, "error");
    }
  };

  const folderLine = () => {
    if (status.state === "unsupported") return "Folder mirroring needs a Chromium browser.";
    if (status.state === "ready") return `Mirroring to ${status.folder} · saved ${when(status.lastSavedAt)}`;
    if (status.state === "needs-permission") return `${status.folder} needs access again`;
    return "No folder connected — export is your only copy.";
  };

  return (
    <div style={{ position: "relative" }}>
      <IconButton label="Vault — export, import, mirror" active={open} onClick={() => { setOpen((o) => !o); refresh(); }}>
        <Icon name="database" size={17} />
      </IconButton>

      {open && (
        <Glass
          elevation="popover"
          style={{
            position: "absolute", top: "calc(100% + 8px)", right: 0, width: 308, padding: 16,
            display: "flex", flexDirection: "column", gap: 12, zIndex: 1,
            animation: "tbFade var(--dur-base) var(--ease-out)",
          }}
        >
          <div style={{ font: "var(--type-label)", color: "var(--fg-1)" }}>Vault</div>

          <div style={{ font: "var(--type-caption)", color: "var(--fg-3)", lineHeight: 1.5 }}>
            Your favourites and everything your tools have saved. Browser storage is tied to
            this exact address — the vault is the copy that isn't.
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <Button size="sm" iconLeft={<Icon name="download" size={15} />} style={{ flex: 1 }}
              onClick={() => void guard(exportToFile, "Couldn't export")}>
              Export
            </Button>
            <Button size="sm" style={{ flex: 1 }} onClick={() => fileRef.current?.click()}>
              Import
            </Button>
          </div>

          <div style={{ height: 1, background: "var(--glass-stroke-lo)" }} />

          <div style={{ font: "var(--type-caption)", color: status.state === "needs-permission" ? "var(--warn)" : "var(--fg-3)" }}>
            {folderLine()}
          </div>

          {status.state === "off" && (
            <Button size="sm" variant="primary" onClick={() => void guard(connectFolder, "Couldn't connect a folder")}>
              Connect a folder
            </Button>
          )}
          {status.state === "needs-permission" && (
            <Button size="sm" variant="primary" onClick={() => void guard(regrantFolder, "Couldn't re-grant access")}>
              Grant access
            </Button>
          )}
          {status.state === "ready" && (
            <Button size="sm" variant="ghost" onClick={() => void guard(disconnectFolder, "Couldn't disconnect")}>
              Disconnect folder
            </Button>
          )}

          <div style={{ font: "var(--type-caption)", color: "var(--fg-4)", display: "flex", alignItems: "center", gap: 6 }}>
            <Icon name="lock" size={12} />
            Secrets in your keyring are never included.
          </div>

          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            style={{ display: "none" }}
            onChange={(e) => {
              void onPick(e.target.files?.[0]);
              e.target.value = ""; // let the same file be picked twice
            }}
          />
        </Glass>
      )}
    </div>
  );
}
