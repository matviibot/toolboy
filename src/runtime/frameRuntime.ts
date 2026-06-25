/* toolboy runtime — the code that runs INSIDE the sandboxed iframe.

   It is injected into the frame's srcdoc as a classic <script> (the frame has an
   opaque origin and `connect-src 'none'`, so it cannot import or fetch anything).
   Its whole job: wait for the host to transfer a MessagePort, build `ctx` as a
   thin proxy over that port, and hand `ctx` to the tool's registered mount fn.

   A tool bundle is also a classic script that calls the one global we expose:

       toolboy.tool(function (ctx, root) { ...; return optionalCleanup });

   That mount primitive is deliberately framework-free. The `@toolboy/sdk` React
   flavor is sugar over it:

       toolboy.tool((ctx, root) => { const r = createRoot(root);
         r.render(<Tool ctx={ctx} />); return () => r.unmount(); });

   Kept as a string (not a module) because it must execute verbatim inside the
   frame. ES2017 so it runs as-is with no transpile step in the sandbox. */

export const FRAME_RUNTIME_SRC = String.raw`
(function () {
  var pendingMount = null;
  var ctx = null;
  var port = null;
  var rpcSeq = 0;
  var pending = {};         // rpc id -> { resolve, reject }
  var inputHandlers = {};   // port id -> [fn]

  // the single global a tool bundle registers against
  window.toolboy = {
    tool: function (fn) { pendingMount = fn; mountIfReady(); }
  };

  // A focused frame swallows keydown, so the host's window-level shortcuts stop
  // firing once a tool has focus. Catch the host-owned ones here and forward them
  // back over the port — the host runs the actual action (opening the palette).
  window.addEventListener("keydown", function (e) {
    if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
      e.preventDefault();
      if (port) port.postMessage({ k: "hotkey", combo: "cmd-k" });
    }
  });

  function rpc(ns, fn, args) {
    return new Promise(function (resolve, reject) {
      var id = ++rpcSeq;
      pending[id] = { resolve: resolve, reject: reject };
      port.postMessage({ k: "rpc", id: id, ns: ns, fn: fn, args: args });
    });
  }

  function makeResponse(r) {
    return {
      ok: r.ok, status: r.status, statusText: r.statusText, headers: r.headers || {},
      text: function () { return Promise.resolve(r.body); },
      json: function () { return Promise.resolve(JSON.parse(r.body)); }
    };
  }

  function buildCtx(init) {
    return {
      storage: {
        get: function (k) { return rpc("storage", "get", [k]); },
        set: function (k, v) { return rpc("storage", "set", [k, v]); },
        "delete": function (k) { return rpc("storage", "delete", [k]); },
        keys: function () { return rpc("storage", "keys", []); }
      },
      // raw secret values never cross the boundary — only existence, for UI branching
      secrets: { has: function (name) { return rpc("secrets", "has", [name]); } },
      net: { fetch: function (input, opts) { return rpc("net", "fetch", [input, opts || null]).then(makeResponse); } },
      bus: {
        emit: function (p, value) { port.postMessage({ k: "emit", port: p, value: value }); },
        on: function (p, fn) {
          (inputHandlers[p] = inputHandlers[p] || []).push(fn);
          return function () {
            inputHandlers[p] = (inputHandlers[p] || []).filter(function (f) { return f !== fn; });
          };
        }
      },
      ui: {
        toast: function (message, tone) { port.postMessage({ k: "toast", message: String(message), tone: tone || "info" }); },
        theme: init.theme
      },
      meta: { id: init.toolId, visibility: init.visibility }
    };
  }

  function applyTheme(vars) {
    if (!vars) return;
    var root = document.documentElement;
    for (var key in vars) {
      if (Object.prototype.hasOwnProperty.call(vars, key)) root.style.setProperty(key, vars[key]);
    }
  }

  function mountIfReady() {
    if (!pendingMount || !ctx) return;
    var fn = pendingMount;
    pendingMount = null;
    try {
      fn(ctx, document.getElementById("root"));
    } catch (e) {
      port.postMessage({ k: "toast", message: "Tool error: " + (e && e.message), tone: "error" });
    }
  }

  function onPortMessage(ev) {
    var m = ev.data;
    if (!m) return;
    if (m.k === "rpc-res") {
      var p = pending[m.id];
      if (!p) return;
      delete pending[m.id];
      if (m.ok) p.resolve(m.value); else p.reject(new Error(m.error || "rpc failed"));
    } else if (m.k === "input") {
      var hs = inputHandlers[m.port] || [];
      for (var i = 0; i < hs.length; i++) { try { hs[i](m.value); } catch (e) {} }
    } else if (m.k === "theme") {
      applyTheme(m.vars);
    }
  }

  // host transfers the MessagePort via a single window.postMessage. Accept it ONLY
  // from our host (window.parent) and ONLY once — then de-register, so no later or
  // forged init-port from any other source can swap out the ctx channel.
  function onInit(ev) {
    var m = ev.data;
    if (!m || m.k !== "init-port" || !ev.ports || !ev.ports[0]) return;
    if (ev.source && ev.source !== window.parent) return; // not from the host
    if (port) return;                                      // already initialized
    window.removeEventListener("message", onInit);
    port = ev.ports[0];
    port.onmessage = onPortMessage;
    applyTheme(m.theme && m.theme.vars);
    ctx = buildCtx({ toolId: m.toolId, visibility: m.visibility, theme: { name: m.theme.name, vars: (m.theme.vars || {}) } });
    port.postMessage({ k: "ready" });
    mountIfReady();
  }
  window.addEventListener("message", onInit);
})();
`;
