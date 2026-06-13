document.addEventListener("DOMContentLoaded", () => {
  const OFFSET = 150;

  const links = Array.from(
    document.querySelectorAll(".listMenu .radioButton a"),
  );
  const items = Array.from(document.querySelectorAll(".listMenu .radioButton"));
  const sections = Array.from(document.querySelectorAll("main > section"));

  if (links.length === 0 || items.length === 0 || sections.length === 0) return;

  let isAutoScrolling = false;
  let activeTargetId = "";

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
      activeTargetId = "";
      return;
    }

    const check = () => {
      const targetPosition =
        target.getBoundingClientRect().top + window.scrollY - OFFSET;
      const distance = Math.abs(window.scrollY - targetPosition);

      if (distance < 4) {
        isAutoScrolling = false;
        activeTargetId = "";
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

      activeTargetId = targetId;
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
});
