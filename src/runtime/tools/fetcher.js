/* Fetcher — GETs a URL through ctx.net (the host bridge) and emits the JSON body.
   The frame has connect-src 'none', so this fetch is impossible in-frame; it only
   works because the host performs it after checking the domain allowlist. */
toolboy.tool(function (ctx, root) {
  var url = "https://api.github.com/repos/matviibot/toolboy";

  root.innerHTML =
    '<div style="padding:22px;display:flex;flex-direction:column;gap:14px;height:100%">' +
    '  <div class="tb-mono" style="padding:11px 13px;color:var(--fg-2);background:var(--glass-fill-inset);border:1px solid var(--glass-stroke-lo);border-radius:var(--radius-md)">GET ' + url + "</div>" +
    '  <button id="go" style="align-self:flex-start;padding:9px 15px;border-radius:var(--radius-md);background:var(--accent);color:#fff;border:none;cursor:pointer;font-weight:500;box-shadow:var(--shadow-2)">Run request</button>' +
    '  <div id="status" style="font-size:12px;color:var(--fg-3);margin-top:auto">Emits application/json on its output port — via the host net bridge.</div>' +
    "</div>";

  var go = root.querySelector("#go");
  var status = root.querySelector("#status");

  go.onclick = function () {
    status.textContent = "Requesting…";
    go.disabled = true;
    ctx.net
      .fetch(url)
      .then(function (res) {
        return res.json().then(function (data) {
          var slim = { name: data.name, stars: data.stargazers_count, open_issues: data.open_issues_count };
          ctx.bus.emit("out", slim);
          status.textContent = res.status + " " + res.statusText + " · emitted " + JSON.stringify(slim);
        });
      })
      .catch(function (e) {
        status.textContent = "Failed: " + e.message;
        ctx.ui.toast(e.message, "error");
      })
      .then(function () { go.disabled = false; });
  };
});
