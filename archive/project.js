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

let currentProject = null;
let selectedWorkIndex = null;
let selectedImageIndex = 0;
let slideTimer = null;
let baseProjectInfo = null;

document.addEventListener("DOMContentLoaded", async () => {
  const params = new URLSearchParams(window.location.search);
  const projectId = params.get("id");

  if (!projectId) {
    renderError("프로젝트 id가 없습니다.");
    return;
  }

  bindViewerControls();

  try {
    const response = await fetch("../assets/json/project.json");
    const jsonData = await response.json();

    const projectGroups = getProjectGroups(jsonData);
    const projectResult = findProjectById(jsonData, projectId);

    renderGenerationMenu(projectGroups, projectResult?.generationId || "");

    if (!projectResult) {
      renderError("프로젝트를 찾을 수 없습니다.");
      return;
    }

    const project = projectResult.project;

    currentProject = project;
    cacheBaseProjectInfo(project);
    renderProject(project);
  } catch (error) {
    console.error("프로젝트 데이터를 불러오는 중 오류 발생:", error);
    renderError("프로젝트 데이터를 불러오지 못했습니다.");
  }
});

function bindViewerControls() {
  const prevButton = document.querySelector(".focusNav.prev");
  const nextButton = document.querySelector(".focusNav.next");

  prevButton?.addEventListener("click", showPrevImage);
  nextButton?.addEventListener("click", showNextImage);

  document.addEventListener("keydown", (event) => {
    if (selectedWorkIndex === null) return;

    if (event.key === "Escape") {
      clearSelectedWork();
    }

    if (event.key === "ArrowLeft") {
      showPrevImage();
    }

    if (event.key === "ArrowRight") {
      showNextImage();
    }
  });
}

function renderProject(project) {
  restoreProjectInfo();

  const worksList = document.querySelector(".worksList");
  if (!worksList) return;

  worksList.innerHTML = "";

  (project.works || []).forEach((work, index) => {
    const images = normalizeImages(work);
    const thumbSrc = images[0] ? buildImageUrl(images[0], "w900") : "";

    const workDiv = document.createElement("div");
    workDiv.className = "work";
    workDiv.dataset.index = String(index);

    workDiv.innerHTML = `
      <button class="workThumbButton" type="button" aria-label="${escapeHtml(
        work.title || work.creator || "작품"
      )} 보기">
        ${
          thumbSrc
            ? `<img class="workImg border" src="${thumbSrc}" alt="${escapeHtml(
                work.title || work.creator || "작품 이미지"
              )}">`
            : ""
        }
      </button>
    `;

    const thumbButton = workDiv.querySelector(".workThumbButton");
    thumbButton?.addEventListener("click", () => {
      if (selectedWorkIndex === index) {
        clearSelectedWork();
      } else {
        selectWork(index);
      }
    });

    worksList.appendChild(workDiv);
  });
}

function getProjectGroups(projectData) {
  return Object.entries(projectData)
    .filter(([, projects]) => Array.isArray(projects))
    .map(([key, projects]) => {
      const generationId = getGenerationIdFromKey(key);

      return {
        id: generationId,
        label: `${generationId}기`,
        projects,
      };
    })
    .sort((a, b) => Number(b.id) - Number(a.id));
}

function findProjectById(projectData, projectId) {
  for (const [key, projects] of Object.entries(projectData)) {
    if (!Array.isArray(projects)) continue;

    const project = projects.find((item) => item.id === projectId);

    if (project) {
      const generationId = getGenerationIdFromKey(key);

      return {
        project,
        generationId,
      };
    }
  }

  return null;
}

function getGenerationIdFromKey(key) {
  const match = String(key).match(/\d+/);
  return match ? match[0] : String(key);
}

function renderGenerationMenu(groups, selectedGenerationId) {
  const menu = document.querySelector(".listMenu");
  if (!menu) return;

  menu.innerHTML = "";

  groups.forEach((group) => {
    const item = document.createElement("li");
    item.className = "radioButton";

    if (group.id === selectedGenerationId) {
      item.classList.add("selected");
    }

    const link = document.createElement("a");
    link.href = `../archive/#${group.id}`;
    link.dataset.target = group.id;
    link.textContent = group.label;

    item.appendChild(link);
    menu.appendChild(item);
  });
}

function selectWork(index) {
  if (!currentProject || !currentProject.works?.[index]) return;

  const work = currentProject.works[index];
  const images = normalizeImages(work);

  selectedWorkIndex = index;
  selectedImageIndex = 0;

  document.body.classList.add("work-selected");
  updateSelectedThumbnail(index);
  updateRightPanel(work);
  updateFocusViewer(images, selectedImageIndex);
  startAutoSlide(images);
}

function clearSelectedWork() {
  selectedWorkIndex = null;
  selectedImageIndex = 0;

  document.body.classList.remove("work-selected");
  updateSelectedThumbnail(null);
  restoreProjectInfo();
  stopAutoSlide();

  const viewer = document.getElementById("focusViewer");
  const viewerImg = document.getElementById("focusViewerImg");

  if (viewer) {
    viewer.hidden = true;
  }

  if (viewerImg) {
    viewerImg.src = "";
    viewerImg.alt = "";
  }
}

function updateSelectedThumbnail(selectedIndex) {
  const works = document.querySelectorAll(".worksList .work");

  works.forEach((workEl, index) => {
    workEl.classList.toggle("is-selected", index === selectedIndex);
  });
}

function updateRightPanel(work) {
  const titleEl = document.querySelector(".flowerNightExplanation h2");
  const textEls = document.querySelectorAll(".flowerNightText p");

  if (titleEl) {
    titleEl.textContent = work.title || work.creator || currentProject?.name || "";
  }

  if (textEls[0]) {
    textEls[0].innerHTML = work.description || "";
  }

  if (textEls[1]) {
    textEls[1].textContent = work.creator ? `작업자: ${work.creator}` : "";
  }

  if (textEls[2]) {
    textEls[2].textContent = "";
  }
}

function restoreProjectInfo() {
  if (!baseProjectInfo) return;

  const titleEl = document.querySelector(".flowerNightExplanation h2");
  const textEls = document.querySelectorAll(".flowerNightText p");

  if (titleEl) {
    titleEl.textContent = baseProjectInfo.title;
  }

  if (textEls[0]) {
    textEls[0].textContent = baseProjectInfo.text1;
  }

  if (textEls[1]) {
    textEls[1].textContent = baseProjectInfo.text2;
  }

  if (textEls[2]) {
    textEls[2].textContent = baseProjectInfo.text3;
  }
}

function cacheBaseProjectInfo(project) {
  baseProjectInfo = {
    title: project.name || "",
    text1: project.description || "",
    text2: project.duration ? `작업 기간: ${project.duration}` : "",
    text3: project.output ? `결과물 형태: ${project.output}` : "",
  };
}

function normalizeImages(work) {
  if (Array.isArray(work.images) && work.images.length > 0) {
    return work.images;
  }

  if (work.image) {
    return [work.image];
  }

  return [];
}

function updateFocusViewer(images, index) {
  const viewer = document.getElementById("focusViewer");
  const img = document.getElementById("focusViewerImg");

  if (!viewer || !img) return;

  if (!images.length) {
    viewer.hidden = true;
    img.src = "";
    img.alt = "";
    return;
  }

  viewer.hidden = false;
  img.src = buildImageUrl(images[index], "w1600");
  img.alt = currentProject?.works?.[selectedWorkIndex]?.title || "선택한 작품 이미지";
}

function startAutoSlide(images) {
  stopAutoSlide();

  if (!images || images.length <= 1) return;

  slideTimer = setInterval(() => {
    selectedImageIndex = (selectedImageIndex + 1) % images.length;
    updateFocusViewer(images, selectedImageIndex);
  }, 4000);
}

function stopAutoSlide() {
  if (slideTimer) {
    clearInterval(slideTimer);
    slideTimer = null;
  }
}

function showPrevImage() {
  const work = currentProject?.works?.[selectedWorkIndex];
  if (!work) return;

  const images = normalizeImages(work);
  if (images.length <= 1) return;

  selectedImageIndex = (selectedImageIndex - 1 + images.length) % images.length;
  updateFocusViewer(images, selectedImageIndex);
  startAutoSlide(images);
}

function showNextImage() {
  const work = currentProject?.works?.[selectedWorkIndex];
  if (!work) return;

  const images = normalizeImages(work);
  if (images.length <= 1) return;

  selectedImageIndex = (selectedImageIndex + 1) % images.length;
  updateFocusViewer(images, selectedImageIndex);
  startAutoSlide(images);
}

function buildImageUrl(value, size = "w1600") {
  if (!value) return "";

  if (
    value.startsWith("http://") ||
    value.startsWith("https://") ||
    value.startsWith("../../") ||
    value.startsWith("../") ||
    value.startsWith("./") ||
    value.startsWith("/")
  ) {
    return value;
  }

  return `https://drive.google.com/thumbnail?id=${value}&sz=${size}`;
}

function renderError(message) {
  const titleEl = document.querySelector(".flowerNightExplanation h2");
  const textEls = document.querySelectorAll(".flowerNightText p");
  const worksList = document.querySelector(".worksList");
  const viewer = document.getElementById("focusViewer");

  if (titleEl) {
    titleEl.textContent = message;
  }

  if (textEls[0]) textEls[0].textContent = "";
  if (textEls[1]) textEls[1].textContent = "";
  if (textEls[2]) textEls[2].textContent = "";

  if (worksList) {
    worksList.innerHTML = "";
  }

  if (viewer) {
    viewer.hidden = true;
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}