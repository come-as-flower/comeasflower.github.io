const PROJECT_JSON_URL = "../assets/json/project.json";
const OFFSET = 150;

document.addEventListener("DOMContentLoaded", async () => {
  try {
    const response = await fetch(PROJECT_JSON_URL);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const projectData = await response.json();

    renderArchive(projectData);
    bindArchiveScroll();
  } catch (error) {
    console.error("모아보기 데이터를 불러오는 중 오류 발생:", error);
    renderArchiveError("프로젝트 데이터를 불러오지 못했습니다.");
  }
});

function renderArchive(projectData) {
  const menu = document.querySelector(".listMenu");
  const contents = document.querySelector("main.contents");

  if (!menu || !contents) return;

  menu.innerHTML = "";
  contents.querySelectorAll("section").forEach((section) => section.remove());

  const groups = normalizeProjectGroups(projectData);

  groups.forEach((group, groupIndex) => {
    menu.appendChild(createMenuItem(group, groupIndex === 0));
    contents.appendChild(createProjectSection(group));
  });
}

function normalizeProjectGroups(projectData) {
  return Object.entries(projectData)
    .filter(([, projects]) => Array.isArray(projects))
    .map(([key, projects]) => {
      const groupNumber = key.match(/\d+/)?.[0] || key;

      return {
        id: groupNumber,
        label: `${groupNumber}기`,
        projects: projects.slice().reverse(),
      };
    })
    .sort((a, b) => Number(b.id) - Number(a.id));
}

function createMenuItem(group, isSelected) {
  const item = document.createElement("li");
  item.className = `radioButton${isSelected ? " selected" : ""}`;

  const link = document.createElement("a");
  link.href = `#${group.id}`;
  link.dataset.target = group.id;
  link.textContent = group.label;

  item.appendChild(link);
  return item;
}

function createProjectSection(group) {
  const section = document.createElement("section");
  section.id = group.id;

  group.projects.forEach((project) => {
    section.appendChild(createProjectArticle(project));
  });

  return section;
}

function createProjectArticle(project) {
  const article = document.createElement("article");
  const articleContent = createProjectArticleContent(project);

  if (project.id) {
    const link = document.createElement("a");
    link.href = `./project-detail.html?id=${encodeURIComponent(project.id)}`;
    link.appendChild(articleContent.text);
    link.appendChild(articleContent.image);

    article.appendChild(link);
    return article;
  }

  article.appendChild(articleContent.text);
  article.appendChild(articleContent.image);
  return article;
}

function createProjectArticleContent(project) {
  const text = document.createElement("div");
  text.className = "articleText";

  const title = document.createElement("h1");
  title.textContent = project.name || "제목 없음";

  const description = document.createElement("p");
  description.textContent = project.description || "";

  text.appendChild(title);
  text.appendChild(description);

  return {
    text,
    image: createProjectImage(project),
  };
}

function createProjectImage(project) {
  const thumbnail = getProjectThumbnail(project);

  if (!thumbnail) {
    const placeholder = document.createElement("div");
    placeholder.className = "articleImg";
    placeholder.setAttribute("aria-hidden", "true");
    return placeholder;
  }

  const image = document.createElement("img");
  image.className = "articleImg";
  image.src = buildImageUrl(thumbnail, "w1000");
  image.alt = project.name || "프로젝트 이미지";

  return image;
}

function getProjectThumbnail(project) {
  if (project.image) {
    return project.image;
  }

  const firstWorkWithImage = (project.works || []).find((work) => {
    return work.image || (Array.isArray(work.images) && work.images.length > 0);
  });

  if (!firstWorkWithImage) return "";

  return normalizeImages(firstWorkWithImage)[0] || "";
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

function bindArchiveScroll() {
  const links = Array.from(
    document.querySelectorAll(".listMenu .radioButton a"),
  );
  const items = Array.from(document.querySelectorAll(".listMenu .radioButton"));
  const sections = Array.from(document.querySelectorAll("main > section"));

  if (links.length === 0 || items.length === 0 || sections.length === 0) return;

  let isAutoScrolling = false;

  function getTargetId(link) {
    return (
      link.dataset.target || link.getAttribute("href")?.replace("#", "") || ""
    );
  }

  function scrollToSection(targetId, smooth = true) {
    const target = document.getElementById(targetId);
    if (!target) return;

    const targetPosition =
      target.getBoundingClientRect().top + window.scrollY - OFFSET;

    window.scrollTo({
      top: targetPosition,
      behavior: smooth ? "smooth" : "auto",
    });
  }

  function setSelected(targetId) {
    items.forEach((item) => {
      const link = item.querySelector("a");
      const itemTargetId = link ? getTargetId(link) : "";
      item.classList.toggle("selected", itemTargetId === targetId);
    });
  }

  function waitForScrollEnd(targetId) {
    const target = document.getElementById(targetId);
    if (!target) {
      isAutoScrolling = false;
      return;
    }

    const check = () => {
      const targetPosition =
        target.getBoundingClientRect().top + window.scrollY - OFFSET;
      const distance = Math.abs(window.scrollY - targetPosition);

      if (distance < 4) {
        isAutoScrolling = false;
        setSelected(targetId);
        return;
      }

      requestAnimationFrame(check);
    };

    requestAnimationFrame(check);
  }

  links.forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();

      const targetId = getTargetId(link);
      if (!targetId) return;

      isAutoScrolling = true;

      setSelected(targetId);
      scrollToSection(targetId, true);

      history.replaceState(null, "", `#${targetId}`);
      waitForScrollEnd(targetId);
    });
  });

  if (window.location.hash) {
    const hashId = window.location.hash.substring(1);
    const hashTarget = document.getElementById(hashId);

    if (hashTarget) {
      setSelected(hashId);
      setTimeout(() => {
        scrollToSection(hashId, false);
      }, 50);
    }
  }

  window.addEventListener("scroll", () => {
    if (isAutoScrolling) return;

    const scrollPosition = window.scrollY;
    let currentSectionId = "";

    sections.forEach((section) => {
      const sectionTop = section.offsetTop;
      const sectionHeight = section.offsetHeight;

      if (
        scrollPosition >= sectionTop - OFFSET &&
        scrollPosition < sectionTop + sectionHeight - OFFSET
      ) {
        currentSectionId = section.id;
      }
    });

    if (currentSectionId) {
      setSelected(currentSectionId);
    }
  });
}

function renderArchiveError(message) {
  const contents = document.querySelector("main.contents");
  if (!contents) return;

  contents.querySelectorAll("section").forEach((section) => section.remove());

  const error = document.createElement("p");
  error.textContent = message;
  contents.appendChild(error);
}

function buildImageUrl(value, size = "w1000") {
  if (!value) return "";

  const src = String(value).trim();

  if (!src) return "";

  // 1. 구글 드라이브 공유 링크인 경우
  const driveIdFromUrl = getGoogleDriveId(src);
  if (driveIdFromUrl) {
    return `https://drive.google.com/thumbnail?id=${driveIdFromUrl}&sz=${size}`;
  }

  // 2. 일반 외부 URL인 경우
  if (src.startsWith("http://") || src.startsWith("https://")) {
    return src;
  }

  // 3. 로컬 파일 경로인 경우
  if (isLocalImagePath(src)) {
    return src;
  }

  // 4. 그 외에는 구글 드라이브 파일 ID로 간주
  return `https://drive.google.com/thumbnail?id=${src}&sz=${size}`;
}

function getGoogleDriveId(value) {
  if (!value.includes("drive.google.com")) return "";

  const queryMatch = value.match(/[?&]id=([^&]+)/);
  if (queryMatch) return queryMatch[1];

  const fileMatch = value.match(/\/file\/d\/([^/]+)/);
  if (fileMatch) return fileMatch[1];

  const thumbnailMatch = value.match(/thumbnail\?id=([^&]+)/);
  if (thumbnailMatch) return thumbnailMatch[1];

  return "";
}

function isLocalImagePath(value) {
  return (
    value.startsWith("/") ||
    value.startsWith("./") ||
    value.startsWith("../") ||
    /\.(png|jpe?g|webp|gif|svg)$/i.test(value)
  );
}