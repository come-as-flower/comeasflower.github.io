// 공통 기능 전용 js 파일
// 뒤로가기, 스크롤 위치 복원, 모바일 메뉴 관리


// 주소창에서 index.html 제거
if (location.pathname.endsWith("/index.html")) {
  const cleanPath = location.pathname.replace(/index\.html$/, "");
  history.replaceState(history.state, "", cleanPath + location.search + location.hash);
}


// 뒤로 가기
// 사이트 내 방문 기록으로 돌아가고, 외부에서 바로 왔으면 목록으로 이동
function goBack() {
  FlowerSite.savePageState();
  if (document.referrer && new URL(document.referrer).origin === location.origin && history.length > 1) {
    history.back();
    return;
  }

  window.location.href = document.body.classList.contains("projectDetailBody")
    ? "../archive/"
    : document.body.classList.contains("exhibitionDetailBody") ? "./" : "../";
}


// 페이지 로드 시 스크롤 위치 복원, 모바일 메뉴 설정
document.addEventListener("DOMContentLoaded", () => {
  FlowerSite.restorePageState();
  setupMobileMenu();
  document.querySelectorAll(".worksList").forEach(FlowerSite.setupHorizontalScroll);
});


// 스크롤 위치 복원
// 페이지를 떠날 때 현재 스크롤 위치 저장
document.addEventListener("click", (event) => {
  if (event.target.closest("a[href]")) FlowerSite.savePageState();
}, { capture: true });
window.addEventListener("pagehide", () => FlowerSite.savePageState());
window.addEventListener("pageswap", () => FlowerSite.savePageState());
window.addEventListener("pageshow", (event) => {
  if (event.persisted) FlowerSite.restorePageState();
});


// 모바일 메뉴 관리
// 모바일 메뉴 열기/닫기, 창 크기 변경 시 메뉴 닫기, 뒤로 가기 시 메뉴 닫기
// .hambugerMenu, .close, .mobilePageMenu 요소가 존재하는 경우에만 이벤트 리스너 등록
function setupMobileMenu() {
  const menuButton = document.querySelector(".hambugerMenu");
  const closeButton = document.querySelector(".close");
  const mobileMenu = document.querySelector(".mobilePageMenu");

  if (!menuButton || !closeButton || !mobileMenu) return;

  const openMenu = () => {
    mobileMenu.classList.add("active");
    document.body.classList.add("menu-open");
  };

  const closeMenu = () => {
    mobileMenu.classList.remove("active");
    document.body.classList.remove("menu-open");
  };

  const toggleMenu = () => {
    const isOpen = mobileMenu.classList.contains("active");

    if (isOpen) {
      closeMenu();
    } else {
      openMenu();
    }
  };

  menuButton.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleMenu();
  });

  closeButton.addEventListener("click", (event) => {
    event.stopPropagation();
    closeMenu();
  });

  mobileMenu.addEventListener("click", (event) => {
    event.stopPropagation();
  });

  document.addEventListener("click", (event) => {
    const clickedInsideMenu = mobileMenu.contains(event.target);
    const clickedMenuButton = menuButton.contains(event.target);

    if (!clickedInsideMenu && !clickedMenuButton) {
      closeMenu();
    }
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 1200) {
      closeMenu();
    }
  });

  window.addEventListener("popstate", closeMenu);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeMenu();
    }
  });
}