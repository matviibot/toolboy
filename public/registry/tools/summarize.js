/* Summarize — a FOREIGN tool (warm serif look, nothing like toolboy). Authored by
   someone else, runs sandboxed. Declares OPENAI_API_KEY + api.openai.com; the host
   would inject the key into the outbound request — the tool never sees it. Falls
   back to a local stub when no key is in the keyring, so the demo still flows. */
toolboy.tool(function (ctx, root) {
  var text = "Paste or wire text to summarize.";

  root.innerHTML =
    '<div style="height:100%;background:#fbf7ef;color:#2b2622;font-family:Georgia,\'Times New Roman\',serif;padding:24px;display:flex;flex-direction:column;gap:14px">' +
    '  <div style="font-size:22px;font-weight:700;letter-spacing:-0.01em">✶ Summarize</div>' +
    '  <div id="body" style="border-top:2px solid #e3d9c6;padding-top:12px;font-size:15px;line-height:1.6;color:#5c5346;flex:1;overflow:auto"></div>' +
    '  <button id="go" style="align-self:flex-start;background:#2b2622;color:#fbf7ef;border:none;padding:10px 18px;border-radius:2px;font-family:inherit;font-size:14px;cursor:pointer">Generate summary →</button>' +
    '  <div style="font-size:11px;color:#9b8e78;font-family:monospace">foreign UI · sandboxed · matvii/shared</div>' +
    "</div>";

  var body = root.querySelector("#body");
  var go = root.querySelector("#go");
  function show(t) { body.textContent = t; }
  show(text);

  ctx.bus.on("in", function (v) { text = typeof v === "string" ? v : JSON.stringify(v); show(text); });

  go.onclick = function () {
    ctx.secrets.has("OPENAI_API_KEY").then(function (hasKey) {
      if (!hasKey) {
        // no key granted — emit a local stub so the pipeline still demonstrates flow
        var stub = "Summary (stub): " + text.slice(0, 80) + (text.length > 80 ? "…" : "");
        show(stub);
        ctx.bus.emit("out", stub);
        ctx.ui.toast("No OPENAI_API_KEY in keyring — emitted a stub", "info");
        return;
      }
      // real path: host injects the key; this tool only sends text and reads the result
      show("Summarizing…");
      ctx.net
        .fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: "Summarize in one sentence:\n\n" + text }],
          }),
        })
        .then(function (res) { return res.json(); })
        .then(function (data) {
          var out = data.choices && data.choices[0] ? data.choices[0].message.content : "(no content)";
          show(out);
          ctx.bus.emit("out", out);
        })
        .catch(function (e) { show("Failed: " + e.message); ctx.ui.toast(e.message, "error"); });
    });
  };
});
