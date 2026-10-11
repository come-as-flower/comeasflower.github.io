const PROJECT_JSON_URL = "../assets/json/project.json";
const hoverTransitionDelay = 700;
let archiveProjects = [];
let hoverTimer = null;
let imageCycleTimer = null;

document.addEventListener("DOMContentLoaded", async () => {
  try {
    const response = await fetch(PROJECT_JSON_URL);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const projectData = await response.json();
    const allProjects = flattenProjects(projectData);

    archiveProjects = allProjects;
    const activeTag = getArchiveTagFromHash();
    const visibleProjects = activeTag === "전체"
      ? allProjects
      : allProjects.filter((project) => getProjectTags(project).includes(activeTag));

    renderArchive(visibleProjects, activeTag);
    ensurePreviewShell();
    selectProject(visibleProjects[0]?.id || "");
  } catch (error) {
    console.error("모아보기 데이터를 불러오는 중 오류 발생:", error);
    renderArchiveError("프로젝트 데이터를 불러오지 못했습니다.");
  }
});

function getProjectEndDate(project) {
  const duration = project?.duration || "";
  const matches = [...duration.matchAll(/(\d{4})\.(\d{1,2})\.(\d{1,2})\./g)];

  if (!matches.length) {
    return 0;
  }

  const lastMatch = matches[matches.length - 1];
  const year = Number(lastMatch[1]);
  const month = Number(lastMatch[2]);
  const day = Number(lastMatch[3]);

  return new Date(year, month - 1, day).getTime();
}

function flattenProjects(projectData) {
  return Object.entries(projectData)
    .filter(([, projects]) => Array.isArray(projects))
    .flatMap(([key, projects]) => {
      const groupNumber = key.match(/\d+/)?.[0] || key;

      return projects
        .slice()
        .reverse()
        .map((project) => ({
          ...project,
          generationLabel: `${groupNumber}기`,
        }));
    })
    .sort((a, b) => {
      const endDateDiff = getProjectEndDate(b) - getProjectEndDate(a);

      if (endDateDiff !== 0) {
        return endDateDiff;
      }

      return (a.name || "").localeCompare(b.name || "", "ko");
    });
}

function renderArchive(projects, activeTag = "전체") {
  const menu = document.querySelector(".listMenu");
  const list = document.querySelector(".archiveProjectList");

  if (menu) {
    menu.innerHTML = "";

    const tags = [
      "전체",
      ...new Set(archiveProjects.flatMap((project) => getProjectTags(project))),
    ];

    tags.forEach((tag) => {
      const item = document.createElement("li");
      item.className = "radioButton";
      if (tag === activeTag) item.classList.add("selected");

      const link = document.createElement("a");
      link.href = tag === "전체" ? "#all" : `#${encodeURIComponent(tag)}`;
      link.textContent = tag;

      link.addEventListener("click", (event) => {
        event.preventDefault();
        filterArchiveByTag(tag);
      });

      item.appendChild(link);
      menu.appendChild(item);
    });
  }

  if (!list) return;

  list.innerHTML = "";

  const header = document.createElement("li");
  header.className = "archiveListHeader";
  header.innerHTML = `
    <span>제목</span>
    <span>형태</span>
  `;
  list.appendChild(header);

  projects.forEach((project) => {
    list.appendChild(createProjectListItem(project));
  });
}

function getProjectTags(project) {
  return String(project?.output || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function filterArchiveByTag(tag) {
  const filteredProjects = tag === "전체"
    ? archiveProjects
    : archiveProjects.filter((project) => getProjectTags(project).includes(tag));

  const hash = tag === "전체" ? "#all" : `#${encodeURIComponent(tag)}`;
  history.replaceState(null, "", `${window.location.pathname}${hash}`);

  renderArchive(filteredProjects, tag);

  if (filteredProjects.length > 0) {
    selectProject(filteredProjects[0].id);
  } else {
    clearImageCycle();
  }
}

function getArchiveTagFromHash() {
  const rawHash = window.location.hash.slice(1);
  if (!rawHash || rawHash === "all") return "전체";

  let tag = rawHash;
  try {
    tag = decodeURIComponent(rawHash);
  } catch (error) {
    return "전체";
  }

  return archiveProjects.some((project) => getProjectTags(project).includes(tag))
    ? tag
    : "전체";
}

function ensurePreviewShell() {
  const preview = document.querySelector(".projectPreview");
  if (!preview || preview.dataset.initialized === "true") return;

  preview.innerHTML = `
    <div class="projectPreviewHeader">
      <h2 id="projectPreviewTitle">제목 없음</h2>
    </div>

    <div class="projectPreviewBody">
      <p id="projectPreviewDescription"></p>
      <div class="projectPreviewMeta">
        <p id="projectPreviewDuration"></p>
      </div>
    </div>

    <div class="projectPreviewGallery">
      <div id="projectPreviewTrack" class="projectPreviewTrack"></div>
    </div>
  `;

  preview.dataset.initialized = "true";
}

function createProjectListItem(project) {
  const item = document.createElement("li");
  item.className = "archiveProjectItem";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "archiveProjectButton";
  button.dataset.projectId = project.id;
  button.innerHTML = `
    <span class="archiveProjectName">${project.name || "제목 없음"}</span>
    <span class="archiveProjectMeta">${project.output || project.duration || "프로젝트"}</span>
  `;

  button.addEventListener("click", () => {
    if (window.matchMedia("(max-width: 1200px)").matches) {
      window.location.href = `./project-detail.html?id=${encodeURIComponent(project.id)}`;
      return;
    }

    selectProject(project.id);
  });

  item.appendChild(button);
  return item;
}

function selectProject(projectId) {
  if (!projectId) return;

  const project = archiveProjects.find((item) => item.id === projectId);
  if (!project) return;

  document.querySelectorAll(".archiveProjectButton").forEach((button) => {
    button.classList.toggle("is-selected", button.dataset.projectId === projectId);
  });

  updateProjectPreview(project);
}

function updateProjectPreview(project) {
  ensurePreviewShell();

  const title = document.getElementById("projectPreviewTitle");
  const description = document.getElementById("projectPreviewDescription");
  const duration = document.getElementById("projectPreviewDuration");
  const track = document.getElementById("projectPreviewTrack");

  if (title) title.textContent = project.name || "제목 없음";
  if (description) description.textContent = project.description || "";
  if (duration) duration.textContent = project.duration || "";

  const images = getProjectImageSequence(project);
  const gallery = track?.closest(".projectPreviewGallery");
  if (track) {
    if (images.length > 0) {
      startImageCycle(images, track, gallery);
    } else {
      track.innerHTML = "";
      clearImageCycle();
    }
  }

  bindPreviewHover(project.id);
}

function isUsableImageValue(value) {
  if (typeof value !== "string") return false;

  const trimmedValue = value.trim();
  if (!trimmedValue) return false;
  if (trimmedValue === "이미지 링크" || trimmedValue === "undefined" || trimmedValue === "null") {
    return false;
  }

  return true;
}

function startImageCycle(images, trackElement, galleryElement = trackElement.parentElement) {
  clearImageCycle();

  const validImages = (images || []).filter(isUsableImageValue);
  if (!validImages.length || !trackElement) return;

  trackElement.innerHTML = "";

  validImages.forEach((imageUrl) => {
    const slide = document.createElement("div");
    slide.className = "projectPreviewSlide";

    const img = document.createElement("img");
    img.src = buildImageUrl(imageUrl, "w1200");
    img.alt = "프로젝트 이미지";
    img.loading = "eager";

    slide.appendChild(img);
    trackElement.appendChild(slide);
  });

  const beginCycle = () => {
    const firstSlide = trackElement.querySelector(".projectPreviewSlide");
    if (!firstSlide) return;

    const computedStyle = window.getComputedStyle(trackElement);
    const gap = Number.parseFloat(computedStyle.gap || "24") || 24;
    const slideWidth = firstSlide.getBoundingClientRect().width;
    const step = slideWidth + gap;
    const viewportWidth = galleryElement ? galleryElement.clientWidth : trackElement.clientWidth;
    const maxTranslate = Math.max(trackElement.scrollWidth - viewportWidth, 0);

    trackElement.style.transition = "transform 0.9s ease";
    trackElement.style.willChange = "transform";
    trackElement.style.transform = "translate3d(0, 0, 0)";

    if (maxTranslate <= 0) {
      return;
    }

    let currentTranslate = 0;
    imageCycleTimer = setInterval(() => {
      currentTranslate += step;

      if (currentTranslate >= maxTranslate - 1) {
        currentTranslate = 0;
        trackElement.style.transform = "translate3d(0, 0, 0)";
        return;
      }

      trackElement.style.transform = `translate3d(-${currentTranslate}px, 0, 0)`;
    }, 2600);
  };

  const imagesToLoad = [...trackElement.querySelectorAll("img")];
  if (!imagesToLoad.length) {
    beginCycle();
    return;
  }

  let remaining = imagesToLoad.length;
  imagesToLoad.forEach((img) => {
    const finish = () => {
      remaining -= 1;
      if (remaining === 0) {
        requestAnimationFrame(() => {
          requestAnimationFrame(beginCycle);
        });
      }
    };

    if (img.complete) {
      finish();
      return;
    }

    img.addEventListener("load", finish, { once: true });
    img.addEventListener("error", finish, { once: true });
  });
}

function clearImageCycle() {
  if (imageCycleTimer) {
    clearInterval(imageCycleTimer);
    imageCycleTimer = null;
  }
}

function getProjectImageSequence(project) {
  const images = [];

  (project.works || []).forEach((work) => {
    normalizeImages(work).forEach((imageUrl) => {
      if (isUsableImageValue(imageUrl)) {
        images.push(imageUrl);
      }
    });
  });

  if (images.length > 0) return [...new Set(images)];
  if (isUsableImageValue(project.image)) return [project.image];
  return [];
}

function normalizeImages(work) {
  if (!work) return [];

  if (Array.isArray(work.images) && work.images.length > 0) {
    return work.images.filter(isUsableImageValue);
  }

  if (isUsableImageValue(work.image)) {
    return [work.image];
  }

  return [];
}

function bindPreviewHover(projectId) {
  const panel = document.querySelector(".archivePreviewPanel");
  if (!panel) return;

  panel.onmouseenter = () => {
    clearPreviewNavigation();
    hoverTimer = setTimeout(() => {
      window.location.href = `./project-detail.html?id=${encodeURIComponent(projectId)}`;
    }, hoverTransitionDelay);
  };

  panel.onmouseleave = clearPreviewNavigation;
}

function clearPreviewNavigation() {
  if (hoverTimer) {
    clearTimeout(hoverTimer);
    hoverTimer = null;
  }
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

function renderArchiveError(message) {
  const list = document.querySelector(".archiveProjectList");
  const preview = document.querySelector(".projectPreview");

  if (list) {
    list.innerHTML = `
      <li class="archiveListHeader"><span>제목</span><span>형태</span></li>
      <li class="archiveProjectItem"><button type="button" class="archiveProjectButton is-selected" disabled>${message}</button></li>
    `;
  }

  if (preview) {
    preview.innerHTML = `<p class="archiveErrorText">${message}</p>`;
  }
}
