let exhibitionCycleTimer = null;

document.addEventListener("DOMContentLoaded", () => {
  const worksList = document.querySelector(".worksList");
  if (!worksList) return;

  const normalizeWheelDelta = (event) => {
    let delta = Math.abs(event.deltaY) > Math.abs(event.deltaX)
      ? event.deltaY
      : event.deltaX;

    // deltaMode 보정
    // 0: pixel, 1: line, 2: page
    if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
      delta *= 16;
    } else if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
      delta *= window.innerHeight;
    }

    return delta;
  };

  worksList.addEventListener(
    "wheel",
    (event) => {
      const hasHorizontalOverflow =
        worksList.scrollWidth > worksList.clientWidth;

      if (!hasHorizontalOverflow) return;

      const delta = normalizeWheelDelta(event);
      if (delta === 0) return;

      const maxScrollLeft = worksList.scrollWidth - worksList.clientWidth;
      const currentScrollLeft = worksList.scrollLeft;

      const isScrollingRight = delta > 0;
      const isScrollingLeft = delta < 0;

      const canScrollRight = currentScrollLeft < maxScrollLeft;
      const canScrollLeft = currentScrollLeft > 0;

      // 가로 스크롤이 더 이상 불가능하면 세로 페이지 스크롤을 막지 않음
      if (
        (isScrollingRight && !canScrollRight) ||
        (isScrollingLeft && !canScrollLeft)
      ) {
        return;
      }

      event.preventDefault();

      const speed = 1.6;
      worksList.scrollLeft += delta * speed;
    },
    { passive: false }
  );

});

document.addEventListener("DOMContentLoaded", async () => {
  const list = document.getElementById("exhibitionList");
  if (!list) return;

  try {
    const response = await fetch("../assets/json/exhibitions.json");
    const data = await response.json();

    const exhibitions = Array.isArray(data.exhibitions) ? data.exhibitions : [];

    renderExhibitions(list, exhibitions);
    startExhibitionCycle(list);
  } catch (error) {
    console.error("전시 데이터를 불러오지 못했습니다:", error);
    list.innerHTML = "<p>전시 정보를 불러오지 못했습니다.</p>";
  }
});

function renderExhibitions(container, exhibitions) {
  container.innerHTML = "";

  const ordered = [...exhibitions].reverse();

  ordered.forEach((item) => {
    const card = document.createElement("a");
    card.className = "work";
    card.href = `./exhibition.html?id=${encodeURIComponent(item.id)}`;

    card.innerHTML = `
      ${item.image ? `<img class="workImg border" src="${item.image}" alt="${item.title || "전시 이미지"}">` : ""}
    `;

    container.appendChild(card);
  });
}

function startExhibitionCycle(worksList) {
  stopExhibitionCycle();

  const works = [...worksList.querySelectorAll(".work")];
  if (works.length < 2) return;

  const beginCycle = () => {
    const firstWork = works[0];
    if (!firstWork) return;

    const gap = Number.parseFloat(window.getComputedStyle(worksList).gap || "0") || 0;
    const step = firstWork.getBoundingClientRect().width + gap;
    const maxScroll = worksList.scrollWidth - worksList.clientWidth;

    if (step <= 0 || maxScroll <= 0) return;

    exhibitionCycleTimer = setInterval(() => {
      const nextScroll = worksList.scrollLeft + step;

      if (nextScroll >= maxScroll - 1) {
        worksList.scrollTo({ left: 0, behavior: "smooth" });
        return;
      }

      worksList.scrollTo({ left: nextScroll, behavior: "smooth" });
    }, 4000);
  };

  const images = [...worksList.querySelectorAll("img")];
  if (!images.length || images.every((image) => image.complete)) {
    requestAnimationFrame(beginCycle);
    return;
  }

  let remaining = images.length;
  const finishLoading = () => {
    remaining -= 1;
    if (remaining === 0) requestAnimationFrame(beginCycle);
  };

  images.forEach((image) => {
    image.addEventListener("load", finishLoading, { once: true });
    image.addEventListener("error", finishLoading, { once: true });
  });
}

function stopExhibitionCycle() {
  if (exhibitionCycleTimer) {
    clearInterval(exhibitionCycleTimer);
    exhibitionCycleTimer = null;
  }
}