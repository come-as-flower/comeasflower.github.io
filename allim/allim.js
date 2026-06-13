document.addEventListener("DOMContentLoaded", async () => {
  const listContainer = document.querySelector(".allimContainer");
  const detailContainer = document.getElementById("content");
  const closeButton = document.getElementById("closeContent");

  if (!listContainer || !detailContainer || !closeButton) return;

  let notices = [];
  let selectedIndex = -1;

  const isMobile = () => window.innerWidth <= 1200;

  function renderDetail(item) {
    detailContainer.innerHTML = `
      <div class="notice-contents">
        <div class="notice-contents-inner">
          <h2>${item.title}</h2>
          ${item.contents.map((paragraph) => `<p>${paragraph}</p>`).join("")}
        </div>
        <p class="notice-date-right">${item.date}</p>
      </div>
    `;
  }

  function setSelected(index) {
    selectedIndex = index;

    const noticeItems = listContainer.querySelectorAll(".notice-item");
    noticeItems.forEach((item, itemIndex) => {
      item.classList.toggle("selected", itemIndex === index);
    });
  }

  function openDetailPanel() {
    if (!isMobile()) return;

    const alreadyOpen = detailContainer.classList.contains("show");
    detailContainer.classList.add("show");

    if (!alreadyOpen) {
      history.pushState({ noticePanelOpen: true }, "", location.href);
    }
  }

  function closeDetailPanel() {
    detailContainer.classList.remove("show");

    if (history.state?.noticePanelOpen) {
      history.back();
    }
  }

  function handleNoticeClick(index) {
    const item = notices[index];
    if (!item) return;

    setSelected(index);
    renderDetail(item);

    if (isMobile()) {
      openDetailPanel();
    }
  }

  function renderList(data) {
    listContainer.innerHTML = "";

    data.forEach((item, index) => {
      const noticeItem = document.createElement("button");
      noticeItem.type = "button";
      noticeItem.className = "notice-item";
      noticeItem.innerHTML = `
        <div class="notice-exp">
          <h3 class="notice-title">${item.title}</h3>
          <p class="notice-date">${item.date}</p>
        </div>
      `;

      noticeItem.addEventListener("click", () => {
        handleNoticeClick(index);
      });

      listContainer.appendChild(noticeItem);
    });
  }

  closeButton.addEventListener("click", () => {
    if (isMobile() && detailContainer.classList.contains("show")) {
      closeDetailPanel();
      return;
    }

    if (typeof goBack === "function") {
      goBack();
    }
  });

  window.addEventListener("popstate", () => {
    if (isMobile()) {
      detailContainer.classList.remove("show");
    }
  });

  window.addEventListener("resize", () => {
    if (!isMobile()) {
      detailContainer.classList.remove("show");

      if (selectedIndex >= 0 && notices[selectedIndex]) {
        renderDetail(notices[selectedIndex]);
      }
    }
  });

  try {
    const response = await fetch("../assets/json/allim.json");
    const data = await response.json();

    notices = Array.isArray(data) ? data : [];
    renderList(notices);

    if (notices.length === 0) {
      detailContainer.innerHTML = "<p>등록된 알림이 없습니다.</p>";
      return;
    }

    if (!isMobile()) {
      setSelected(0);
      renderDetail(notices[0]);
    } else {
      detailContainer.innerHTML = `
        <div class="notice-contents">
          <div class="notice-contents-inner">
            <h2>알림</h2>
            <p>목록에서 알림을 선택해 주세요.</p>
          </div>
        </div>
      `;
    }
  } catch (error) {
    console.error("JSON 불러오기 실패:", error);
    detailContainer.innerHTML = "<p>알림을 불러오지 못했습니다.</p>";
  }
});