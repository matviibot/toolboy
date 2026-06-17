/* JSON View — a terminal pane. Pretty-prints whatever lands on its input port.
   No output port; it's a sink. */
toolboy.tool(function (ctx, root) {
  root.innerHTML =
    '<div style="padding:22px;height:100%">' +
    '  <pre id="out" class="tb-mono" style="margin:0;padding:14px;height:100%;overflow:auto;color:var(--fg-1);background:var(--glass-fill-inset);border:1px solid var(--glass-stroke-lo);border-radius:var(--radius-md)"></pre>' +
    "</div>";

  var out = root.querySelector("#out");
  function show(v) { out.textContent = JSON.stringify(v, null, 2); }

  show({ waiting: "wire an input →" });
  ctx.bus.on("in", show);
});
