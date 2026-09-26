(function drawerRsiScrollStory(global) {
  "use strict";
  const STAGES = [
    { key: "overall", number: "01", eyebrow: "Overall performance", title: "One aggregate signal", note: "All 96 evaluation outcomes, read as the headline trajectory." },
    { key: "tasks", number: "02", eyebrow: "Task decomposition", title: "Three behaviors underneath", note: "Close, open-middle, and open-top reveal where the aggregate score comes from." },
    { key: "comparison", number: "03", eyebrow: "Shared-axis comparison", title: "The three traces, reunited", note: "A final common scale makes convergence and divergence directly comparable." },
  ];
  function stageHeader(stage) {
    const header = document.createElement("header");
    header.className = "drawer-story-header";
    header.innerHTML = `<span class="drawer-story-number">${stage.number}</span><div><p>${stage.eyebrow}</p><h3>${stage.title}</h3><span>${stage.note}</span></div>`;
    return header;
  }
  function build(root) {
    if (!root || root.dataset.scrollStoryInitialized === "true") return;
    const panels = root.querySelector(".drawer-panels");
    const overall = panels?.querySelector('.drawer-panel[data-metric="overall"]');
    const tasks = ["close", "middle", "top"].map((metric) => panels?.querySelector(`.drawer-panel[data-metric="${metric}"]`));
    const comparison = panels?.querySelector("[data-trajectory-panel]");
    if (!panels || !overall || tasks.some((panel) => !panel) || !comparison) return;
    root.dataset.scrollStoryInitialized = "true";
    const stageElements = [];
    STAGES.forEach((stage) => {
      const section = document.createElement("section");
      section.className = `drawer-story-stage drawer-story-${stage.key}`;
      section.dataset.storyStage = stage.key;
      section.append(stageHeader(stage));
      const frame = document.createElement("div");
      frame.className = "drawer-story-frame";
      if (stage.key === "overall") frame.append(overall);
      if (stage.key === "tasks") {
        const branches = document.createElement("div");
        branches.className = "drawer-story-branches";
        tasks.forEach((panel) => branches.append(panel));
        frame.append(branches);
      }
      if (stage.key === "comparison") frame.append(comparison);
      section.append(frame);
      panels.append(section);
      stageElements.push(section);
    });
    const progress = document.createElement("nav");
    progress.className = "drawer-story-progress";
    progress.setAttribute("aria-label", "Figure chapters");
    progress.innerHTML = STAGES.map((stage) => `<button type="button" data-story-jump="${stage.key}" aria-label="Go to ${stage.eyebrow}"><span>${stage.number}</span><b>${stage.key === "overall" ? "Overall" : stage.key === "tasks" ? "Tasks" : "Compare"}</b><i></i></button>`).join("");
    panels.before(progress);
    progress.querySelectorAll("[data-story-jump]").forEach((button) => button.addEventListener("click", () => root.querySelector(`[data-story-stage="${button.dataset.storyJump}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" })));
    const reducedMotion = global.matchMedia("(prefers-reduced-motion: reduce)");
    const reveal = new IntersectionObserver((entries) => entries.forEach((entry) => { if (entry.isIntersecting) entry.target.classList.add("is-visible"); }), { rootMargin: "0px 0px -12% 0px", threshold: .16 });
    stageElements.forEach((section) => reveal.observe(section));
    let ticking = false;
    function updateStory() {
      ticking = false;
      const viewportMiddle = global.innerHeight * .46;
      let active = stageElements[0], bestDistance = Infinity;
      stageElements.forEach((section) => {
        const rect = section.getBoundingClientRect();
        const anchor = Math.max(rect.top, Math.min(viewportMiddle, rect.bottom));
        const distance = Math.abs(anchor - viewportMiddle);
        if (distance < bestDistance && rect.bottom > 0 && rect.top < global.innerHeight) { bestDistance = distance; active = section; }
        if (!reducedMotion.matches) {
          const raw = (viewportMiddle - rect.top) / Math.max(rect.height, 1);
          section.style.setProperty("--stage-progress", String(Math.max(0, Math.min(1, raw)).toFixed(3)));
        }
      });
      const activeKey = active.dataset.storyStage;
      root.dataset.storyActive = activeKey;
      progress.querySelectorAll("[data-story-jump]").forEach((button) => {
        const current = button.dataset.storyJump === activeKey;
        button.classList.toggle("is-active", current);
        if (current) button.setAttribute("aria-current", "step"); else button.removeAttribute("aria-current");
      });
      const rootRect = root.getBoundingClientRect();
      progress.classList.toggle("is-on-canvas", rootRect.top < global.innerHeight * .55 && rootRect.bottom > global.innerHeight * .45);
    }
    function requestUpdate() { if (!ticking) { ticking = true; global.requestAnimationFrame(updateStory); } }
    global.addEventListener("scroll", requestUpdate, { passive: true });
    global.addEventListener("resize", requestUpdate, { passive: true });
    root.classList.add("is-story-ready");
    updateStory();
  }
  function init() { document.querySelectorAll("[data-drawer-rsi-figure]").forEach(build); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true }); else init();
})(window);
