(function drawerRsiTrajectoryOverlay(global) {
  "use strict";

  const formatStep = (value) => Number(value).toLocaleString("en-US");
  const stepTick = (value) => `${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}k`;

  function init(root) {
    if (!root || root.dataset.trajectoryOverlayInitialized === "true") return;
    const panel = root.querySelector("[data-trajectory-panel]");
    const data = global.DRAWER_RSI_DATA;
    const d3 = global.d3;
    if (!panel || !data || !d3) return;
    root.dataset.trajectoryOverlayInitialized = "true";

    const tooltip = root.querySelector(".drawer-tooltip");
    const chooser = document.createElement("div");
    chooser.className = "drawer-node-chooser";
    chooser.hidden = true;
    chooser.setAttribute("role", "dialog");
    chooser.setAttribute("aria-label", "Choose an overlapping task node");
    root.appendChild(chooser);
    let lastChooserTrigger = null;
    let activeMethod = "RSI";
    let chooserBypass = false;
    const tasks = [
      { metric: "close", label: "Close", symbol: d3.symbolCircle },
      { metric: "middle", label: "Open-middle", symbol: d3.symbolSquare },
      { metric: "top", label: "Open-top", symbol: d3.symbolDiamond },
    ];
    const rate = (method, metric, index) =>
      data.counts[method][metric][index] / data.denominators[metric];

    function hideTooltip() {
      tooltip.style.opacity = 0;
      tooltip.setAttribute("aria-hidden", "true");
    }

    function showTooltip(event, html) {
      tooltip.innerHTML = html;
      tooltip.style.opacity = 1;
      tooltip.setAttribute("aria-hidden", "false");
      const box = root.getBoundingClientRect();
      tooltip.style.left = `${Math.min(box.width - tooltip.offsetWidth - 8, Math.max(8, event.clientX - box.left + 10))}px`;
      tooltip.style.top = `${Math.max(8, event.clientY - box.top + 10)}px`;
    }

    function hideChooser(restoreFocus = false) {
      chooser.hidden = true;
      chooser.replaceChildren();
      if (restoreFocus && lastChooserTrigger && document.contains(lastChooserTrigger)) {
        lastChooserTrigger.focus();
      }
      lastChooserTrigger = null;
    }

    function showNodeChooser(event, candidates, index, prompt = "Choose a task trajectory") {
      hideTooltip();
      lastChooserTrigger = event.target?.closest?.("[data-point-hit], .drawer-trajectory-hit") || null;
      chooser.innerHTML = `
        <p><strong>Step ${formatStep(data.steps[index])}</strong><span>${prompt}</span></p>
        <div>
          ${candidates.map((candidate, candidateIndex) => `
            <button type="button" data-chooser-index="${candidateIndex}">
              <strong>${candidate.label}</strong>
              <span>${candidate.count}/${candidate.denominator} (${(candidate.value * 100).toFixed(1)}%)</span>
            </button>`).join("")}
        </div>`;
      chooser.hidden = false;
      const rootBox = root.getBoundingClientRect();
      const triggerBox = lastChooserTrigger?.getBoundingClientRect();
      const clientX = Number.isFinite(event.clientX) && event.clientX
        ? event.clientX
        : (triggerBox ? triggerBox.left + triggerBox.width / 2 : rootBox.left + rootBox.width / 2);
      const clientY = Number.isFinite(event.clientY) && event.clientY
        ? event.clientY
        : (triggerBox ? triggerBox.top + triggerBox.height / 2 : rootBox.top + 80);
      const left = Math.min(rootBox.width - chooser.offsetWidth - 8, Math.max(8, clientX - rootBox.left + 10));
      const top = Math.max(8, clientY - rootBox.top + 10);
      chooser.style.left = `${left}px`;
      chooser.style.top = `${top}px`;
      chooser.querySelectorAll("[data-chooser-index]").forEach((button) => {
        button.addEventListener("click", () => {
          const candidate = candidates[Number(button.dataset.chooserIndex)];
          hideChooser();
          candidate.select();
        });
      });
      if (event.type === "keydown") chooser.querySelector("button")?.focus();
    }

    root.addEventListener("pointerdown", (event) => {
      if (!chooser.hidden && !chooser.contains(event.target) && !event.target.closest?.(".drawer-trajectory-hit, [data-point-hit]")) {
        hideChooser();
      }
    });
    root.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !chooser.hidden) {
        event.preventDefault();
        hideChooser(true);
      }
    });

    function openDetail(metric, index, method = activeMethod) {
      const source = root.querySelector(`.drawer-panel[data-metric="${metric}"]`);
      const hits = source
        ? source.querySelectorAll(`[data-point-hit][data-series-name="${method}"]`)
        : [];
      if (!hits[index]) return;
      chooserBypass = true;
      hits[index].dispatchEvent(new MouseEvent("click", { bubbles: true }));
      chooserBypass = false;
    }

    function overlappingMethods(hit) {
      const source = hit.closest(".drawer-panel[data-metric]");
      const point = hit.__data__;
      if (!source || !point) return null;
      const metric = source.dataset.metric;
      const index = data.steps.indexOf(point.step);
      if (index < 0) return null;
      const rsiValue = rate("RSI", metric, index);
      const baselineValue = rate("Baseline", metric, index);
      if (Math.abs(rsiValue - baselineValue) > 0.000001) return null;
      return {
        index,
        candidates: [
          {
            label: "Agent scheduling",
            value: rsiValue,
            count: data.counts.RSI[metric][index],
            denominator: data.denominators[metric],
            select: () => openDetail(metric, index, "RSI"),
          },
          {
            label: "Static baseline",
            value: baselineValue,
            count: data.counts.Baseline[metric][index],
            denominator: data.denominators[metric],
            select: () => openDetail(metric, index, "Baseline"),
          },
        ],
      };
    }

    function chooseOverlappingMethod(event) {
      if (chooserBypass) return;
      const hit = event.target?.closest?.("[data-point-hit]");
      if (!hit || (event.type === "keydown" && event.key !== "Enter" && event.key !== " ")) return;
      const overlap = overlappingMethods(hit);
      if (!overlap) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      showNodeChooser(event, overlap.candidates, overlap.index, "Choose a method");
    }

    root.addEventListener("click", chooseOverlappingMethod, true);
    root.addEventListener("keydown", chooseOverlappingMethod, true);

    function draw() {
      const width = Math.max(320, Math.floor(panel.getBoundingClientRect().width));
      const margin = { left: 68, right: width < 620 ? 72 : 122, bottom: 50 };
      const innerWidth = width - margin.left - margin.right;
      const taskTop = 58;
      const taskHeight = 188;
      const stepTop = taskTop + taskHeight + 56;
      const stepHeight = 156;
      const height = stepTop + stepHeight + margin.bottom;
      const visible = new Set(
        Array.from(root.querySelectorAll("button[data-series]"))
          .filter((button) => button.getAttribute("aria-pressed") !== "false")
          .map((button) => button.dataset.series)
      );

      d3.select(panel).selectAll("*").remove();
      panel.dataset.trajectoryMethod = activeMethod;
      const methodLabel = activeMethod === "RSI" ? "RSI" : "Baseline";
      const methodName = activeMethod === "RSI" ? "Agent scheduling" : "Static baseline";
      const toolbar = document.createElement("div");
      toolbar.className = "drawer-trajectory-toolbar";
      toolbar.innerHTML = `<span>Overlay method</span><div role="group" aria-label="Choose task overlay method">
        <button type="button" data-trajectory-method="RSI" aria-pressed="${activeMethod === "RSI"}">RSI</button>
        <button type="button" data-trajectory-method="Baseline" aria-pressed="${activeMethod === "Baseline"}">Baseline</button>
      </div>`;
      panel.appendChild(toolbar);
      toolbar.querySelectorAll("[data-trajectory-method]").forEach((button) => {
        button.addEventListener("click", () => {
          const nextMethod = button.dataset.trajectoryMethod;
          if (nextMethod === activeMethod) return;
          activeMethod = nextMethod;
          hideChooser();
          draw();
          requestAnimationFrame(() => panel.querySelector(`[data-trajectory-method="${activeMethod}"]`)?.focus());
        });
      });
      const svg = d3.select(panel).append("svg")
        .attr("data-method", activeMethod)
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("role", "img")
        .attr("aria-labelledby", "drawer-trajectory-title drawer-trajectory-desc");
      svg.append("title").attr("id", "drawer-trajectory-title")
        .text(`Overlaid ${methodLabel} task success trajectories aligned with best-so-far success`);
      svg.append("desc").attr("id", "drawer-trajectory-desc")
        .text(`Close, Open-middle, and Open-top ${methodName} success rates overlap on one shared zero-to-one-hundred-percent axis. The lower plot compares cumulative-best RSI and baseline success on the same optimizer-step scale.`);

      const extent = d3.extent(data.steps);
      const pad = (extent[1] - extent[0]) * 0.018;
      const x = d3.scaleLinear()
        .domain([extent[0] - pad, extent[1] + pad])
        .range([margin.left, width - margin.right]);
      const yTask = d3.scaleLinear().domain([0, 1]).range([taskTop + taskHeight, taskTop]);
      const yBest = d3.scaleLinear().domain([0, 1]).range([stepTop + stepHeight, stepTop]);
      const yTicks = [0, 0.25, 0.5, 0.75, 1];

      svg.append("text").attr("class", "drawer-panel-title")
        .attr("x", margin.left).attr("y", 17)
        .text(`(e) Overlaid ${methodLabel} task success trajectories`);
      svg.append("text").attr("class", "drawer-best-note")
        .attr("x", width - margin.right).attr("y", 17).attr("text-anchor", "end")
        .text(width < 620 ? "shared 0–100% axis" : "three task traces on one shared success-rate axis");

      const legend = svg.append("g").attr("class", "drawer-trajectory-legend")
        .attr("transform", `translate(${margin.left},38)`);
      let legendX = 0;
      tasks.forEach((task) => {
        const item = legend.append("g")
          .attr("class", `lane-${task.metric}`)
          .attr("transform", `translate(${legendX},0)`);
        item.append("line").attr("x1", 0).attr("x2", 22).attr("y1", 0).attr("y2", 0)
          .attr("class", "drawer-trajectory-legend-line");
        item.append("path").attr("class", "drawer-trajectory-node")
          .attr("transform", "translate(11,0)")
          .attr("d", d3.symbol().type(task.symbol).size(34));
        item.append("text").attr("x", 29).attr("y", 4).text(task.label);
        legendX += task.metric === "middle" ? 142 : 112;
      });

      svg.append("g").attr("class", "drawer-grid drawer-trajectory-grid")
        .attr("transform", `translate(${margin.left},0)`)
        .call(d3.axisLeft(yTask).tickValues(yTicks).tickSize(-innerWidth).tickFormat(""));
      svg.append("g").attr("class", "drawer-axis")
        .attr("transform", `translate(${margin.left},0)`)
        .call(d3.axisLeft(yTask).tickValues(yTicks).tickFormat((number) => `${number * 100}`).tickSizeOuter(0));
      svg.append("text").attr("class", "drawer-axis-title").attr("data-axis", "y")
        .attr("transform", `translate(16,${taskTop + taskHeight / 2}) rotate(-90)`)
        .attr("text-anchor", "middle").text("Task success rate (%)");

      data.steps.forEach((step) => {
        svg.append("line").attr("class", "drawer-trajectory-step-guide")
          .attr("x1", x(step)).attr("x2", x(step))
          .attr("y1", taskTop).attr("y2", stepTop + stepHeight);
      });

      function activateTaskNode(event, point, task) {
        const clickedY = yTask(point.value);
        const threshold = width < 620 ? 28 : 20;
        const candidates = tasks.map((candidateTask) => {
          const value = rate(activeMethod, candidateTask.metric, point.index);
          return {
            metric: candidateTask.metric,
            label: candidateTask.label,
            value,
            count: data.counts[activeMethod][candidateTask.metric][point.index],
            denominator: data.denominators[candidateTask.metric],
            screenY: yTask(value),
            select: () => openDetail(candidateTask.metric, point.index, activeMethod),
          };
        }).filter((candidate) => Math.abs(candidate.screenY - clickedY) <= threshold);

        if (candidates.length > 1) showNodeChooser(event, candidates, point.index);
        else openDetail(task.metric, point.index, activeMethod);
      }

      tasks.forEach((task) => {
        const points = data.steps.map((step, index) => ({
          step,
          index,
          count: data.counts[activeMethod][task.metric][index],
          value: rate(activeMethod, task.metric, index),
        }));
        const line = d3.line().curve(d3.curveMonotoneX)
          .x((point) => x(point.step))
          .y((point) => yTask(point.value));
        svg.append("path").datum(points)
          .attr("class", `drawer-trajectory-line lane-${task.metric}`)
          .attr("d", line);

        const nodes = svg.append("g")
          .attr("class", `drawer-trajectory-nodes lane-${task.metric}`)
          .selectAll("g").data(points).join("g")
          .attr("transform", (point) => `translate(${x(point.step)},${yTask(point.value)})`);
        nodes.append("path").attr("class", "drawer-trajectory-node")
          .attr("d", d3.symbol().type(task.symbol).size(46));
        nodes.append("path").attr("class", "drawer-trajectory-node-core")
          .attr("d", d3.symbol().type(task.symbol).size(10));
        nodes.append("path").attr("class", "drawer-trajectory-hit")
          .attr("d", d3.symbol().type(d3.symbolCircle).size(width < 620 ? 780 : 520))
          .attr("role", "button").attr("tabindex", 0)
          .attr("aria-label", (point) =>
            `${task.label}, step ${formatStep(point.step)}, ${point.count}/${data.denominators[task.metric]}, ${(point.value * 100).toFixed(1)} percent. Open evaluation details.`
          )
          .on("click", (event, point) => {
            event.stopPropagation();
            activateTaskNode(event, point, task);
          })
          .on("keydown", (event, point) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              event.stopPropagation();
              activateTaskNode(event, point, task);
            }
          })
          .on("pointerenter", (event, point) => {
            showTooltip(event, `<div><strong>${task.label} · step ${formatStep(point.step)}</strong></div><div class="drawer-tooltip-row"><span>${methodName}</span><strong>${point.count}/${data.denominators[task.metric]} (${(point.value * 100).toFixed(1)}%)</strong></div><div class="drawer-tooltip-note">Click to inspect evaluation details.</div>`);
          })
          .on("pointerleave", hideTooltip);

        const bestPoint = points.reduce((best, point) => point.value > best.value ? point : best);
        svg.append("text").attr("class", `drawer-trajectory-best-label lane-${task.metric}`)
          .attr("x", x(bestPoint.step))
          .attr("y", Math.max(taskTop + 12, yTask(bestPoint.value) - 9))
          .attr("text-anchor", "middle")
          .text(`${bestPoint.count}/${data.denominators[task.metric]} (${(bestPoint.value * 100).toFixed(1)}%)`);
      });

      svg.append("text").attr("class", "drawer-panel-title")
        .attr("x", margin.left).attr("y", stepTop - 18)
        .text("(f) Best-so-far overall success rate");
      svg.append("text").attr("class", "drawer-best-note")
        .attr("x", width - margin.right).attr("y", stepTop - 18).attr("text-anchor", "end")
        .text(width < 620 ? "cumulative best" : "overlapping cumulative checkpoint envelopes");

      const best = {};
      ["RSI", "Baseline"].forEach((name) => {
        let running = 0;
        best[name] = data.steps.map((step, index) => {
          running = Math.max(running, rate(name, "overall", index));
          return { step, value: running };
        });
      });

      svg.append("g").attr("class", "drawer-grid")
        .attr("transform", `translate(${margin.left},0)`)
        .call(d3.axisLeft(yBest).tickValues([0, 0.5, 1]).tickSize(-innerWidth).tickFormat(""));
      svg.append("g").attr("class", "drawer-axis")
        .attr("transform", `translate(0,${stepTop + stepHeight})`)
        .call(d3.axisBottom(x).ticks(width < 480 ? 4 : 6).tickFormat(stepTick).tickSizeOuter(0));
      svg.append("g").attr("class", "drawer-axis")
        .attr("transform", `translate(${margin.left},0)`)
        .call(d3.axisLeft(yBest).tickValues([0, 0.5, 1]).tickFormat((number) => `${number * 100}`).tickSizeOuter(0));
      svg.append("text").attr("class", "drawer-axis-title").attr("data-axis", "x")
        .attr("x", margin.left + innerWidth / 2).attr("y", height - 5)
        .attr("text-anchor", "middle").text("Optimizer step");
      svg.append("text").attr("class", "drawer-axis-title").attr("data-axis", "y")
        .attr("transform", `translate(16,${stepTop + stepHeight / 2}) rotate(-90)`)
        .attr("text-anchor", "middle").text("Best success rate (%)");

      const area = d3.area().curve(d3.curveStepAfter)
        .x((point) => x(point.step)).y0(yBest(0)).y1((point) => yBest(point.value));
      const stepLine = d3.line().curve(d3.curveStepAfter)
        .x((point) => x(point.step)).y((point) => yBest(point.value));

      ["Baseline", "RSI"].forEach((name) => {
        const css = name === "RSI" ? "rsi" : "baseline";
        const group = svg.append("g").style("display", visible.has(name) ? null : "none");
        group.append("path").datum(best[name]).attr("class", `drawer-best-area ${css}`).attr("d", area);
        group.append("path").datum(best[name]).attr("class", `drawer-best-line ${css}`).attr("d", stepLine);
        const last = best[name].at(-1);
        group.append("text").attr("class", "drawer-endpoint-label")
          .attr("x", x(last.step) + 7)
          .attr("y", yBest(last.value) + (name === "RSI" ? -5 : 13))
          .attr("fill", name === "RSI" ? "var(--drawer-rsi)" : "var(--drawer-baseline)")
          .text(`${Math.round(last.value * data.denominators.overall)}/${data.denominators.overall} (${(last.value * 100).toFixed(1)}%)`);
      });

      const valueAt = (points, step) =>
        points[Math.max(0, d3.bisector((point) => point.step).right(points, step) - 1)].value;

      data.interventions.forEach((event) => {
        const eventX = x(event.step);
        const eventY = yBest(valueAt(best.RSI, event.step));
        svg.append("line").attr("class", "drawer-intervention-line drawer-composite-intervention")
          .attr("x1", eventX).attr("x2", eventX)
          .attr("y1", taskTop).attr("y2", stepTop + stepHeight);
        svg.append("circle").attr("class", "drawer-best-event-halo")
          .attr("cx", eventX).attr("cy", eventY).attr("r", 11);
        svg.append("circle").attr("class", "drawer-best-event-ring")
          .attr("cx", eventX).attr("cy", eventY).attr("r", 4.5);
        svg.append("text").attr("class", "drawer-best-event-number")
          .attr("x", eventX).attr("y", eventY - 10).text(event.number);
      });

      const guide = svg.append("line").attr("class", "drawer-hover-guide")
        .attr("y1", stepTop).attr("y2", stepTop + stepHeight).style("display", "none");
      const markers = {};
      ["RSI", "Baseline"].forEach((name) => {
        markers[name] = svg.append("circle").attr("class", "drawer-hover-marker")
          .attr("r", 4.5)
          .attr("stroke", name === "RSI" ? "var(--drawer-rsi)" : "var(--drawer-baseline)")
          .style("display", "none");
      });
      svg.append("rect").attr("class", "drawer-best-hover-capture")
        .attr("x", margin.left).attr("y", stepTop)
        .attr("width", innerWidth).attr("height", stepHeight)
        .on("pointermove", (event) => {
          if (event.pointerType === "touch") return;
          const [mouseX] = d3.pointer(event, svg.node());
          const step = x.invert(mouseX);
          guide.attr("x1", mouseX).attr("x2", mouseX).style("display", null);
          let rows = `<div><strong>Best observed by step ${formatStep(Math.round(step))}</strong></div>`;
          ["RSI", "Baseline"].forEach((name) => {
            if (!visible.has(name)) return markers[name].style("display", "none");
            const current = valueAt(best[name], step);
            markers[name].attr("cx", mouseX).attr("cy", yBest(current)).style("display", null);
            const count = Math.round(current * data.denominators.overall);
            rows += `<div class="drawer-tooltip-row"><span>${name === "RSI" ? "Agent scheduling" : "Static baseline"}</span><strong>${count}/${data.denominators.overall} (${(current * 100).toFixed(1)}%)</strong></div>`;
          });
          showTooltip(event, rows);
        })
        .on("pointerleave", () => {
          guide.style("display", "none");
          Object.values(markers).forEach((marker) => marker.style("display", "none"));
          hideTooltip();
        });
    }

    root.querySelectorAll("button[data-series]").forEach((button) => {
      button.addEventListener("click", () => setTimeout(draw, 0));
    });
    let lastWidth = Math.round(panel.getBoundingClientRect().width);
    let resizeTimer = null;
    const observer = new ResizeObserver(() => {
      const width = Math.round(panel.getBoundingClientRect().width);
      if (width === lastWidth) return;
      lastWidth = width;
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(draw, 80);
    });
    observer.observe(panel);
    draw();
  }

  function autoInit() {
    document.querySelectorAll("[data-drawer-rsi-figure]").forEach(init);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", autoInit, { once: true });
  else autoInit();
})(window);
