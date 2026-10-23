// 페이지 간 데이터, 이미지 준비, 갤러리 동작을 한곳에서 관리합니다.
window.FlowerSite = (() => {
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const wheelLists = new WeakSet();

  function saveData(key, value) {
    try {
      sessionStorage.setItem(`flower:${key}`, JSON.stringify({ savedAt: Date.now(), value }));
    } catch { /* 저장소가 막혀 있어도 페이지 기능은 계속합니다. */ }
  }

  function readData(key, maxAge = 30000, consume = false) {
    try {
      const raw = sessionStorage.getItem(`flower:${key}`);
      if (consume) sessionStorage.removeItem(`flower:${key}`);
      if (!raw) return null;
      const record = JSON.parse(raw);
      const age = Date.now() - record.savedAt;
      return Number.isFinite(age) && age >= 0 && age <= maxAge ? record.value : null;
    } catch { return null; }
  }

  async function fetchJSON(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  function onImagesReady(images, callback) {
    const cleanups = [];
    let cancelled = false;
    let remaining = images.length;
    let frame;
    let timeout;
    const cleanup = () => {
      cleanups.forEach((remove) => remove());
      clearTimeout(timeout);
    };
    const finish = () => {
      if (cancelled) return;
      cleanup();
      cancelled = true;
      frame = requestAnimationFrame(callback);
    };
    const settled = () => { if (--remaining === 0) finish(); };

    // 이미 로드된 이미지에서는 load가 다시 발생하지 않으므로 즉시 처리합니다.
    if (!remaining) finish();
    else {
      timeout = setTimeout(finish, 6000);
      images.forEach((image) => {
        if (image.complete) { settled(); return; }
        let done = false;
        const remove = () => {
          image.removeEventListener("load", complete);
          image.removeEventListener("error", complete);
        };
        const complete = () => {
          if (done) return;
          done = true;
          remove();
          settled();
        };
        cleanups.push(remove);
        image.addEventListener("load", complete);
        image.addEventListener("error", complete);
        if (image.complete) complete();
      });
    }
    return () => { cancelled = true; cleanup(); cancelAnimationFrame(frame); };
  }

  function setImageLoadingState(image, container) {
    const finish = () => {
      image.removeEventListener("load", finish);
      image.removeEventListener("error", finish);
      container.classList.remove("is-image-loading");
      image.classList.toggle("is-image-loaded", image.naturalWidth > 0);
      container.classList.toggle("is-image-error", image.naturalWidth === 0);
    };
    if (image.complete) finish();
    else {
      image.addEventListener("load", finish);
      image.addEventListener("error", finish);
    }
  }

  function createAutoCycle(element, tick, images = [], delay = 4000, onReady = () => {}) {
    if (!element) return { destroy() {} };
    let timer;
    let quietTimer;
    let ready = false;
    let destroyed = false;
    let suspended = false;
    let interacting = false;
    let pointerDown = false;
    const removers = [];
    const listen = (target, type, handler) => {
      target.addEventListener(type, handler);
      removers.push(() => target.removeEventListener(type, handler));
    };
    const update = () => {
      clearInterval(timer);
      timer = null;
      if (destroyed || !ready || suspended || document.hidden || motion.matches || interacting ||
          pointerDown || element.matches(":hover") || element.contains(document.activeElement)) return;
      timer = setInterval(tick, delay);
    };
    const hold = () => {
      interacting = true;
      clearTimeout(quietTimer);
      update();
      quietTimer = setTimeout(() => { interacting = false; update(); }, 1800);
    };
    listen(element, "pointerenter", update);
    listen(element, "pointerleave", update);
    listen(element, "focusin", update);
    listen(element, "focusout", () => queueMicrotask(update));
    listen(element, "wheel", hold);
    listen(element, "keydown", hold);
    listen(element, "pointerdown", () => { pointerDown = true; hold(); });
    listen(window, "pointerup", () => {
      if (pointerDown) { pointerDown = false; hold(); }
    });
    listen(window, "pointercancel", () => { pointerDown = false; update(); });
    listen(document, "visibilitychange", update);
    listen(motion, "change", update);
    listen(window, "pagehide", () => { suspended = true; update(); });
    listen(window, "pageshow", () => { suspended = false; pointerDown = false; update(); });
    const cancelReady = onImagesReady(images, () => { onReady(); ready = true; update(); });
    return {
      destroy() {
        destroyed = true;
        clearInterval(timer);
        clearTimeout(quietTimer);
        cancelReady();
        removers.forEach((remove) => remove());
      },
    };
  }

  function cycleWorks(worksList, images) {
    return createAutoCycle(worksList, () => {
      const first = worksList.querySelector(".work");
      if (!first) return;
      const gap = Number.parseFloat(getComputedStyle(worksList).gap) || 0;
      const step = first.getBoundingClientRect().width + gap;
      const maxScroll = worksList.scrollWidth - worksList.clientWidth;
      if (step <= 0 || maxScroll <= 0) return;
      const next = worksList.scrollLeft + step;
      worksList.scrollTo({ left: next >= maxScroll - 1 ? 0 : next, behavior: "smooth" });
    }, images, 4000, restorePageState);
  }

  function setupHorizontalScroll(list) {
    if (!list || wheelLists.has(list)) return;
    wheelLists.add(list);
    let start = 0;
    let distance = 0;
    let snapTimer;
    let releaseTimer;
    const reset = () => {
      clearTimeout(snapTimer);
      clearTimeout(releaseTimer);
      distance = 0;
      list.classList.remove("is-wheel-scrolling");
    };
    window.addEventListener("pagehide", reset);
    list.addEventListener("wheel", (event) => {
      if (event.ctrlKey || list.scrollWidth <= list.clientWidth) return;
      let delta = Math.abs(event.deltaY) > Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
      if (event.deltaMode === 1) delta *= 16;
      if (event.deltaMode === 2) delta *= window.innerHeight;
      const max = list.scrollWidth - list.clientWidth;
      if (!delta || (list.scrollLeft <= 0 && delta < 0) || (list.scrollLeft >= max && delta > 0)) return;
      event.preventDefault();
      list.classList.add("is-wheel-scrolling");
      clearTimeout(snapTimer);
      clearTimeout(releaseTimer);
      if (!distance) start = list.scrollLeft;
      distance += delta * 1.6;
      list.scrollLeft += delta * 1.6;
      snapTimer = setTimeout(() => {
        const rect = list.getBoundingClientRect();
        const padding = Number.parseFloat(getComputedStyle(list).scrollPaddingLeft) || 0;
        const positions = [...list.children]
          .filter((item) => item.getBoundingClientRect().width > 0)
          .map((item) => Math.min(max, Math.max(0,
            item.getBoundingClientRect().left - rect.left + list.scrollLeft - padding)));
        if (positions.length > 1) {
          const nearest = positions.reduce((best, pos, i) =>
            Math.abs(pos - start) < Math.abs(positions[best] - start) ? i : best, 0);
          const step = positions[nearest + 1] - positions[nearest] || positions[nearest] - positions[nearest - 1];
          if (step > 0) {
            const target = Math.max(0, Math.min(positions.length - 1,
              nearest + Math.sign(distance) * Math.max(1, Math.round(Math.abs(distance) / step))));
            list.scrollTo({ left: positions[target], behavior: motion.matches ? "instant" : "smooth" });
          }
        }
        distance = 0;
        releaseTimer = setTimeout(reset, motion.matches ? 0 : 900);
      }, 180);
    }, { passive: false });
    list.addEventListener("keydown", (event) => {
      if (event.target !== list || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      event.preventDefault();
      list.scrollBy({ left: list.clientWidth * (event.key === "ArrowLeft" ? -0.8 : 0.8),
        behavior: motion.matches ? "instant" : "smooth" });
    });
  }

  const pageKey = () => location.pathname + location.search + location.hash;
  function readPageState() {
    const state = history.state?.flowerPage;
    return state?.url === pageKey() ? state : null;
  }

  function savePageState(extra = {}) {
    const scroll = {};
    document.querySelectorAll("[data-restore-scroll]").forEach((element) => {
      scroll[element.dataset.restoreScroll] = { left: element.scrollLeft, top: element.scrollTop };
    });
    const selectedProjectId = document.querySelector(".archiveProjectList")?.dataset.selectedProjectId;
    try {
      history.replaceState({ ...history.state, flowerPage: {
        ...readPageState(), url: pageKey(), x: window.scrollX, y: window.scrollY,
        scroll, ...(selectedProjectId ? { selectedProjectId } : {}), ...extra,
      } }, "");
    } catch { /* 이탈 중 기록을 갱신할 수 없으면 직전에 저장한 상태를 사용합니다. */ }
  }

  function restorePageState() {
    const state = readPageState();
    if (!state) return;
    document.querySelectorAll("[data-restore-scroll]").forEach((element) => {
      const position = state.scroll?.[element.dataset.restoreScroll];
      if (position) element.scrollTo({ left: position.left, top: position.top, behavior: "instant" });
    });
    window.scrollTo({ left: state.x || 0, top: state.y || 0, behavior: "instant" });
  }

  function finishDetailLoading(error = false) {
    document.body.classList.remove("detail-loading");
    document.body.classList.toggle("detail-error", error);
    document.querySelector("main")?.setAttribute("aria-busy", "false");
    restorePageState();
  }

  return { motion, saveData, readData, fetchJSON, onImagesReady, setImageLoadingState,
    createAutoCycle, cycleWorks, setupHorizontalScroll, savePageState, readPageState,
    restorePageState, finishDetailLoading };
})();
