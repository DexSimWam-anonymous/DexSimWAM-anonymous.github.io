(function drawerRsiViewerDetail(global) {
  "use strict";
  const TASKS = [{ metric: "close", label: "Close" }, { metric: "middle", label: "Open-middle" }, { metric: "top", label: "Open-top" }];
  const formatStep = (value) => Number(value).toLocaleString("en-US");
  const escapeHtml = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  const taskForMetric = (metric) => TASKS.find((task) => task.metric === metric);

  function init(root) {
    if (!root || root.dataset.viewerDetailInitialized === "true") return;
    const data = global.DRAWER_RSI_DATA, dialog = root.querySelector(".drawer-detail-dialog"), content = root.querySelector(".drawer-detail-content");
    if (!data || !dialog || !content) return;
    root.dataset.viewerDetailInitialized = "true";
    const manifestPromise = fetch("manifest.json?v=public-cleanup").then((response) => { if (!response.ok) throw new Error(`${response.status} manifest.json`); return response.json(); });

    function nearest(trajectories, metric, step, success) {
      return trajectories.filter((row) => row.metric === metric && row.success === success).slice().sort((a, b) => Math.abs(a.step - step) - Math.abs(b.step - step) || a.step - b.step)[0] || null;
    }
    function candidatesFor(trajectories, metric, step, success) {
      if (metric === "overall") return TASKS.map((task) => trajectories.find((row) => row.step === step && row.metric === task.metric && row.success === success) || nearest(trajectories, task.metric, step, success)).filter(Boolean);
      const exact = trajectories.filter((row) => row.step === step && row.metric === metric && row.success === success);
      if (exact.length) return exact;
      const fallback = nearest(trajectories, metric, step, success);
      return fallback ? [fallback] : [];
    }

    async function injectViewer(metric, index) {
      const old = content.querySelector(".drawer-viewer-section"); if (old) old.remove();
      const manifest = await manifestPromise, step = data.steps[index], denominator = data.denominators[metric], count = data.counts.RSI[metric][index], rate = count / denominator;
      const groups = { success: candidatesFor(manifest.trajectories, metric, step, true), failure: candidatesFor(manifest.trajectories, metric, step, false) };
      let activeOutcome = groups.success.length ? "success" : "failure", selectedIndex = 0;
      const metricLabel = metric === "overall" ? "Overall" : taskForMetric(metric).label;
      const section = document.createElement("section"); section.className = "drawer-viewer-section"; section.setAttribute("aria-label", "Interactive 3D evaluation trajectories");
      section.innerHTML = `<div class="drawer-viewer-heading"><div><span class="drawer-viewer-eyebrow">Interactive 3D evaluation replay</span><p class="drawer-viewer-rate"><strong>${count}/${denominator}</strong> (${(rate * 100).toFixed(1)}% ${escapeHtml(metricLabel)} success)</p></div><p class="drawer-viewer-step">Evaluation step ${formatStep(step)}</p></div><div class="drawer-viewer-controls" aria-label="Trajectory outcome"><button type="button" data-viewer-outcome="success" aria-pressed="${activeOutcome === "success"}" ${groups.success.length ? "" : "disabled"}>Successful examples · ${groups.success.length}</button><button type="button" data-viewer-outcome="failure" aria-pressed="${activeOutcome === "failure"}" ${groups.failure.length ? "" : "disabled"}>Failure / edge cases · ${groups.failure.length}</button></div><div class="drawer-viewer-layout"><div class="drawer-viewer-frame-wrap"><iframe class="drawer-viewer-frame" title="Draggable 3D trajectory replay" loading="eager"></iframe><p class="drawer-viewer-hint">Drag to rotate · wheel to zoom</p></div><div class="drawer-viewer-cases" aria-label="Trajectory examples"></div></div>`;
      content.prepend(section);
      const frame = section.querySelector(".drawer-viewer-frame"), cases = section.querySelector(".drawer-viewer-cases");
      function activeCandidates() { return groups[activeOutcome]; }
      function render() {
        const candidates = activeCandidates(), trajectory = candidates[selectedIndex] || candidates[0]; if (!trajectory) return;
        cases.innerHTML = candidates.map((row, candidateIndex) => { const sourceNote = row.step === step ? `step ${formatStep(step)}` : `nearest available · step ${formatStep(row.step)}`; const label = taskForMetric(row.metric)?.label || row.instruction; return `<button type="button" class="drawer-viewer-case ${row.success ? "is-success" : "is-failure"}" data-viewer-case="${candidateIndex}" aria-pressed="${candidateIndex === selectedIndex}"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(sourceNote)}</span><em>${row.success ? "Successful trajectory" : "Failure / edge case"}</em></button>`; }).join("");
        cases.querySelectorAll("[data-viewer-case]").forEach((button) => button.addEventListener("click", () => { selectedIndex = Number(button.dataset.viewerCase); render(); }));
        frame.src = `viewer/index.html?embed=1&case=${encodeURIComponent(trajectory.case_id)}&view=overview&font=times&cleanup=1`;
      }
      section.querySelectorAll("[data-viewer-outcome]").forEach((button) => button.addEventListener("click", () => { if (button.disabled) return; activeOutcome = button.dataset.viewerOutcome; selectedIndex = 0; section.querySelectorAll("[data-viewer-outcome]").forEach((item) => item.setAttribute("aria-pressed", String(item === button))); render(); }));
      render();
    }

    root.addEventListener("drawer-rsi-detail-opened", (event) => {
      const { seriesName, metric, index } = event.detail || {};
      if (seriesName !== "RSI" || !metric || index < 0) return;
      injectViewer(metric, index).catch(() => { const notice = document.createElement("p"); notice.className = "drawer-detail-notice"; notice.textContent = "The 3D replay is temporarily unavailable."; content.prepend(notice); });
    });
    dialog.addEventListener("close", () => { dialog.querySelectorAll("iframe.drawer-viewer-frame").forEach((frame) => { frame.src = "about:blank"; }); });
  }
  function autoInit() { document.querySelectorAll("[data-drawer-rsi-figure]").forEach(init); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", autoInit, { once: true }); else autoInit();
})(window);
