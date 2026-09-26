(function drawerRsiComponent(global) {
  "use strict";

  const ROOT_SELECTOR = "[data-drawer-rsi-figure]";
  const PANELS = {
    overall: { title: "(a) Overall", yTitle: "Success rate (%)" },
    close: { title: "(b) Close", yTitle: "Success rate (%)" },
    middle: { title: "(c) Open-middle", yTitle: "Success rate (%)" },
    top: { title: "(d) Open-top", yTitle: "Success rate (%)" },
  };
  const METRICS = [
    ["overall", "Overall"],
    ["close", "Close"],
    ["middle", "Open-middle"],
    ["top", "Open-top"],
  ];
  const STAGES = ["subtask_00", "subtask_01", "subtask_02", "subtask_03", "subtask_04", "subtask_05"];

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatStep(value) {
    return Number(value).toLocaleString("en-US");
  }

  function formatPercent(numerator, denominator, digits = 1) {
    return `${((100 * numerator) / denominator).toFixed(digits)}%`;
  }

  function stepTick(value) {
    return `${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}k`;
  }

  function buildSeries(data, name) {
    return data.steps.map((step, index) => {
      const point = { step, counts: {} };
      for (const [metric] of METRICS) {
        const numerator = data.counts[name][metric][index];
        point.counts[metric] = numerator;
        point[metric] = numerator / data.denominators[metric];
      }
      return point;
    });
  }

  function initDrawerRsiFigure(rootOrSelector) {
    const root = typeof rootOrSelector === "string"
      ? document.querySelector(rootOrSelector)
      : rootOrSelector;
    if (!root || root.dataset.drawerRsiInitialized === "true") return root || null;

    const errorBox = root.querySelector(".drawer-component-error");
    const loadingBox = root.querySelector(".drawer-loading");
    function fail(message) {
      if (loadingBox) loadingBox.remove();
      if (errorBox) {
        errorBox.textContent = message;
        errorBox.setAttribute("aria-hidden", "false");
      }
      return root;
    }

    const d3 = global.d3;
    const data = global.DRAWER_RSI_DATA;
    if (!d3) return fail("Drawer RSI figure could not start because D3 is not loaded.");
    if (!data) return fail("Drawer RSI figure could not start because its data bundle is not loaded.");

    root.dataset.drawerRsiInitialized = "true";
    if (loadingBox) loadingBox.remove();
    const series = {
      RSI: buildSeries(data, "RSI"),
      Baseline: buildSeries(data, "Baseline"),
    };
    const visible = new Set(["RSI", "Baseline"]);
    const tooltip = root.querySelector(".drawer-tooltip");
    const dialog = root.querySelector(".drawer-detail-dialog");
    const detailTitle = root.querySelector("#drawer-detail-title");
    const detailContent = root.querySelector(".drawer-detail-content");
    const closeButton = root.querySelector(".drawer-detail-close");
    let lastDetailTrigger = null;

    function openDetails(name, index, trigger) {
      const point = series[name][index];
      lastDetailTrigger = trigger || null;
      detailTitle.textContent = `${name === "RSI" ? "Agent scheduling" : "Static baseline"}   step ${formatStep(point.step)}`;

      const resultRows = METRICS.map(([metric, label]) => {
        const numerator = point.counts[metric];
        const denominator = data.denominators[metric];
        return `<tr><td>${label}</td><td>${numerator}/${denominator}</td><td>${formatPercent(numerator, denominator)}</td></tr>`;
      }).join("");

      let html = `
        <h4>Development Judge results</h4>
        <div class="drawer-detail-table-wrap">
          <table class="drawer-detail-table">
            <thead><tr><th>Metric</th><th>Cases</th><th>Success rate</th></tr></thead>
            <tbody>${resultRows}</tbody>
          </table>
        </div>`;

      if (name === "Baseline") {
        html += `<p class="drawer-detail-notice"><strong>Static baseline:</strong> no LLM revision, no synthetic-data generation, and no dynamic instruction, subtask, or learning-rate adjustment.</p>`;
      } else {
        const revision = data.revisions.find((item) => item.basedOnStep === point.step);
        if (!revision) {
          html += `<p class="drawer-detail-notice">No RSI revision is available for this evaluation boundary.</p>`;
        } else {
          const episodeCount = (value) => value === 0 ? "0" : `${value / 1000}k`;
          html += `
            <p class="drawer-detail-status">Revision status: <strong>${escapeHtml(revision.status)}</strong></p>
            <dl class="drawer-detail-grid">
              <div><dt>Revision</dt><dd>r${revision.revision}</dd></div>
              <div><dt>Decision step</dt><dd>${formatStep(revision.basedOnStep)}</dd></div>
              <div><dt>Apply timing</dt><dd>${escapeHtml(revision.apply)}</dd></div>
              <div><dt>Transition</dt><dd>${revision.transitionSteps ? `${formatStep(revision.transitionSteps)} optimizer steps` : "Immediate"}</dd></div>
              <div><dt>LR multiplier</dt><dd>${revision.lrMultiplier.toFixed(1)}</dd></div>
              <div><dt>Synthetic-data action</dt><dd>${escapeHtml(revision.syntheticDataAction)}</dd></div>
              <div><dt>Cumulative synthetic episodes</dt><dd>${episodeCount(revision.syntheticEpisodesCumulative)}</dd></div>
              <div><dt>Instruction mix</dt><dd>C/M/T = ${escapeHtml(revision.publicCmt)}<small>C/M/T = Close / Open-middle / Open-top</small></dd></div>
            </dl>
            <h4>Change from the preceding revision</h4>
            <p>${escapeHtml(revision.publicChange)}</p>`;

          if (revision.metaRepair) {
            html += `<p class="drawer-detail-notice">The complete Development Judge result was restored after a client crash; the dual-pool fail-closed repair was completed before this evaluation was accepted.</p>`;
          }
          if (revision.revision === 15) {
            html += `<p class="drawer-detail-notice"><strong>Partially applied; no subsequent complete evaluation.</strong> The step-19,980 result predates r15 and must not be interpreted as the effect of this revision.</p>`;
          }
        }
      }

      detailContent.innerHTML = html;
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
      closeButton.focus();
      root.dispatchEvent(new CustomEvent("drawer-rsi-detail-opened", {
        detail: {
          seriesName: name,
          metric: trigger?.closest(".drawer-panel[data-metric]")?.dataset.metric,
          index,
        },
      }));
    }

    closeButton.addEventListener("click", () => dialog.close());
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
    dialog.addEventListener("close", () => {
      if (lastDetailTrigger && document.contains(lastDetailTrigger)) lastDetailTrigger.focus();
    });

    function interpolate(points, metric, step) {
      const right = d3.bisector((point) => point.step).left(points, step);
      if (right <= 0) return points[0][metric];
      if (right >= points.length) return points.at(-1)[metric];
      const a = points[right - 1];
      const b = points[right];
      const ratio = (step - a.step) / (b.step - a.step);
      return a[metric] + ratio * (b[metric] - a[metric]);
    }

    function drawPanel(container) {
      const metric = container.dataset.metric;
      const cfg = PANELS[metric];
      const width = Math.max(320, Math.floor(container.getBoundingClientRect().width));
      const isOverall = metric === "overall";
      const isNarrow = width < 700;
      const margin = {
        top: isOverall ? (isNarrow ? 34 : 106) : 34,
        right: isOverall ? 58 : 44,
        bottom: 48,
        left: isOverall ? 64 : 58,
      };
      const innerHeight = isOverall ? 260 : 205;
      const height = margin.top + innerHeight + margin.bottom;
      const innerWidth = width - margin.left - margin.right;

      d3.select(container).selectAll("*").remove();
      const svg = d3.select(container).append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("role", "img")
        .attr("aria-labelledby", `drawer-${metric}-title drawer-${metric}-desc`);
      svg.append("title").attr("id", `drawer-${metric}-title`).text(`${cfg.title}: agent scheduling versus static baseline`);
      svg.append("desc").attr("id", `drawer-${metric}-desc`).text("Success rate over optimizer steps. Every observation can be activated for detailed evaluation and scheduling information.");

      const extent = d3.extent(data.steps);
      const xPad = (extent[1] - extent[0]) * 0.018;
      const x = d3.scaleLinear()
        .domain([extent[0] - xPad, extent[1] + xPad])
        .range([margin.left, width - margin.right]);
      const y = d3.scaleLinear().domain([0, 1]).range([margin.top + innerHeight, margin.top]);

      svg.append("rect")
        .attr("class", "drawer-plot-frame")
        .attr("data-chart-frame", "")
        .attr("x", margin.left).attr("y", margin.top)
        .attr("width", innerWidth).attr("height", innerHeight);

      const yTicks = [0, 0.25, 0.5, 0.75, 1];
      svg.append("g").attr("class", "drawer-grid")
        .attr("transform", `translate(${margin.left},0)`)
        .call(d3.axisLeft(y).tickValues(yTicks).tickSize(-innerWidth).tickFormat(""));

      const maxXTicks = width < 480 ? 4 : (isOverall ? 8 : 5);
      svg.append("g").attr("class", "drawer-axis")
        .attr("transform", `translate(0,${margin.top + innerHeight})`)
        .call(d3.axisBottom(x).ticks(maxXTicks).tickFormat(stepTick).tickSizeOuter(0));
      svg.append("g").attr("class", "drawer-axis")
        .attr("transform", `translate(${margin.left},0)`)
        .call(d3.axisLeft(y).tickValues(yTicks).tickFormat((value) => `${value * 100}`).tickSizeOuter(0));

      svg.append("text").attr("class", "drawer-panel-title")
        .attr("x", margin.left).attr("y", isOverall ? 18 : 17).text(cfg.title);
      svg.append("text").attr("class", "drawer-axis-title").attr("data-axis", "x")
        .attr("x", margin.left + innerWidth / 2).attr("y", height - 6)
        .attr("text-anchor", "middle").text("Optimizer step");
      svg.append("text").attr("class", "drawer-axis-title").attr("data-axis", "y")
        .attr("transform", `translate(16,${margin.top + innerHeight / 2}) rotate(-90)`)
        .attr("text-anchor", "middle").text(cfg.yTitle);

      data.interventions.forEach((event, eventIndex) => {
        const eventX = x(event.step);
        svg.append("line").attr("class", "drawer-intervention-line")
          .attr("x1", eventX).attr("x2", eventX)
          .attr("y1", margin.top).attr("y2", margin.top + innerHeight);

        if (isOverall && !isNarrow) {
          const slotWidth = innerWidth / data.interventions.length;
          const labelOffset = [0, 10, 20, 0][eventIndex];
          const labelX = margin.left + eventIndex * slotWidth + 8 + labelOffset;
          const labelY = 58;
          const dotY = labelY - 3;
          svg.append("path").attr("class", "drawer-intervention-leader")
            .attr("d", `M${labelX + 10},${dotY + 10} L${eventX},${margin.top - 5}`);
          svg.append("circle").attr("class", "drawer-intervention-dot")
            .attr("cx", labelX + 10).attr("cy", dotY).attr("r", 9);
          svg.append("text").attr("class", "drawer-intervention-number")
            .attr("x", labelX + 10).attr("y", dotY + 0.5).text(event.number);
          const text = svg.append("text").attr("class", "drawer-intervention-label")
            .attr("x", labelX + 24).attr("y", labelY - 6);
          text.append("tspan").attr("x", labelX + 24).text(event.title);
          text.append("tspan").attr("x", labelX + 24).attr("dy", 15).text(event.mix);
        }
      });

      const line = d3.line().x((point) => x(point.step)).y((point) => y(point[metric]));
      ["RSI", "Baseline"].forEach((name) => {
        const cssName = name === "RSI" ? "rsi" : "baseline";
        const group = svg.append("g").attr("data-series-group", name)
          .style("display", visible.has(name) ? null : "none");
        group.append("path").datum(series[name])
          .attr("class", `drawer-series-line ${cssName}`).attr("d", line);

        if (name === "RSI") {
          group.selectAll(`circle.drawer-point.${cssName}`).data(series[name]).join("circle")
            .attr("class", `drawer-point ${cssName}`)
            .attr("cx", (point) => x(point.step)).attr("cy", (point) => y(point[metric])).attr("r", 3.5);
        } else {
          group.selectAll(`rect.drawer-point.${cssName}`).data(series[name]).join("rect")
            .attr("class", `drawer-point ${cssName}`)
            .attr("x", (point) => x(point.step) - 3).attr("y", (point) => y(point[metric]) - 3)
            .attr("width", 6).attr("height", 6);
        }

        group.selectAll(`circle.drawer-hit-${cssName}`).data(series[name]).join("circle")
          .attr("class", `drawer-hit-${cssName}`)
          .attr("data-point-hit", "")
          .attr("data-series-name", name)
          .attr("role", "button")
          .attr("tabindex", 0)
          .attr("aria-label", (point) => `${name === "RSI" ? "Agent scheduling" : "Static baseline"}, step ${formatStep(point.step)}, ${PANELS[metric].title}, ${Math.round(point[metric] * 100)} percent. Open details.`)
          .attr("cx", (point) => x(point.step)).attr("cy", (point) => y(point[metric])).attr("r", 16)
          .on("click", function onPointClick(event, point) {
            event.stopPropagation();
            openDetails(name, data.steps.indexOf(point.step), this);
          })
          .on("keydown", function onPointKey(event, point) {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              openDetails(name, data.steps.indexOf(point.step), this);
            }
          });

        const last = series[name].at(-1);
        group.append("text").attr("class", "drawer-endpoint-label")
          .attr("x", x(last.step) + 7)
          .attr("y", y(last[metric]) + (name === "RSI" ? -5 : 13))
          .attr("fill", name === "RSI" ? "var(--drawer-rsi)" : "var(--drawer-baseline)")
          .text(`${Math.round(last[metric] * 100)}%`);
      });

      if (metric === "overall") {
        const peak = series.RSI.reduce((a, b) => (b.overall > a.overall ? b : a));
        svg.append("text").attr("class", "drawer-peak-label")
          .attr("x", x(peak.step) - 7).attr("y", y(peak.overall) - 9)
          .attr("text-anchor", "end").attr("fill", "var(--drawer-rsi)")
          .text(`Peak ${Math.round(peak.overall * 100)}%`);
      }

      const guide = svg.append("line").attr("class", "drawer-hover-guide")
        .attr("y1", margin.top).attr("y2", margin.top + innerHeight).style("display", "none");
      const markers = {};
      ["RSI", "Baseline"].forEach((name) => {
        markers[name] = svg.append("circle").attr("class", "drawer-hover-marker")
          .attr("r", 4.5)
          .attr("stroke", name === "RSI" ? "var(--drawer-rsi)" : "var(--drawer-baseline)")
          .style("display", "none");
      });

      function hideHover() {
        guide.style("display", "none");
        Object.values(markers).forEach((marker) => marker.style("display", "none"));
        tooltip.style.opacity = 0;
        tooltip.setAttribute("aria-hidden", "true");
      }

      function showHover(event) {
        if (event.pointerType === "touch") return;
        const [mouseX] = d3.pointer(event, svg.node());
        if (mouseX < margin.left || mouseX > width - margin.right) {
          hideHover();
          return;
        }
        const step = x.invert(mouseX);
        guide.attr("x1", mouseX).attr("x2", mouseX).style("display", null);
        let rows = `<div><strong>Step ≈ ${formatStep(Math.round(step))}</strong></div>`;
        ["RSI", "Baseline"].forEach((name) => {
          if (!visible.has(name)) {
            markers[name].style("display", "none");
            return;
          }
          const value = interpolate(series[name], metric, step);
          markers[name].attr("cx", mouseX).attr("cy", y(value)).style("display", null);
          rows += `<div class="drawer-tooltip-row"><span>${name === "RSI" ? "Agent scheduling" : "Static baseline"}</span><strong>${Math.round(value * 100)}%</strong></div>`;
        });
        tooltip.innerHTML = rows;
        tooltip.style.opacity = 1;
        tooltip.setAttribute("aria-hidden", "false");
        const rootRect = root.getBoundingClientRect();
        const svgRect = svg.node().getBoundingClientRect();
        const xPosition = svgRect.left - rootRect.left + (mouseX / width) * svgRect.width + 10;
        const yPosition = svgRect.top - rootRect.top + (margin.top / height) * svgRect.height + 8;
        tooltip.style.left = `${Math.min(rootRect.width - tooltip.offsetWidth - 8, Math.max(8, xPosition))}px`;
        tooltip.style.top = `${Math.max(8, yPosition)}px`;
      }

      svg.on("pointermove", showHover).on("pointerleave", hideHover);
    }

    function drawBestPanel(container) {
      const width = Math.max(320, Math.floor(container.getBoundingClientRect().width));
      const margin = { top: 34, right: width < 560 ? 64 : 112, bottom: 50, left: 64 };
      const innerHeight = 176;
      const height = margin.top + innerHeight + margin.bottom;
      const innerWidth = width - margin.left - margin.right;

      d3.select(container).selectAll("*").remove();
      const svg = d3.select(container).append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("role", "img")
        .attr("aria-labelledby", "drawer-best-title drawer-best-desc");
      svg.append("title").attr("id", "drawer-best-title")
        .text("(e) Best-so-far overall success rate");
      svg.append("desc").attr("id", "drawer-best-desc")
        .text("Overlapping step areas show the highest complete Overall Development Judge success rate observed by each optimizer step. Raw checkpoint regressions remain visible in the panels above.");

      const best = {};
      ["RSI", "Baseline"].forEach((name) => {
        let runningBest = 0;
        best[name] = series[name].map((point) => {
          runningBest = Math.max(runningBest, point.overall);
          return { step: point.step, value: runningBest };
        });
      });

      const extent = d3.extent(data.steps);
      const xPad = (extent[1] - extent[0]) * 0.018;
      const x = d3.scaleLinear()
        .domain([extent[0] - xPad, extent[1] + xPad])
        .range([margin.left, width - margin.right]);
      const y = d3.scaleLinear().domain([0, 1]).range([margin.top + innerHeight, margin.top]);

      const yTicks = [0, 0.5, 1];
      svg.append("g").attr("class", "drawer-grid")
        .attr("transform", `translate(${margin.left},0)`)
        .call(d3.axisLeft(y).tickValues(yTicks).tickSize(-innerWidth).tickFormat(""));
      svg.append("g").attr("class", "drawer-axis")
        .attr("transform", `translate(0,${margin.top + innerHeight})`)
        .call(d3.axisBottom(x).ticks(width < 480 ? 4 : 6).tickFormat(stepTick).tickSizeOuter(0));
      svg.append("g").attr("class", "drawer-axis")
        .attr("transform", `translate(${margin.left},0)`)
        .call(d3.axisLeft(y).tickValues(yTicks).tickFormat((value) => `${value * 100}`).tickSizeOuter(0));

      svg.append("text").attr("class", "drawer-panel-title")
        .attr("x", margin.left).attr("y", 17)
        .text("(e) Best-so-far overall success rate");
      svg.append("text").attr("class", "drawer-best-note")
        .attr("x", width - margin.right).attr("y", 17).attr("text-anchor", "end")
        .text(width < 620 ? "cumulative best" : "cumulative checkpoint envelope; raw regressions remain above");
      svg.append("text").attr("class", "drawer-axis-title").attr("data-axis", "x")
        .attr("x", margin.left + innerWidth / 2).attr("y", height - 5)
        .attr("text-anchor", "middle").text("Optimizer step");
      svg.append("text").attr("class", "drawer-axis-title").attr("data-axis", "y")
        .attr("transform", `translate(16,${margin.top + innerHeight / 2}) rotate(-90)`)
        .attr("text-anchor", "middle").text("Best success rate (%)");

      const area = d3.area()
        .curve(d3.curveStepAfter)
        .x((point) => x(point.step))
        .y0(y(0))
        .y1((point) => y(point.value));
      const stepLine = d3.line()
        .curve(d3.curveStepAfter)
        .x((point) => x(point.step))
        .y((point) => y(point.value));

      ["Baseline", "RSI"].forEach((name) => {
        const cssName = name === "RSI" ? "rsi" : "baseline";
        const group = svg.append("g").attr("data-series-group", name)
          .style("display", visible.has(name) ? null : "none");
        group.append("path").datum(best[name])
          .attr("class", `drawer-best-area ${cssName}`).attr("d", area);
        group.append("path").datum(best[name])
          .attr("class", `drawer-best-line ${cssName}`).attr("d", stepLine);
        const last = best[name].at(-1);
        group.append("text").attr("class", "drawer-endpoint-label")
          .attr("x", x(last.step) + 7)
          .attr("y", y(last.value) + (name === "RSI" ? -5 : 13))
          .attr("fill", name === "RSI" ? "var(--drawer-rsi)" : "var(--drawer-baseline)")
          .text(`${name === "RSI" ? "RSI" : "Baseline"} best ${Math.round(last.value * 100)}%`);
      });

      function valueAt(points, step) {
        const index = Math.max(0, d3.bisector((point) => point.step).right(points, step) - 1);
        return points[index].value;
      }

      data.interventions.forEach((event) => {
        const eventX = x(event.step);
        const eventY = y(valueAt(best.RSI, event.step));
        svg.append("line").attr("class", "drawer-intervention-line")
          .attr("x1", eventX).attr("x2", eventX)
          .attr("y1", margin.top).attr("y2", margin.top + innerHeight);
        svg.append("circle").attr("class", "drawer-best-event-halo")
          .attr("cx", eventX).attr("cy", eventY).attr("r", 11);
        svg.append("circle").attr("class", "drawer-best-event-ring")
          .attr("cx", eventX).attr("cy", eventY).attr("r", 4.5);
        svg.append("text").attr("class", "drawer-best-event-number")
          .attr("x", eventX).attr("y", eventY - 10).text(event.number);
      });

      const guide = svg.append("line").attr("class", "drawer-hover-guide")
        .attr("y1", margin.top).attr("y2", margin.top + innerHeight).style("display", "none");
      const markers = {};
      ["RSI", "Baseline"].forEach((name) => {
        markers[name] = svg.append("circle").attr("class", "drawer-hover-marker")
          .attr("r", 4.5)
          .attr("stroke", name === "RSI" ? "var(--drawer-rsi)" : "var(--drawer-baseline)")
          .style("display", "none");
      });

      function hideHover() {
        guide.style("display", "none");
        Object.values(markers).forEach((marker) => marker.style("display", "none"));
        tooltip.style.opacity = 0;
        tooltip.setAttribute("aria-hidden", "true");
      }

      function showHover(event) {
        if (event.pointerType === "touch") return;
        const [mouseX] = d3.pointer(event, svg.node());
        if (mouseX < margin.left || mouseX > width - margin.right) {
          hideHover();
          return;
        }
        const step = x.invert(mouseX);
        guide.attr("x1", mouseX).attr("x2", mouseX).style("display", null);
        let rows = `<div><strong>Best observed by step ${formatStep(Math.round(step))}</strong></div>`;
        ["RSI", "Baseline"].forEach((name) => {
          if (!visible.has(name)) {
            markers[name].style("display", "none");
            return;
          }
          const value = valueAt(best[name], step);
          markers[name].attr("cx", mouseX).attr("cy", y(value)).style("display", null);
          rows += `<div class="drawer-tooltip-row"><span>${name === "RSI" ? "Agent scheduling" : "Static baseline"}</span><strong>${Math.round(value * 100)}%</strong></div>`;
        });
        tooltip.innerHTML = rows;
        tooltip.style.opacity = 1;
        tooltip.setAttribute("aria-hidden", "false");
        const rootRect = root.getBoundingClientRect();
        const svgRect = svg.node().getBoundingClientRect();
        const xPosition = svgRect.left - rootRect.left + (mouseX / width) * svgRect.width + 10;
        const yPosition = svgRect.top - rootRect.top + (margin.top / height) * svgRect.height + 8;
        tooltip.style.left = `${Math.min(rootRect.width - tooltip.offsetWidth - 8, Math.max(8, xPosition))}px`;
        tooltip.style.top = `${Math.max(8, yPosition)}px`;
      }

      svg.on("pointermove", showHover).on("pointerleave", hideHover);
    }

    function drawAll() {
      root.querySelectorAll(".drawer-panel").forEach(drawPanel);
      const bestPanel = root.querySelector("[data-best-panel]");
      if (bestPanel) drawBestPanel(bestPanel);
    }

    root.querySelectorAll("button[data-series]").forEach((button) => {
      const name = button.dataset.series;
      button.addEventListener("click", () => {
        if (visible.has(name) && visible.size > 1) visible.delete(name);
        else visible.add(name);
        root.querySelectorAll("button[data-series]").forEach((item) => {
          item.setAttribute("aria-pressed", visible.has(item.dataset.series) ? "true" : "false");
        });
        drawAll();
      });
    });

    let lastWidth = Math.round(root.getBoundingClientRect().width);
    let resizeTimer = null;
    const observer = new ResizeObserver(() => {
      const nextWidth = Math.round(root.getBoundingClientRect().width);
      if (nextWidth === lastWidth) return;
      lastWidth = nextWidth;
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(drawAll, 80);
    });
    observer.observe(root);
    root.drawerRsiDestroy = () => observer.disconnect();

    drawAll();
    return root;
  }

  global.initDrawerRsiFigure = initDrawerRsiFigure;

  function autoInit() {
    document.querySelectorAll(ROOT_SELECTOR).forEach((root) => initDrawerRsiFigure(root));
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", autoInit, { once: true });
  else autoInit();
})(window);
