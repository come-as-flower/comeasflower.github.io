document.addEventListener("DOMContentLoaded", async () => {
  const params = new URLSearchParams(window.location.search);
  const exhibitionId = params.get("id");
  if (!exhibitionId) return;

  try {
    const response = await fetch("../assets/json/exhibitions.json");
    const data = await response.json();

    const exhibitions = Array.isArray(data.exhibitions) ? data.exhibitions : [];
    const exhibition = exhibitions.find((item) => item.id === exhibitionId);

    if (!exhibition) {
      console.warn("전시를 찾을 수 없습니다:", exhibitionId);
      return;
    }

    renderExhibition(exhibition);
  } catch (error) {
    console.error("전시 데이터를 불러오지 못했습니다:", error);
  }
});

function renderExhibition(item) {
  const imageEl = document.querySelector(".flowerNight img");
  const titleEl = document.querySelector(".flowerNight h2");
  const textContainer = document.querySelector(".flowerNightText");

  if (imageEl && item.image) {
    imageEl.src = item.image;
    imageEl.alt = item.title || "전시 이미지";
  }

  if (titleEl) {
    titleEl.textContent = item.title || "";
  }

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

function chunkArray(array, size) {
  const result = [];

  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }

  return result;
}