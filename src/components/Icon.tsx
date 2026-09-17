import type { CSSProperties } from "react";
import {
  ArrowRight, Box, Braces, Check, Columns2, Command, Database, Download, FolderOpen,
  GitBranch, Globe, Info, Key, KeyRound, ListTree, Loader, Lock, Moon, Pipette, Plus,
  Regex, Search, Shield, ShieldCheck, Sparkles, Star, Sun, Upload, Workflow, X,
  type LucideIcon,
} from "lucide-react";

/**
 * Icon — Lucide line icon by kebab-case name (matches manifest `icon` strings).
 * Stroke weight 1.75px, currentColor, line style throughout (per ICONOGRAPHY).
 *
 * Registry is the curated set the shell uses; an unknown name falls back to
 * `box`. (A production build would resolve arbitrary manifest names from a
 * lazily-loaded Lucide set — kept explicit here so the bundle stays lean.)
 */
const REGISTRY: Record<string, LucideIcon> = {
  "arrow-right": ArrowRight,
  box: Box,
  braces: Braces,
  check: Check,
  "columns-2": Columns2,
  command: Command,
  database: Database,
  download: Download,
  folder: FolderOpen,
  "git-branch": GitBranch,
  globe: Globe,
  info: Info,
  key: Key,
  "key-round": KeyRound,
  "list-tree": ListTree,
  loader: Loader,
  lock: Lock,
  moon: Moon,
  pipette: Pipette,
  plus: Plus,
  regex: Regex,
  search: Search,
  shield: Shield,
  "shield-check": ShieldCheck,
  sparkles: Sparkles,
  star: Star,
  sun: Sun,
  upload: Upload,
  workflow: Workflow,
  x: X,
};

export function Icon({ name, size = 18, style }: { name: string; size?: number; style?: CSSProperties }) {
  const Cmp = REGISTRY[name] ?? Box;
  return <Cmp size={size} strokeWidth={1.75} style={style} />;
}
