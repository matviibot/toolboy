/* Color Picker — a toolboy-native tool. Persists the last color via ctx.storage
   and emits the selection on its output port. No input port. */
toolboy.tool(function (ctx, root) {
  var swatches = ["#3D7FFF", "#22B07D", "#E6A23C", "#E0556B", "#8B5CF6", "#16B1C9"];
  var current = swatches[0];

  root.innerHTML =
    '<div style="padding:22px;display:flex;flex-direction:column;gap:16px;height:100%">' +
    '  <div id="preview" style="height:86px;border-radius:var(--radius-lg);box-shadow:var(--shadow-2);border:1px solid var(--glass-stroke)"></div>' +
    '  <div id="row" style="display:flex;gap:8px;flex-wrap:wrap"></div>' +
    '  <div id="label" class="tb-mono" style="color:var(--fg-2);margin-top:auto"></div>' +
    "</div>";

  var preview = root.querySelector("#preview");
  var row = root.querySelector("#row");
  var label = root.querySelector("#label");

  function render() {
    preview.style.background = current;
    label.textContent = current.toUpperCase() + " · x-toolboy/color";
    Array.prototype.forEach.call(row.children, function (b) {
      b.style.border = b.dataset.c === current ? "2px solid var(--fg-1)" : "1px solid var(--glass-stroke)";
    });
  }

  function pick(c, announce) {
    current = c;
    render();
    ctx.bus.emit("out", c);
    ctx.storage.set("last", c);
    if (announce) ctx.ui.toast("Saved " + c.toUpperCase(), "success");
  }

  swatches.forEach(function (c) {
    var b = document.createElement("button");
    b.dataset.c = c;
    b.style.cssText =
      "width:34px;height:34px;border-radius:var(--radius-sm);cursor:pointer;box-shadow:var(--shadow-1);background:" + c;
    b.onclick = function () { pick(c, true); };
    row.appendChild(b);
  });

  // restore the last pick from this tool's namespaced storage
  ctx.storage.get("last").then(function (saved) {
    pick(typeof saved === "string" ? saved : current, false);
  });
});
