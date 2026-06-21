/* @toolboy/sdk/react — React sugar over the framework-free `tool()` primitive.
 *
 * `defineTool(Component)` mounts a React component and passes it `ctx`, wiring React's
 * root lifecycle to toolboy's mount/unmount. Equivalent to calling `tool()` yourself
 * with createRoot/unmount. React + react-dom are peer deps (optional in the SDK, since
 * the core needs neither) — a tool that uses this must depend on them.
 */

import { createElement, type ComponentType } from "react";
import { createRoot } from "react-dom/client";
import { tool, type ToolContext } from "./index";

/** Register a React component as a tool. It receives `{ ctx }`.

    ```tsx
    import { defineTool } from "@toolboy/sdk/react";
    import type { ToolContext } from "@toolboy/sdk";

    function Hello({ ctx }: { ctx: ToolContext }) {
      return <button onClick={() => ctx.ui.toast("hi", "success")}>{ctx.meta.id}</button>;
    }
    defineTool(Hello);
    ``` */
export function defineTool(Component: ComponentType<{ ctx: ToolContext }>): void {
  tool((ctx, root) => {
    const r = createRoot(root);
    r.render(createElement(Component, { ctx }));
    return () => r.unmount();
  });
}
