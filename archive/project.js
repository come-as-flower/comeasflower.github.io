let currentProject = null;
let selectedWorkIndex = null;
let selectedImageIndex = 0;
let slideTimer = null;
let worksCycleTimer = null;
let baseProjectInfo = null;
let lastWorkTrigger = null;

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
  const focusViewer = document.getElementById("focusViewer");

  focusViewer?.addEventListener("click", (event) => {
    const navigationButton = event.target.closest(".focusNav");
    if (!navigationButton) return;

    event.stopPropagation();
    if (navigationButton.classList.contains("prev")) {
      showPrevImage();
    } else {
      showNextImage();
    }
  });

  document.addEventListener("click", (event) => {
    if (selectedWorkIndex === null) return;
    if (event.target.closest(".focusViewerImg, .focusNav")) return;
    if (event.target.closest(".workThumbButton")) return;
    clearSelectedWork();
  });

  document.addEventListener("keydown", (event) => {
    if (selectedWorkIndex === null) return;

    if (event.key === "Escape") {
      clearSelectedWork();
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      showPrevImage();
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
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
            ? `<img class="workImg border" src="${thumbSrc}" loading="${
                index < 2 ? "eager" : "lazy"
              }" decoding="async" alt="${escapeHtml(
                work.title || work.creator || "작품 이미지"
              )}">`
            : ""
        }
      </button>
    `;

    const thumbButton = workDiv.querySelector(".workThumbButton");
    const thumbnail = thumbButton?.querySelector(".workImg");
    if (thumbnail) {
      thumbButton.classList.add("is-image-loading");
      FlowerSite.setImageLoadingState(thumbnail, thumbButton);
    }

    thumbButton?.addEventListener("click", (event) => {
      if (selectedWorkIndex === index) {
        clearSelectedWork();
      } else {
        selectWork(index, event.detail === 0);
      }
    });

    worksList.appendChild(workDiv);
  });

  clearSelectedWork();
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

function selectWork(index, focusViewer = false) {
  if (!currentProject || !currentProject.works?.[index]) return;

  const work = currentProject.works[index];
  const images = normalizeImages(work);

  if (selectedWorkIndex === null) lastWorkTrigger = document.activeElement;
  selectedWorkIndex = index;
  selectedImageIndex = 0;

  stopWorksListCycle();
  document.body.classList.add("work-selected");
  updateSelectedThumbnail(index);
  updateRightPanel(work);
  updateFocusViewer(images, selectedImageIndex);
  startAutoSlide(images);
  if (focusViewer) document.querySelector(".focusNav.next")?.focus({ preventScroll: true });
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

  const worksList = document.querySelector(".projectWorksList");
  startWorksListCycle(worksList);
  if (lastWorkTrigger?.isConnected) lastWorkTrigger.focus({ preventScroll: true });
  lastWorkTrigger = null;
}

function startWorksListCycle(worksList) {
  stopWorksListCycle();
  if (!worksList || worksList.children.length < 2) return;
  worksCycleTimer = FlowerSite.cycleWorks(worksList,
    [...worksList.querySelectorAll("img")].slice(0, 2));
}

function stopWorksListCycle() {
  worksCycleTimer?.destroy();
  worksCycleTimer = null;
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
    textEls[2].replaceChildren();
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
    textEls[2].replaceChildren();

    baseProjectInfo.creators.forEach((creator, index) => {
      const creatorButton = document.createElement("button");
      creatorButton.type = "button";
      creatorButton.className = "projectCreatorButton";
      creatorButton.textContent = creator;
      creatorButton.addEventListener("click", (event) => {
        event.stopPropagation();
        selectCreatorWork(creator, event.detail === 0);
      });

      textEls[2].appendChild(creatorButton);
      if (index < baseProjectInfo.creators.length - 1) {
        textEls[2].append(" ");
      }
    });
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
    creators,
  };
}

function selectCreatorWork(creator, focusViewer = false) {
  const workIndex = (currentProject?.works || []).findIndex(
    (work) => work.creator?.trim() === creator
  );

  if (workIndex >= 0) {
    selectWork(workIndex, focusViewer);
  }
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

  const focusedControl = document.activeElement?.classList.contains("focusNav")
    ? (document.activeElement.classList.contains("prev") ? ".prev" : ".next") : null;
  viewer.hidden = false;
  inner.innerHTML = "";

  const track = document.createElement("div");
  track.className = "focusViewerTrack";

  const slide = document.createElement("div");
  slide.className = "focusViewerSlide";

  const img = document.createElement("img");
  img.className = "focusViewerImg";
  img.id = "focusViewerImg";
  img.alt = currentProject?.works?.[selectedWorkIndex]?.title || "선택한 작품 이미지";
  img.loading = "eager";
  img.decoding = "async";
  img.src = buildImageUrl(images[index], "w1600");
  inner.classList.add("is-image-loading");
  FlowerSite.setImageLoadingState(img, inner);

  slide.appendChild(img);
  track.appendChild(slide);
  inner.appendChild(track);

  const previousButton = document.createElement("button");
  previousButton.className = "focusNav prev";
  previousButton.type = "button";
  previousButton.setAttribute("aria-label", "이전 이미지");

  const nextButton = document.createElement("button");
  nextButton.className = "focusNav next";
  nextButton.type = "button";
  nextButton.setAttribute("aria-label", "다음 이미지");

  inner.append(previousButton, nextButton);
  if (focusedControl) inner.querySelector(focusedControl)?.focus({ preventScroll: true });
}

function startAutoSlide(images) {
  stopAutoSlide();
  if (!images || images.length <= 1) return;
  const viewer = document.getElementById("focusViewer");
  slideTimer = FlowerSite.createAutoCycle(viewer, () => {
    selectedImageIndex = (selectedImageIndex + 1) % images.length;
    updateFocusViewer(images, selectedImageIndex);
  }, [...viewer.querySelectorAll("img")]);
}

function stopAutoSlide() {
  slideTimer?.destroy();
  slideTimer = null;
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
