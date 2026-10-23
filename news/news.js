let exhibitionCycleTimer = null;
let exhibitionNavigationId = 0;

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
    const data = await FlowerSite.fetchJSON("../assets/json/exhibitions.json");
    FlowerSite.saveData("exhibitions", data);

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

    card.addEventListener("click", async (event) => {
      const image = card.querySelector("img");
      saveExhibitionHandoff(item, image);

      // 새 탭 열기 등 링크의 기본 동작은 유지합니다.
      if (event.defaultPrevented || event.button !== 0 || event.metaKey ||
          event.ctrlKey || event.shiftKey || event.altKey) return;

      event.preventDefault();
      const navigationId = ++exhibitionNavigationId;

      // 목록의 이미지가 준비되면 상세에서도 같은 URL의 캐시를 사용합니다.
      // 아직 로드 중이어도 이동을 무한정 기다리게 하지는 않습니다.
      if (image?.decode) {
        let timeout;
        try {
          await Promise.race([
            image.decode(),
            new Promise((resolve) => { timeout = setTimeout(resolve, 1200); }),
          ]);
        } catch {
          // 이미지 실패가 텍스트 상세 정보로의 이동을 막지 않도록 합니다.
        } finally {
          clearTimeout(timeout);
        }
      }

      if (navigationId !== exhibitionNavigationId) return;
      saveExhibitionHandoff(item, image);
      window.location.assign(card.href);
    });

    container.appendChild(card);
  });
}

function saveExhibitionHandoff(exhibition, image) {
  FlowerSite.saveData("exhibition-handoff", {
    exhibition,
    image: image?.naturalWidth > 0 ? {
      src: image.currentSrc || image.src,
      width: image.naturalWidth,
      height: image.naturalHeight,
    } : null,
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