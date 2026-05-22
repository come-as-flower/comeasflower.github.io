document.addEventListener("DOMContentLoaded", async () => {
  const activeContainer = document.querySelector(".activeMembers");
  const pastContainer = document.querySelector(".pastMembers");

  if (!activeContainer || !pastContainer) return;

  try {
    const response = await fetch("../assets/json/members.json");
    const data = await response.json();

    const activeMembers = isPlainObject(data.active) ? data.active : {};
    const pastMembers = isPlainObject(data.past) ? data.past : {};

    renderMembersSection(activeContainer, "활동 중인 사람들", activeMembers);
    renderMembersSection(pastContainer, "함께한 사람들", pastMembers);
  } catch (error) {
    console.error("JSON 로드 오류:", error);
    renderMessage(
      activeContainer,
      "활동 중인 사람들",
      "멤버 정보를 불러오지 못했습니다.",
    );
    renderMessage(
      pastContainer,
      "함께한 사람들",
      "멤버 정보를 불러오지 못했습니다.",
    );
  }
});

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function renderMembersSection(container, title, groups) {
  container.innerHTML = "";

  const articleText = document.createElement("div");
  articleText.className = "articleText";

  const heading = document.createElement("h1");
  heading.textContent = title;

  const inner = document.createElement("div");
  inner.className = "articleTextInner";

  const groupEntries = Object.entries(groups);

  if (groupEntries.length === 0) {
    const emptyText = document.createElement("p");
    emptyText.textContent = "표시할 멤버가 없습니다.";
    inner.appendChild(emptyText);
  } else {
    groupEntries.forEach(([batch, people]) => {
      inner.appendChild(createBatchBlock(batch, people));
    });
  }

  articleText.appendChild(heading);
  articleText.appendChild(inner);
  container.appendChild(articleText);
}

function createBatchBlock(batch, people) {
  const wrapper = document.createElement("div");
  wrapper.className = "innerText";

  const batchTitle = document.createElement("h3");
  batchTitle.textContent = batch;

  const peopleList = document.createElement("div");

  if (Array.isArray(people)) {
    people.forEach((person) => {
      peopleList.appendChild(createPersonRow(person));
    });
  }

  wrapper.appendChild(batchTitle);
  wrapper.appendChild(peopleList);

  return wrapper;
}

function createPersonRow(person) {
  const row = document.createElement("div");
  row.className = "nameList";

  const nameEl = document.createElement("p");
  nameEl.textContent = person?.name || "";
  row.appendChild(nameEl);

  const normalizedContact = normalizeContact(person?.contact);
  if (normalizedContact) {
    const contactEl = document.createElement("p");
    contactEl.textContent = normalizedContact;
    row.appendChild(contactEl);
  }

  return row;
}

function normalizeContact(contact) {
  if (!contact || typeof contact !== "string") return "";
  return contact.startsWith("@") ? contact : `@${contact}`;
}

function renderMessage(container, title, message) {
  container.innerHTML = "";

  const articleText = document.createElement("div");
  articleText.className = "articleText";

  const heading = document.createElement("h1");
  heading.textContent = title;

  const inner = document.createElement("div");
  inner.className = "articleTextInner";

  const paragraph = document.createElement("p");
  paragraph.textContent = message;

  inner.appendChild(paragraph);
  articleText.appendChild(heading);
  articleText.appendChild(inner);
  container.appendChild(articleText);
}
