/* jq — receives JSON on its input port, applies a tiny dotted-path filter, and
   emits the result. Remembers the last query in ctx.storage. */
toolboy.tool(function (ctx, root) {
  var data = { name: "toolboy", stars: 128, open_issues: 7 };
  var query = ".name";

  root.innerHTML =
    '<div style="padding:22px;display:flex;flex-direction:column;gap:12px;height:100%">' +
    '  <input id="q" class="tb-mono" style="padding:10px 13px;color:var(--fg-1);outline:none;border-radius:var(--radius-md);background:var(--glass-fill-inset);border:1px solid var(--glass-stroke-lo)" />' +
    '  <pre id="out" class="tb-mono" style="margin:0;padding:13px;flex:1;overflow:auto;color:var(--accent);background:var(--glass-fill-inset);border:1px solid var(--glass-stroke-lo);border-radius:var(--radius-md)"></pre>' +
    "</div>";

  var input = root.querySelector("#q");
  var out = root.querySelector("#out");

  function apply() {
    var path = query.replace(/^\./, "").trim();
    var result = path === "" ? data : path in data ? data[path] : data;
    out.textContent = JSON.stringify(result, null, 2);
    ctx.bus.emit("out", result);
  }

  input.value = query;
  input.oninput = function () {
    query = input.value;
    ctx.storage.set("query", query);
    apply();
  };

  // data arriving on the input port re-runs the filter
  ctx.bus.on("in", function (value) {
    if (value && typeof value === "object") data = value;
    apply();
  });

  ctx.storage.get("query").then(function (saved) {
    if (typeof saved === "string") { query = saved; input.value = saved; }
    apply();
  });
});
