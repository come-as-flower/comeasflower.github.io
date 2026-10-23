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
let worksCycleTimer = null;
let baseProjectInfo = null;

async function initializeProject() {
  const params = new URLSearchParams(window.location.search);
  const projectId = params.get("id");

  if (!projectId) {
    renderError("프로젝트 id가 없습니다.");
    return;
  }

  bindViewerControls();

  try {
    const handoff = FlowerSite.readData("project-handoff", 30000, true);
    let jsonData = handoff?.projectId === projectId ? handoff.data : null;
    if (!jsonData) jsonData = FlowerSite.readData("projects", 300000);
    if (!jsonData) {
      jsonData = await FlowerSite.fetchJSON("../assets/json/project.json");
      FlowerSite.saveData("projects", jsonData);
    }

    const projectResult = findProjectById(jsonData, projectId);

    if (!projectResult) {
      renderError("프로젝트를 찾을 수 없습니다.");
      return;
    }

    const project = projectResult.project;
    document.title = `꽃: 모아보기 - ${project.name || "프로젝트"}`;

    currentProject = project;
    cacheBaseProjectInfo(project);
    renderProjectTagMenu(getAllProjectTags(jsonData));
    renderProject(project);
    FlowerSite.finishDetailLoading();
  } catch (error) {
    console.error("프로젝트 데이터를 불러오는 중 오류 발생:", error);
    renderError("프로젝트 데이터를 불러오지 못했습니다.");
  }
}

// head의 defer 스크립트이므로 DOM이 준비된 상태에서 첫 표시 전에 그립니다.
initializeProject();

function bindViewerControls() {
  const prevButton = document.querySelector(".focusNav.prev");
  const nextButton = document.querySelector(".focusNav.next");
  const focusViewer = document.getElementById("focusViewer");

  prevButton?.addEventListener("click", showPrevImage);
  nextButton?.addEventListener("click", showNextImage);

  document.addEventListener("click", (event) => {
    if (selectedWorkIndex === null) return;
    if (focusViewer?.contains(event.target)) return;
    if (event.target.closest(".workThumbButton")) return;

    clearSelectedWork();
  });

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

  clearSelectedWork();
  startWorksListCycle(worksList);
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

function renderProjectTagMenu(tags) {
  const menu = document.querySelector(".listMenu");
  if (!menu) return;

  menu.innerHTML = "";

  const allTags = ["전체", ...tags];

  allTags.forEach((tag, index) => {
    const item = document.createElement("li");
    item.className = "radioButton";

    if (index === 0) {
      item.classList.add("selected");
    }

    const link = document.createElement("a");
    link.href = tag === "전체" ? "../archive/#all" : `../archive/#${encodeURIComponent(tag)}`;
    link.textContent = tag;

    item.appendChild(link);
    menu.appendChild(item);
  });
}

function getProjectTags(project) {
  return String(project?.output || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function getAllProjectTags(projectData) {
  return [...new Set(
    Object.values(projectData)
      .filter((projects) => Array.isArray(projects))
      .flatMap((projects) => projects.flatMap((project) => getProjectTags(project)))
  )];
}

function selectWork(index) {
  if (!currentProject || !currentProject.works?.[index]) return;

  const work = currentProject.works[index];
  const images = normalizeImages(work);

  selectedWorkIndex = index;
  selectedImageIndex = 0;

  stopWorksListCycle();
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
  const inner = viewer?.querySelector(".focusViewerInner");
  const viewerImg = document.getElementById("focusViewerImg");

  if (viewer) {
    viewer.hidden = true;
  }

  if (inner) {
    inner.innerHTML = "";
  }

  if (viewerImg) {
    viewerImg.src = "";
    viewerImg.alt = "";
  }

  startWorksListCycle(document.querySelector(".projectWorksList"));
}

function startWorksListCycle(worksList) {
  stopWorksListCycle();

  if (!worksList) {
    return;
  }

  const works = [...worksList.querySelectorAll(".work")];
  if (works.length < 2) return;

  const beginCycle = () => {
    const firstWork = works[0];
    if (!firstWork) return;

    const gap = Number.parseFloat(window.getComputedStyle(worksList).gap || "0") || 0;
    const step = firstWork.getBoundingClientRect().width + gap;
    const maxScroll = worksList.scrollWidth - worksList.clientWidth;

    if (step <= 0 || maxScroll <= 0) return;

    worksCycleTimer = setInterval(() => {
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

function stopWorksListCycle() {
  if (worksCycleTimer) {
    clearInterval(worksCycleTimer);
    worksCycleTimer = null;
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
    textEls[1].textContent = work.creator ? work.creator : "";
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
  const creators = [...new Set(
    (project.works || [])
      .map((work) => work.creator?.trim())
      .filter(Boolean)
  )];

  baseProjectInfo = {
    title: project.name || "",
    text1: project.description || "",
    text2: project.duration || "",
    text3: creators.join(" "),
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
  const inner = viewer?.querySelector(".focusViewerInner");

  if (!viewer || !inner) return;

  if (!images.length) {
    viewer.hidden = true;
    inner.innerHTML = "";
    return;
  }

  viewer.hidden = false;
  inner.innerHTML = "";

  const track = document.createElement("div");
  track.className = "focusViewerTrack";

  const slide = document.createElement("div");
  slide.className = "focusViewerSlide";

  const img = document.createElement("img");
  img.className = "focusViewerImg";
  img.id = "focusViewerImg";
  img.src = buildImageUrl(images[index], "w1600");
  img.alt = currentProject?.works?.[selectedWorkIndex]?.title || "선택한 작품 이미지";
  img.loading = "eager";

  slide.appendChild(img);
  track.appendChild(slide);
  inner.appendChild(track);
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
  FlowerSite.finishDetailLoading(true);
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