"use strict";

// Keep playback controls together; only the overview player exposes its audio.
function setupVideoPlayer(video) {
  const frame = video.closest(".media-frame");
  if (!frame || frame.querySelector(".video-controls")) return;
  const audioEnabled = frame.dataset.audio === "true";

  const silence = () => {
    video.defaultMuted = true;
    if (!video.muted) video.muted = true;
    if (video.volume !== 0) video.volume = 0;
  };
  if (audioEnabled) {
    video.defaultMuted = false;
    video.muted = false;
    video.volume = 1;
  } else {
    silence();
    video.addEventListener("volumechange", silence);
  }
  video.defaultPlaybackRate = 1;
  video.playbackRate = 1;

  const controls = document.createElement("div");
  controls.className = "video-controls";
  controls.setAttribute("role", "group");
  controls.setAttribute("aria-label", `Video controls: ${video.getAttribute("aria-label") || "Research video"}`);
  controls.innerHTML = `
    <div class="video-control-row">
      <button class="video-play" type="button" aria-label="Play" title="Play">▶</button>
      <input class="video-seek" type="range" min="0" max="100" step="0.01" value="0" aria-label="Seek video" disabled>
      <span class="video-time">0:00</span>
      ${audioEnabled ? `<div class="video-volume-control">
        <button class="video-volume-button" type="button" aria-label="Mute" title="Mute"></button>
        <input class="video-volume" type="range" min="0" max="1" step="0.01" value="1" aria-label="Volume" aria-valuetext="100%">
      </div>` : ""}
      <select class="video-speed" aria-label="Playback speed" title="Playback speed">
        <option value="0.5">0.5×</option>
        <option value="0.75">0.75×</option>
        <option value="1" selected>1×</option>
        <option value="1.25">1.25×</option>
        <option value="1.5">1.5×</option>
        <option value="2">2×</option>
      </select>
      <button class="video-fullscreen" type="button" aria-label="Enter fullscreen" title="Enter fullscreen"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
    </div>`;
  const play = controls.querySelector(".video-play");
  const seek = controls.querySelector(".video-seek");
  const time = controls.querySelector(".video-time");
  const volumeButton = controls.querySelector(".video-volume-button");
  const volume = controls.querySelector(".video-volume");
  const speed = controls.querySelector(".video-speed");
  const fullscreen = controls.querySelector(".video-fullscreen");
  const formatTime = (seconds) => {
    if (!Number.isFinite(seconds)) return "0:00";
    return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
  };
  const updateTime = () => {
    const duration = video.duration;
    seek.disabled = !Number.isFinite(duration) || duration <= 0;
    seek.value = seek.disabled ? "0" : String(video.currentTime / duration * 100);
    seek.style.setProperty("--progress", `${seek.value}%`);
    seek.setAttribute("aria-valuetext", `${formatTime(video.currentTime)} of ${formatTime(duration)}`);
    time.textContent = formatTime(video.currentTime);
    time.title = Number.isFinite(duration)
      ? `${formatTime(video.currentTime)} / ${formatTime(duration)}`
      : formatTime(video.currentTime);
  };
  let hideControlsTimer;
  const revealControls = () => {
    clearTimeout(hideControlsTimer);
    frame.classList.add("controls-visible");
    if (!video.paused) {
      hideControlsTimer = setTimeout(() => frame.classList.remove("controls-visible"), 1800);
    }
  };
  const updatePlay = () => {
    play.innerHTML = video.paused
      ? '<svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><path d="m9 5 10 7-10 7Z" fill="currentColor" stroke="currentColor" stroke-linejoin="round"/></svg>'
      : '<svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><path d="M8 6v12M16 6v12" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>';
    frame.classList.toggle("is-playing", !video.paused);
    revealControls();
    play.title = video.paused ? "Play" : "Pause";
    play.setAttribute("aria-label", play.title);
  };
  const updateVolume = () => {
    if (!audioEnabled) return;
    const level = video.muted ? 0 : video.volume;
    volume.value = String(level);
    volume.style.setProperty("--volume", `${level * 100}%`);
    volume.setAttribute("aria-valuetext", `${Math.round(level * 100)}%`);
    const muted = level === 0;
    volumeButton.innerHTML = muted
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10v4h4l5 4V6L8 10H4Z" fill="currentColor"/><path d="m17 10 4 4m0-4-4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10v4h4l5 4V6L8 10H4Z" fill="currentColor"/><path d="M16 9a4 4 0 0 1 0 6m2-8a7 7 0 0 1 0 10" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
    volumeButton.title = muted ? "Unmute" : "Mute";
    volumeButton.setAttribute("aria-label", volumeButton.title);
  };
  const togglePlay = async () => {
    if (!video.paused) { video.pause(); return; }
    if (!audioEnabled) silence();
    try { await video.play(); }
    catch { play.title = "Playback unavailable. Try again."; }
  };
  play.addEventListener("click", togglePlay);
  video.addEventListener("click", (event) => {
    if (event.pointerType === "touch" && !video.paused && !frame.classList.contains("controls-visible")) {
      revealControls();
      return;
    }
    togglePlay();
  });
  frame.addEventListener("pointermove", revealControls);
  frame.addEventListener("pointerenter", revealControls);
  frame.addEventListener("pointerleave", () => {
    if (!video.paused) {
      clearTimeout(hideControlsTimer);
      frame.classList.remove("controls-visible");
    }
  });
  controls.addEventListener("keydown", revealControls);
  controls.addEventListener("pointerdown", revealControls);
  ["play", "pause", "ended"].forEach((event) => video.addEventListener(event, updatePlay));
  ["loadedmetadata", "durationchange", "timeupdate", "emptied"].forEach((event) => video.addEventListener(event, updateTime));
  seek.addEventListener("input", () => {
    if (Number.isFinite(video.duration)) video.currentTime = Number(seek.value) / 100 * video.duration;
    updateTime();
  });
  if (audioEnabled) {
    let previousVolume = 1;
    volume.addEventListener("input", () => {
      const level = Number(volume.value);
      video.volume = level;
      video.muted = level === 0;
      if (level > 0) previousVolume = level;
      updateVolume();
    });
    volumeButton.addEventListener("click", () => {
      if (video.muted || video.volume === 0) {
        video.volume = previousVolume || 1;
        video.muted = false;
      } else {
        previousVolume = video.volume;
        video.muted = true;
      }
      updateVolume();
    });
    video.addEventListener("volumechange", updateVolume);
  }
  speed.addEventListener("change", () => {
    video.defaultPlaybackRate = Number(speed.value);
    video.playbackRate = Number(speed.value);
  });
  video.addEventListener("ratechange", () => {
    const rate = String(video.playbackRate);
    if (![...speed.options].some((option) => option.value === rate)) {
      speed.add(new Option(`${rate}×`, rate));
    }
    speed.value = rate;
  });
  fullscreen.hidden = !document.fullscreenEnabled && !video.webkitEnterFullscreen;
  fullscreen.addEventListener("click", async () => {
    try {
      if (document.fullscreenElement === frame) await document.exitFullscreen();
      else if (frame.requestFullscreen && document.fullscreenEnabled) await frame.requestFullscreen();
      else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
    } catch { fullscreen.title = "Fullscreen unavailable"; }
  });
  document.addEventListener("fullscreenchange", () => {
    fullscreen.title = document.fullscreenElement === frame ? "Exit fullscreen" : "Enter fullscreen";
    fullscreen.setAttribute("aria-label", fullscreen.title);
  });
  frame.append(controls);
  frame.classList.add("custom-video-player");
  video.controls = false;
  updateTime();
  updatePlay();
  updateVolume();
}
document.querySelectorAll("video").forEach(setupVideoPlayer);

// Base / V.G. and repeated rollouts stay grouped by task.
document.querySelectorAll("[data-variant-group]").forEach((group) => {
  const tabs = [...group.querySelectorAll('[role="tab"]')];
  if (!tabs.length) return;

  const selectTab = (selectedTab, moveFocus = false) => {
    tabs.forEach((tab) => {
      const selected = tab === selectedTab;
      const panel = document.getElementById(tab.getAttribute("aria-controls"));
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
      panel.hidden = !selected;
      if (!selected) panel.querySelectorAll("video").forEach((video) => video.pause());
    });
    if (moveFocus) selectedTab.focus();
  };

  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => selectTab(tab));
    tab.addEventListener("keydown", (event) => {
      let nextIndex;
      if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
      else if (event.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length;
      else if (event.key === "Home") nextIndex = 0;
      else if (event.key === "End") nextIndex = tabs.length - 1;
      else return;
      event.preventDefault();
      selectTab(tabs[nextIndex], true);
    });
  });
});

// Add a path to any media frame's data-src in index.html to replace its placeholder.
// Empty paths make no network requests. Original template media are never substituted.
document.querySelectorAll("[data-media]").forEach((frame) => {
  const source = frame.dataset.src.trim();
  if (!source) return;

  const isVideo = frame.dataset.media === "video";
  const media = document.createElement(isVideo ? "video" : "img");
  media.className = "loaded-media";
  const label = frame.dataset.label || (isVideo ? "Research video" : "Research figure");

  if (isVideo) {
    media.controls = true;
    media.muted = frame.dataset.audio !== "true";
    media.loop = true;
    media.playsInline = true;
    media.preload = "metadata";
    media.setAttribute("aria-label", label);
    if (frame.dataset.poster) media.poster = frame.dataset.poster;
  } else {
    media.alt = label;
    media.loading = "lazy";
    media.decoding = "async";
  }

  media.addEventListener(isVideo ? "loadedmetadata" : "load", () => {
    frame.classList.add("has-media");
    if (isVideo) setupVideoPlayer(media);
  }, { once: true });

  media.addEventListener("error", () => {
    frame.classList.remove("has-media");
    if (isVideo) {
      frame.querySelector(".video-controls")?.remove();
      frame.classList.remove("custom-video-player");
    }
    media.remove();
    const note = frame.querySelector(".placeholder-note");
    if (note) note.textContent = isVideo ? "Video unavailable" : "Figure unavailable";
  }, { once: true });

  frame.append(media);
  media.src = source;
});

// Enlarge framework figures with native keyboard focus and Escape support.
const figureDialog = document.getElementById("figure-dialog");
if (figureDialog) {
  const expandedImage = figureDialog.querySelector("img");
  document.querySelectorAll("[data-zoom-src]").forEach((button) => {
    button.addEventListener("click", () => {
      expandedImage.src = button.dataset.zoomSrc;
      expandedImage.alt = button.querySelector("img")?.alt || "Expanded research figure";
      figureDialog.showModal();
    });
  });
  figureDialog.querySelector(".dialog-close").addEventListener("click", () => figureDialog.close());
  figureDialog.addEventListener("click", (event) => {
    const rect = figureDialog.getBoundingClientRect();
    if (event.target === figureDialog && (
      event.clientX < rect.left || event.clientX > rect.right ||
      event.clientY < rect.top || event.clientY > rect.bottom
    )) figureDialog.close();
  });
}

const scrollButton = document.querySelector(".scroll-to-top");
if (scrollButton) {
  const updateScrollButton = () => { scrollButton.hidden = window.scrollY < 600; };
  window.addEventListener("scroll", updateScrollButton, { passive: true });
  updateScrollButton();
  scrollButton.addEventListener("click", () => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reducedMotion ? "instant" : "smooth" });
  });
}

// Highlight the current section without hiding content when JavaScript is unavailable.
const navLinks = [...document.querySelectorAll(".nav-links a")];
const sections = [...document.querySelectorAll("main > section[id]")];
if ("IntersectionObserver" in window) {
  const sectionObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      navLinks.forEach((link) => {
        if (link.hash === `#${entry.target.id}`) link.setAttribute("aria-current", "location");
        else link.removeAttribute("aria-current");
      });
    });
  }, { rootMargin: "-15% 0px -55% 0px", threshold: 0 });
  sections.forEach((section) => sectionObserver.observe(section));
}
