async function initializeExhibition() {
  const params = new URLSearchParams(window.location.search);
  const exhibitionId = params.get("id");
  if (!exhibitionId) {
    renderExhibitionError("전시 id가 없습니다.");
    return;
  }

  try {
    const handoff = FlowerSite.readData("exhibition-handoff", 30000, true);
    if (handoff?.exhibition?.id === exhibitionId) {
      renderExhibition(handoff.exhibition, handoff.image);
      FlowerSite.finishDetailLoading();
      return;
    }

    let data = FlowerSite.readData("exhibitions", 300000);
    if (!data) {
      data = await FlowerSite.fetchJSON("../assets/json/exhibitions.json");
      FlowerSite.saveData("exhibitions", data);
    }

    const exhibitions = Array.isArray(data.exhibitions) ? data.exhibitions : [];
    const exhibition = exhibitions.find((item) => item.id === exhibitionId);

    if (!exhibition) {
      renderExhibitionError("전시를 찾을 수 없습니다.");
      return;
    }

    renderExhibition(exhibition);
    const image = document.querySelector(".flowerNight img");
    if (image && exhibition.image) {
      image.hidden = true;
      FlowerSite.onImagesReady([image], () => {
        image.hidden = image.naturalWidth === 0;
        FlowerSite.finishDetailLoading();
      });
    } else {
      FlowerSite.finishDetailLoading();
    }
  } catch (error) {
    console.error("전시 데이터를 불러오지 못했습니다:", error);
    renderExhibitionError("전시 정보를 불러오지 못했습니다.");
  }
}

function renderExhibition(item, cachedImage = null) {
  const imageEl = document.querySelector(".flowerNight img");
  const titleEl = document.querySelector(".flowerNight h2");
  const textContainer = document.querySelector(".flowerNightText");

  if (imageEl && item.image) {
    const imageUrl = new URL(item.image, window.location.href).href;
    // 목록과 주소가 같을 때만 크기와 URL을 재사용합니다.
    if (cachedImage?.src === imageUrl && cachedImage.width > 0 && cachedImage.height > 0) {
      imageEl.width = cachedImage.width;
      imageEl.height = cachedImage.height;
    }
    imageEl.addEventListener("error", () => { imageEl.hidden = true; }, { once: true });
    imageEl.src = imageUrl;
    imageEl.alt = item.title || "전시 이미지";
    imageEl.hidden = false;
  }

  if (titleEl) {
    titleEl.textContent = item.title || "";
  }

  document.title = `꽃: 소식 - ${item.title || "꽃밤"}`;

  if (textContainer) {
    const participants = Array.isArray(item.participants) ? item.participants : [];
    const descriptions = Array.isArray(item.description) ? item.description : [];

    const participantLines = chunkArray(participants, 2)
      .map((group) => `${group.join(" ")}<br>`)
      .join("");

    textContainer.innerHTML = `
      ${descriptions.map((text) => `<p>${text}</p>`).join("")}
      <p>기간: ${item.duration || ""}<br>장소: ${item.place || ""}</p>
      <p>${participantLines}</p>
    `;
  }
}

function renderExhibitionError(message) {
  FlowerSite.finishDetailLoading(true);
  const titleEl = document.querySelector(".flowerNight h2");
  if (titleEl) titleEl.textContent = message;
}

function chunkArray(array, size) {
  const result = [];

  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }

  return result;
}

// defer 스크립트에서 전달받은 정보는 첫 화면을 그리기 전에 바로 반영합니다.
initializeExhibition();
