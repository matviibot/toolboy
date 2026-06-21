/* Hello — a minimal toolboy tool, framework-free.
 *
 * Shows the four things almost every tool touches: render into `root`, persist with
 * ctx.storage, receive on an input port and emit on an output port via ctx.bus, and
 * surface feedback with ctx.ui.toast. No build step — this file runs verbatim in the
 * sandbox. (For a React/TypeScript tool, author against @toolboy/sdk and bundle to a
 * single classic script; see the README.) */
toolboy.tool(function (ctx, root) {
  root.innerHTML =
    '<div style="padding:22px;display:flex;flex-direction:column;gap:14px;font-family:system-ui">' +
    '  <label class="tb-mono" style="color:var(--fg-2)">Your name</label>' +
    '  <input id="name" style="padding:10px 12px;border-radius:var(--radius-sm);border:1px solid var(--glass-stroke);background:transparent;color:var(--fg-1)" />' +
    '  <div id="out" style="font-size:18px;color:var(--fg-1)"></div>' +
    "</div>";

  var input = root.querySelector("#name");
  var out = root.querySelector("#out");

  function greet(name) {
    var msg = name ? "Hello, " + name + " 👋" : "Hello there 👋";
    out.textContent = msg;
    ctx.bus.emit("out", msg); // hand the greeting to any wired downstream tool
  }

  input.addEventListener("input", function () {
    greet(input.value.trim());
    ctx.storage.set("name", input.value.trim()); // persist per-tool, namespaced
  });

  // a wired upstream tool can drive this one through the "in" port
  ctx.bus.on("in", function (value) {
    input.value = String(value);
    greet(input.value.trim());
    ctx.ui.toast("Received input", "info");
  });

  // restore the last name from this tool's storage
  ctx.storage.get("name").then(function (saved) {
    input.value = typeof saved === "string" ? saved : "";
    greet(input.value.trim());
  });
});
