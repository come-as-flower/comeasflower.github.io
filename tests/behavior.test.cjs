const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const source = (file) => fs.readFileSync(path.join(root, file), "utf8");

function browser() {
  const timers = new Map();
  const frames = new Map();
  let nextId = 1;
  const storage = new Map();
  const selectors = new Map();
  const restored = [];
  const document = new EventTarget();
  const window = new EventTarget();
  const motion = new EventTarget();
  motion.matches = false;
  document.hidden = false;
  document.activeElement = null;
  const makeElement = () => {
    const element = new EventTarget();
    const classes = new Set();
    Object.assign(element, {
      dataset: {}, style: {}, attributes: {}, scrollLeft: 0, scrollTop: 0,
      classList: {
        add: (...names) => names.forEach((name) => classes.add(name)),
        remove: (...names) => names.forEach((name) => classes.delete(name)),
        contains: (name) => classes.has(name),
        toggle(name, force) {
          const add = force === undefined ? !classes.has(name) : force;
          if (add) classes.add(name); else classes.delete(name);
        },
      },
      matches: () => Boolean(element.hover),
      contains: (target) => target === element || Boolean(element.descendants?.includes(target)),
      querySelector: () => null,
      querySelectorAll: () => [],
      setAttribute(name, value) { element.attributes[name] = value; },
      replaceChildren() {}, appendChild() {}, append() {},
      focus() { document.activeElement = element; },
      scrollTo(position) { element.scrollLeft = position.left; element.scrollTop = position.top; },
    });
    return element;
  };
  document.body = makeElement();
  document.querySelector = (selector) => selectors.get(selector) || null;
  document.querySelectorAll = (selector) => selectors.get(selector) || [];
  document.getElementById = (id) => selectors.get(`#${id}`) || null;
  document.createElement = makeElement;
  window.matchMedia = () => motion;
  Object.assign(window, { scrollX: 0, scrollY: 0, innerHeight: 900,
    scrollTo(position) { restored.push(position); },
  });
  const location = { pathname: "/archive/", search: "", hash: "", origin: "https://example.test",
    href: "https://example.test/archive/" };
  window.location = location;
  const history = { state: null, length: 2,
    replaceState(state) { this.state = state; },
    back() { this.wentBack = true; },
  };
  const context = vm.createContext({
    window, document, location, history, URL, URLSearchParams, Date, Event, queueMicrotask,
    console: { error() {} },
    getComputedStyle: () => ({ gap: "24", scrollPaddingLeft: "0" }),
    sessionStorage: {
      setItem: (key, value) => storage.set(key, value),
      getItem: (key) => storage.get(key) ?? null,
      removeItem: (key) => storage.delete(key),
    },
    setTimeout(fn, delay) { const id = nextId++; timers.set(id, { fn, delay, repeat: false }); return id; },
    clearTimeout(id) { timers.delete(id); },
    setInterval(fn, delay) { const id = nextId++; timers.set(id, { fn, delay, repeat: true }); return id; },
    clearInterval(id) { timers.delete(id); },
    requestAnimationFrame(fn) { const id = nextId++; frames.set(id, fn); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
    fetch: async () => { throw new Error("unexpected network request"); },
  });
  vm.runInContext(source("site-utils.js"), context);
  context.FlowerSite = window.FlowerSite;
  const flushFrames = () => {
    const pending = [...frames.values()]; frames.clear(); pending.forEach((fn) => fn());
  };
  const fireTimeouts = (delay) => {
    for (const [id, timer] of [...timers]) {
      if (!timer.repeat && timer.delay === delay) { timers.delete(id); timer.fn(); }
    }
  };
  return { context, document, window, motion, location, history, storage, selectors, restored,
    makeElement, flushFrames, fireTimeouts, timers, utils: window.FlowerSite,
    intervalCount: () => [...timers.values()].filter((timer) => timer.repeat).length };
}

test("mixed cached, pending and failed images start exactly one cycle", () => {
  const env = browser();
  const cached = Object.assign(new EventTarget(), { complete: true });
  const pending = Object.assign(new EventTarget(), { complete: false });
  const failed = Object.assign(new EventTarget(), { complete: false });
  const cycle = env.utils.createAutoCycle(env.makeElement(), () => {}, [cached, pending, failed]);
  env.flushFrames();
  assert.equal(env.intervalCount(), 0);
  pending.dispatchEvent(new Event("load"));
  failed.dispatchEvent(new Event("error"));
  env.flushFrames();
  assert.equal(env.intervalCount(), 1);
  pending.dispatchEvent(new Event("error"));
  env.flushFrames();
  assert.equal(env.intervalCount(), 1);
  cycle.destroy();
  assert.equal(env.intervalCount(), 0);
});

test("destroying a gallery cancels pending image callbacks and timers", () => {
  const env = browser();
  const image = Object.assign(new EventTarget(), { complete: false });
  env.utils.createAutoCycle(env.makeElement(), () => {}, [image]).destroy();
  image.dispatchEvent(new Event("load"));
  env.fireTimeouts(6000);
  env.flushFrames();
  assert.equal(env.timers.size, 0);
});

test("image timeout permits a slow gallery to continue and does not start twice", () => {
  const env = browser();
  const image = Object.assign(new EventTarget(), { complete: false });
  env.utils.createAutoCycle(env.makeElement(), () => {}, [image]);
  env.fireTimeouts(6000);
  env.flushFrames();
  assert.equal(env.intervalCount(), 1);
  image.dispatchEvent(new Event("load"));
  env.flushFrames();
  assert.equal(env.intervalCount(), 1);
});

test("autoplay pauses for reduced motion, focus, pointer input and hidden pages", async () => {
  const env = browser();
  const element = env.makeElement();
  env.utils.createAutoCycle(element, () => {});
  env.flushFrames();
  assert.equal(env.intervalCount(), 1);
  env.motion.matches = true;
  env.motion.dispatchEvent(new Event("change"));
  assert.equal(env.intervalCount(), 0);
  env.motion.matches = false;
  env.motion.dispatchEvent(new Event("change"));
  assert.equal(env.intervalCount(), 1);
  env.document.activeElement = element;
  element.dispatchEvent(new Event("focusin"));
  assert.equal(env.intervalCount(), 0);
  env.document.activeElement = null;
  element.dispatchEvent(new Event("focusout"));
  await Promise.resolve();
  assert.equal(env.intervalCount(), 1);
  element.dispatchEvent(new Event("pointerdown"));
  env.fireTimeouts(1800);
  assert.equal(env.intervalCount(), 0, "holding a touch must keep autoplay paused");
  env.window.dispatchEvent(new Event("pointerup"));
  env.fireTimeouts(1800);
  assert.equal(env.intervalCount(), 1);
  env.document.hidden = true;
  env.document.dispatchEvent(new Event("visibilitychange"));
  assert.equal(env.intervalCount(), 0);
  env.document.hidden = false;
  env.document.dispatchEvent(new Event("visibilitychange"));
  assert.equal(env.intervalCount(), 1);
  env.window.dispatchEvent(new Event("pagehide"));
  assert.equal(env.intervalCount(), 0);
  env.window.dispatchEvent(new Event("pageshow"));
  assert.equal(env.intervalCount(), 1);
});

test("each history entry restores its own selected project and both scroll directions", () => {
  const env = browser();
  const list = env.makeElement();
  list.dataset.restoreScroll = "archive-list";
  list.dataset.selectedProjectId = "12-5";
  list.scrollLeft = 30; list.scrollTop = 240;
  env.selectors.set("[data-restore-scroll]", [list]);
  env.selectors.set(".archiveProjectList", list);
  env.history.state = { noticePanelOpen: false };
  env.window.scrollY = 450;
  env.utils.savePageState();
  const firstEntry = env.history.state;
  assert.equal(firstEntry.noticePanelOpen, false);
  assert.equal(firstEntry.flowerPage.selectedProjectId, "12-5");
  env.location.pathname = "/news/";
  env.history.state = null;
  env.window.scrollY = 90;
  list.scrollTop = 10;
  env.utils.savePageState();
  assert.equal(env.history.state.flowerPage.y, 90);
  env.location.pathname = "/archive/";
  env.history.state = firstEntry;
  env.utils.restorePageState();
  assert.equal(list.scrollTop, 240);
  assert.equal(list.scrollLeft, 30);
  assert.equal(env.restored.at(-1).top, 450);
  env.location.hash = "#another-filter";
  assert.equal(env.utils.readPageState(), null);
});

test("shared data expires, is consumed once, and tolerates blocked or corrupt storage", () => {
  const env = browser();
  env.utils.saveData("handoff", { id: "flower-night-8" });
  assert.equal(env.utils.readData("handoff", 30000, true).id, "flower-night-8");
  assert.equal(env.utils.readData("handoff"), null);
  env.storage.set("flower:old", JSON.stringify({ savedAt: Date.now() - 31000, value: 1 }));
  assert.equal(env.utils.readData("old"), null);
  env.storage.set("flower:broken", "{broken");
  assert.equal(env.utils.readData("broken"), null);
  env.context.sessionStorage.setItem = () => { throw new Error("blocked"); };
  env.context.sessionStorage.getItem = () => { throw new Error("blocked"); };
  assert.doesNotThrow(() => env.utils.saveData("key", 1));
  assert.equal(env.utils.readData("key"), null);
});

test("all exhibition handoffs fill the right panel synchronously without fetching", () => {
  const data = JSON.parse(source("assets/json/exhibitions.json"));
  for (const item of data.exhibitions) {
    const env = browser();
    const image = Object.assign(env.makeElement(), { hidden: true, complete: true, naturalWidth: 600 });
    const title = env.makeElement();
    const text = env.makeElement();
    Object.assign(env.location, { pathname: "/news/exhibition.html", search: `?id=${item.id}`,
      href: `https://example.test/news/exhibition.html?id=${item.id}` });
    env.selectors.set(".flowerNight img", image);
    env.selectors.set(".flowerNight h2", title);
    env.selectors.set(".flowerNightText", text);
    env.utils.saveData("exhibition-handoff", { exhibition: item });
    vm.runInContext(source("news/exhibition.js"), env.context);
    assert.equal(title.textContent, item.title);
    assert.ok(text.innerHTML.includes(item.duration));
    assert.equal(image.src, new URL(item.image, env.location.href).href);
    assert.equal(image.hidden, false);
    assert.equal(env.document.body.classList.contains("detail-loading"), false);
  }
});

test("exhibition reload reuses cached data, and a failed request releases the loading state", async () => {
  const env = browser();
  const data = JSON.parse(source("assets/json/exhibitions.json"));
  const item = data.exhibitions.at(-1);
  Object.assign(env.location, { search: `?id=${item.id}`, href: "https://example.test/news/exhibition.html" });
  const image = Object.assign(env.makeElement(), { complete: true, naturalWidth: 100 });
  const title = env.makeElement();
  env.selectors.set(".flowerNight img", image);
  env.selectors.set(".flowerNight h2", title);
  env.utils.saveData("exhibitions", data);
  env.document.body.classList.add("detail-loading");
  vm.runInContext(source("news/exhibition.js"), env.context);
  assert.equal(title.textContent, item.title);
  env.flushFrames();
  assert.equal(env.document.body.classList.contains("detail-loading"), false);
  env.storage.clear();
  env.document.body.classList.add("detail-loading");
  env.context.fetch = async () => ({ ok: false, status: 503 });
  await vm.runInContext("initializeExhibition()", env.context);
  assert.equal(title.textContent, "전시 정보를 불러오지 못했습니다.");
  assert.equal(env.document.body.classList.contains("detail-loading"), false);
  assert.equal(env.document.body.classList.contains("detail-error"), true);
});

test("cold exhibition entry keeps the placeholder until the image is ready", async () => {
  const env = browser();
  const data = JSON.parse(source("assets/json/exhibitions.json"));
  Object.assign(env.location, { search: `?id=${data.exhibitions[0].id}`,
    href: "https://example.test/news/exhibition.html" });
  const image = Object.assign(env.makeElement(), { complete: false, naturalWidth: 0 });
  env.selectors.set(".flowerNight img", image);
  env.selectors.set(".flowerNight h2", env.makeElement());
  env.document.body.classList.add("detail-loading");
  env.context.fetch = async () => ({ ok: true, json: async () => data });
  vm.runInContext(source("news/exhibition.js"), env.context);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(env.document.body.classList.contains("detail-loading"), true);
  assert.equal(image.hidden, true);
  image.naturalWidth = 600;
  image.dispatchEvent(new Event("load"));
  env.flushFrames();
  assert.equal(env.document.body.classList.contains("detail-loading"), false);
  assert.equal(image.hidden, false);
});

test("project handoff and reload fill project text before any asynchronous fetch", () => {
  const data = JSON.parse(source("assets/json/project.json"));
  const project = Object.values(data).filter(Array.isArray).flat()[0];
  for (const reload of [false, true]) {
    const env = browser();
    env.location.search = `?id=${project.id}`;
    const title = env.makeElement();
    const paragraphs = [env.makeElement(), env.makeElement(), env.makeElement()];
    env.selectors.set(".flowerNightExplanation h2", title);
    env.selectors.set(".flowerNightText p", paragraphs);
    env.document.body.classList.add("detail-loading");
    if (reload) env.utils.saveData("projects", data);
    else env.utils.saveData("project-handoff", { projectId: project.id, data });
    vm.runInContext(source("archive/project.js"), env.context);
    assert.equal(title.textContent, project.name);
    assert.equal(paragraphs[0].textContent, project.description);
    assert.equal(env.document.body.classList.contains("detail-loading"), false);
  }
});

test("mobile menu exposes expanded state and returns keyboard focus on Escape", () => {
  const env = browser();
  const open = env.makeElement();
  const close = env.makeElement();
  const navigation = env.makeElement();
  env.selectors.set(".hambugerMenu button", open);
  env.selectors.set(".close button", close);
  env.selectors.set(".mobilePageMenu", navigation);
  vm.runInContext(source("main.js"), env.context);
  env.document.dispatchEvent(new Event("DOMContentLoaded"));
  assert.equal(navigation.inert, true);
  assert.equal(open.attributes["aria-expanded"], "false");
  open.dispatchEvent(new Event("click"));
  assert.equal(navigation.inert, false);
  assert.equal(open.attributes["aria-expanded"], "true");
  assert.equal(env.document.activeElement, close);
  env.document.dispatchEvent(Object.assign(new Event("keydown"), { key: "Escape" }));
  assert.equal(navigation.inert, true);
  assert.equal(open.attributes["aria-expanded"], "false");
  assert.equal(env.document.activeElement, open);
});

test("wheel scrolling preserves browser zoom and uses instant snapping for reduced motion", () => {
  const env = browser();
  const list = env.makeElement();
  Object.assign(list, { scrollWidth: 1000, clientWidth: 300, getBoundingClientRect: () => ({ left: 0 }) });
  list.children = [0, 224, 448, 672].map((left) => ({
    getBoundingClientRect: () => ({ width: 200, left: left - list.scrollLeft }),
  }));
  env.utils.setupHorizontalScroll(list);
  env.utils.setupHorizontalScroll(list);
  const zoom = Object.assign(new Event("wheel", { cancelable: true }),
    { ctrlKey: true, deltaX: 0, deltaY: 100, deltaMode: 0 });
  list.dispatchEvent(zoom);
  assert.equal(zoom.defaultPrevented, false);
  assert.equal(list.scrollLeft, 0);
  env.motion.matches = true;
  let target;
  list.scrollTo = (position) => { target = position; list.scrollLeft = position.left; };
  const wheel = Object.assign(new Event("wheel", { cancelable: true }),
    { deltaX: 0, deltaY: 100, deltaMode: 0 });
  list.dispatchEvent(wheel);
  assert.equal(list.scrollLeft, 160, "the wheel handler is only installed once");
  env.fireTimeouts(180);
  assert.equal(target.left, 224);
  assert.equal(target.behavior, "instant");
});
