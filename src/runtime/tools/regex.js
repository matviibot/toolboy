/* Regex Lab — a FOREIGN tool (neon dark terminal look). Sandboxed; matches a
   pattern against incoming text and emits the matches as text. */
toolboy.tool(function (ctx, root) {
  var pattern = "(\\w+)@(\\w+)";
  var subject = "user@toolboy host@local";

  root.innerHTML =
    '<div style="height:100%;background:#0a0e0a;color:#7CFFB2;font-family:\'Courier New\',monospace;padding:20px;display:flex;flex-direction:column;gap:12px">' +
    '  <div style="color:#5BE0FF;font-size:13px">// regex-lab v2 — sandboxed</div>' +
    '  <input id="pat" style="border:1px solid #1f3a28;padding:8px 10px;border-radius:4px;background:#0d140d;color:#7CFFB2;font-family:inherit;outline:none" />' +
    '  <div style="font-size:13px;line-height:1.7">matched: <span id="count" style="color:#FFE45B">0</span></div>' +
    '  <div id="src" style="color:#4f7a5e;font-size:13px;word-break:break-all"></div>' +
    '  <div style="margin-top:auto;color:#3a5a44;font-size:11px">acme/scenes · looks nothing like toolboy</div>' +
    "</div>";

  var patEl = root.querySelector("#pat");
  var countEl = root.querySelector("#count");
  var srcEl = root.querySelector("#src");

  function run() {
    srcEl.textContent = subject.slice(0, 120);
    var matches = [];
    try {
      var re = new RegExp(pattern, "g");
      var m;
      while ((m = re.exec(subject)) !== null) { matches.push(m[0]); if (m.index === re.lastIndex) re.lastIndex++; }
    } catch (e) { /* invalid pattern mid-type */ }
    countEl.textContent = String(matches.length);
    ctx.bus.emit("out", matches.join("\n"));
  }

  patEl.value = pattern;
  patEl.oninput = function () { pattern = patEl.value; run(); };
  ctx.bus.on("in", function (v) { subject = typeof v === "string" ? v : JSON.stringify(v); run(); });
  run();
});
