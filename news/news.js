let exhibitionCycleTimer = null;
let exhibitionNavigationId = 0;

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
  exhibitionCycleTimer?.destroy();
  exhibitionCycleTimer = FlowerSite.cycleWorks(worksList, [...worksList.querySelectorAll("img")]);
}
