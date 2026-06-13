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