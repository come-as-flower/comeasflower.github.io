// 페이지 간 데이터, 이미지 준비, 갤러리 동작을 한곳에서 관리합니다.
window.FlowerSite = (() => {

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

  function finishDetailLoading(error = false) {
    document.body.classList.remove("detail-loading");
    document.body.classList.toggle("detail-error", error);
    document.querySelector("main")?.setAttribute("aria-busy", "false");
  }

  return { saveData, readData, fetchJSON, onImagesReady, setImageLoadingState, finishDetailLoading };
})();
