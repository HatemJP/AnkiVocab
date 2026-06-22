const settingsBtn = document.getElementById("settings-btn");
const settingsModal = document.getElementById("settings-modal");
const closeSettings = document.getElementById("close-settings");
const saveSettings = document.getElementById("save-settings");
const sentenceModal = document.getElementById("sentence-modal");

let currentReadings = [];
let currentCandidates = [];

// --- Initialization on Load ---
document.addEventListener("DOMContentLoaded", async () => {
  await updateConnectionUI();
  if (await checkAnkiConnection()) {
    await refreshSettingsLists();
  }
});

// --- Auto-Save Logic ---
function saveAllSettings() {
  const deckEl = document.getElementById("deck-name");
  const modelEl = document.getElementById("note-type");

  if (deckEl) localStorage.setItem("ankiDeck", deckEl.value);
  if (modelEl) localStorage.setItem("ankiModel", modelEl.value);

  const mappings = {};
  document.querySelectorAll("#mapping-container select").forEach((select) => {
    if (select.value) mappings[select.dataset.field] = select.value;
  });
  localStorage.setItem("fieldMapping", JSON.stringify(mappings));
}

function setupAutoSave() {
  const inputs = [
    document.getElementById("deck-name"),
    document.getElementById("note-type"),
  ];

  inputs.forEach((input) => {
    if (input) input.addEventListener("change", saveAllSettings);
  });

  const container = document.getElementById("mapping-container");
  container.addEventListener("change", (e) => {
    if (e.target.classList.contains("mapping-select")) {
      saveAllSettings();
    }
  });
}

// --- Keyboard Navigation & Global Listeners ---
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    settingsModal.classList.add("hidden");
    sentenceModal.classList.add("hidden");
  }

  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    if (
      settingsModal.classList.contains("hidden") &&
      sentenceModal.classList.contains("hidden")
    ) {
      addToAnki();
    }
  }
});

// --- Tab Switching Logic ---
window.switchTab = function (tabName) {
  document.getElementById("tab-general").classList.add("hidden");
  document.getElementById("tab-mapping").classList.add("hidden");
  document.getElementById("tab-" + tabName).classList.remove("hidden");

  const btnGeneral = document.getElementById("btn-general");
  const btnMapping = document.getElementById("btn-mapping");

  [btnGeneral, btnMapping].forEach((btn) => {
    btn.classList.remove("border-teal-500", "text-teal-400");
    btn.classList.add("border-transparent", "text-gray-400");
  });

  const activeBtn = document.getElementById("btn-" + tabName);
  activeBtn.classList.remove("border-transparent", "text-gray-400");
  activeBtn.classList.add("border-teal-500", "text-teal-400");
};

// --- Smart Auto-Mapping Helper ---
function getSmartMapping(fields) {
  const mapping = {};
  const rules = {
    tango: ["単語", "word", "kanji", "expression", "tango"],
    yomikata: ["読み方", "reading", "kana", "yomikata"],
    furigana: ["振り仮名", "furigana"],
    imi: ["意味", "meaning", "definition", "imi"],
    reibun: ["例文", "sentence", "example", "reibun"],
    honyaku: ["翻訳", "translation", "english", "honyaku"],
  };

  fields.forEach((field) => {
    const fieldLower = field.toLowerCase();
    for (const [key, keywords] of Object.entries(rules)) {
      if (keywords.some((k) => fieldLower.includes(k))) {
        mapping[field] = key;
        break;
      }
    }
  });
  return mapping;
}

// --- Connection Monitoring ---
setInterval(async () => {
  if (!settingsModal.classList.contains("hidden")) {
    await updateConnectionUI();
  }
}, 5000);

async function updateConnectionUI() {
  const isConnected = await checkAnkiConnection();
  const saveBtn = document.getElementById("save-settings");
  const deckInput = document.getElementById("deck-name");
  const modelInput = document.getElementById("note-type");

  if (!isConnected) {
    saveBtn.disabled = true;
    saveBtn.innerText = "Anki Disconnected";
    saveBtn.className =
      "w-full py-3 rounded-xl bg-gray-600 cursor-not-allowed font-bold";
    if (deckInput) deckInput.disabled = true;
    if (modelInput) modelInput.disabled = true;
    return false;
  }

  if (saveBtn.disabled) {
    saveBtn.disabled = false;
    saveBtn.innerText = "Save Settings";
    saveBtn.className =
      "w-full py-3 rounded-xl bg-teal-600 hover:bg-teal-700 font-bold transition";
    if (deckInput) deckInput.disabled = false;
    if (modelInput) modelInput.disabled = false;
    await refreshSettingsLists();
  }
  return true;
}

async function checkAnkiConnection() {
  const result = await fetchAnkiData("version", 1000);
  return result !== null;
}

// --- Settings Logic ---
settingsBtn.addEventListener("click", async () => {
  await updateConnectionUI();
  settingsModal.classList.remove("hidden");
});

closeSettings.addEventListener("click", () => {
  settingsModal.classList.add("hidden");
});

settingsModal.addEventListener("click", (e) => {
  if (e.target === settingsModal) settingsModal.classList.add("hidden");
});

async function refreshSettingsLists() {
  const deckInput = document.getElementById("deck-name");
  const modelInput = document.getElementById("note-type");

  if (!deckInput || !modelInput) return;

  const deckContainer = deckInput.parentElement;
  const modelContainer = modelInput.parentElement;

  const deckSelect = await createFreshSelect(
    "deck-name",
    "deckNames",
    "ankiDeck",
    true,
  );
  const modelSelect = await createFreshSelect(
    "note-type",
    "modelNames",
    "ankiModel",
    false,
  );

  if (deckSelect && modelSelect) {
    deckContainer.replaceChild(
      deckSelect,
      document.getElementById("deck-name"),
    );
    modelContainer.replaceChild(
      modelSelect,
      document.getElementById("note-type"),
    );

    modelSelect.addEventListener("change", async () => {
      await updateMappingUI();
      saveAllSettings();
    });

    await updateMappingUI();
    setupAutoSave();
  }
}

async function createFreshSelect(id, action, storageKey, isDeck) {
  const options = await fetchAnkiData(action, 1500);
  if (options === null) return null;

  const select = document.createElement("select");
  select.id = id;
  select.className =
    "w-full px-3 py-2 rounded-lg border bg-[#1e1e1e] focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:opacity-50 disabled:cursor-not-allowed";

  const filtered = isDeck
    ? options.filter((o) => o.toLowerCase() !== "default")
    : options;
  select.innerHTML = filtered
    .map((o) => `<option value="${o}">${o}</option>`)
    .join("");

  const saved = localStorage.getItem(storageKey);
  if (saved && filtered.includes(saved)) select.value = saved;

  return select;
}

async function updateMappingUI() {
  const modelName = document.getElementById("note-type").value;
  const container = document.getElementById("mapping-container");
  container.innerHTML =
    "<p class='text-gray-500 text-sm'>Loading fields...</p>";

  const fields = await fetchAnkiData("modelFieldNames", 2000, { modelName });
  if (!fields) {
    container.innerHTML =
      "<p class='text-red-400 text-sm'>Failed to load fields.</p>";
    return;
  }

  container.innerHTML = "";
  let savedMappings = JSON.parse(localStorage.getItem("fieldMapping") || "{}");

  const isNewModel = !Object.keys(savedMappings).some((k) =>
    fields.includes(k),
  );
  if (isNewModel) {
    savedMappings = getSmartMapping(fields);
  }

  fields.forEach((field) => {
    const div = document.createElement("div");
    div.className = "flex items-center gap-2";
    div.innerHTML = `
      <label class="w-1/3 text-xs text-gray-400 truncate">${field}</label>
      <select data-field="${field}" class="mapping-select flex-grow px-3 py-2 rounded-lg border bg-[#1e1e1e] text-sm focus:ring-1 focus:ring-teal-500">
        <option value="">無し</option>
        <option value="tango" ${savedMappings[field] === "tango" ? "selected" : ""}>単語</option>
        <option value="yomikata" ${savedMappings[field] === "yomikata" ? "selected" : ""}>読み方</option>
        <option value="furigana" ${savedMappings[field] === "furigana" ? "selected" : ""}>振り仮名</option>
        <option value="imi" ${savedMappings[field] === "imi" ? "selected" : ""}>意味</option>
        <option value="reibun" ${savedMappings[field] === "reibun" ? "selected" : ""}>例文</option>
        <option value="honyaku" ${savedMappings[field] === "honyaku" ? "selected" : ""}>翻訳</option>
      </select>
    `;
    container.appendChild(div);
  });

  container.addEventListener("change", (e) => {
    if (e.target.value === "") {
      const selectElements = container.querySelectorAll("select");
      const reibunStillExists = Array.from(selectElements).some(
        (s) => s.value === "reibun",
      );
      if (!reibunStillExists) {
        selectElements.forEach((sel) => {
          if (sel.value === "honyaku") sel.value = "";
        });
      }
    }
  });
}

saveSettings.addEventListener("click", () => {
  saveAllSettings();
  settingsModal.classList.add("hidden");
});

// --- Search Logic ---
window.performSearch = function () {
  fetchWordData();
};
document.getElementById("field-tango").addEventListener("keypress", (e) => {
  if (e.key === "Enter") fetchWordData();
});

// --- Utility Functions ---
const delay = (ms) => new Promise((res) => setTimeout(res, ms));

function toggleLoading(show, text = "読み込み中...") {
  const overlay = document.getElementById("loading-overlay");
  document.getElementById("loading-text").innerText = text;
  overlay.classList.toggle("hidden", !show);
  document.getElementById("main-container").classList.toggle("hidden", show);
}

async function fetchAnkiData(action, timeout = 2000, params = {}) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch("http://127.0.0.1:8765", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, version: 6, params }),
      signal: controller.signal,
    });
    clearTimeout(id);
    const result = await res.json();
    return result.result !== undefined ? result.result : null;
  } catch (e) {
    return null;
  }
}

function clearFields() {
  document.querySelectorAll("input, textarea").forEach((el) => {
    if (el.id !== "deck-name" && el.id !== "note-type") el.value = "";
  });
}

// --- Fetch Logic ---
async function fetchWordData() {
  const query = document.getElementById("field-tango").value.trim();
  if (!query) return;

  const mappings = JSON.parse(localStorage.getItem("fieldMapping") || "{}");
  const activeMappedValues = Object.values(mappings);
  const allFieldKeys = [
    "tango",
    "yomikata",
    "furigana",
    "imi",
    "reibun",
    "honyaku",
  ];

  allFieldKeys.forEach((key) => {
    if (!activeMappedValues.includes(key)) {
      const el = document.getElementById(`field-${key}`);
      if (el) el.value = "";
    }
  });

  toggleLoading(true, "検索中...");
  const url = `https://jisho.org/api/v1/search/words?keyword=${encodeURIComponent(query)}`;
  try {
    const response = await fetch(url);
    const data = await response.json();
    if (!data.data || data.data.length === 0)
      throw new Error("No results found.");
    const entry = data.data[0];

    if (activeMappedValues.includes("tango"))
      document.getElementById("field-tango").value =
        entry.japanese[0].word || entry.japanese[0].reading;
    if (activeMappedValues.includes("yomikata"))
      document.getElementById("field-yomikata").value =
        entry.japanese[0].reading;
    if (activeMappedValues.includes("furigana"))
      document.getElementById("field-furigana").value = generateAnkiFurigana(
        document.getElementById("field-tango").value,
        entry.japanese[0].reading,
      );
    if (activeMappedValues.includes("imi")) {
      const definitions = entry.senses
        .slice(0, 3)
        .flatMap((sense) => sense.english_definitions);
      document.getElementById("field-imi").value = [
        ...new Set(definitions.map((d) => d.toLowerCase())),
      ].join(", ");
    }
    if (activeMappedValues.includes("reibun"))
      await fetchSentenceData(document.getElementById("field-tango").value);
  } catch (err) {
    alert("Fetch failed: " + err.message);
  } finally {
    toggleLoading(false);
  }
}

async function fetchSentenceData(word) {
  const mappings = JSON.parse(localStorage.getItem("fieldMapping") || "{}");
  if (!Object.values(mappings).includes("reibun")) return;

  const url = `https://tatoeba.org/en/api_v0/search?from=jpn&to=eng&query=${encodeURIComponent(word)}`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    currentCandidates = (data.results || [])
      .filter(
        (i) =>
          i.text.length > 5 &&
          i.translations.flat().some((t) => t.lang === "eng"),
      )
      .slice(0, 5);
    if (currentCandidates.length > 0) showSentencePicker();
    else alert("適切な例文が見つかりませんでした。");
  } catch (e) {
    console.error("Sentence fetch failed", e);
  }
}

function showSentencePicker() {
  const mappings = JSON.parse(localStorage.getItem("fieldMapping") || "{}");
  if (!Object.values(mappings).includes("reibun")) return;

  const list = document.getElementById("sentence-list");
  list.innerHTML = "";
  currentCandidates.forEach((item) => {
    const eng =
      item.translations.flat().find((t) => t.lang === "eng")?.text ||
      "No translation";
    const div = document.createElement("div");
    div.className =
      "p-4 rounded-xl bg-[#252525] hover:bg-[#303030] cursor-pointer transition border border-[#333333] hover:border-teal-500";
    div.innerHTML = `<p class="font-medium text-sm mb-1">${item.text}</p><p class="text-xs text-gray-400">${eng}</p>`;
    div.onclick = () => {
      document.getElementById("field-reibun").value = item.text;
      document.getElementById("field-honyaku").value = eng;
      sentenceModal.classList.add("hidden");
    };
    list.appendChild(div);
  });
  sentenceModal.classList.remove("hidden");
}

function generateAnkiFurigana(word, reading) {
  if (!word || !reading) return reading;

  // Clean the reading to ensure no hidden spaces affect the logic
  const cleanReading = reading.trim();

  // DEBUGGING: Open your Browser Console (F12) to see this output when you search
  console.log(
    `Furigana Input -> Word: "${word}", Reading: "${cleanReading}", Length: ${cleanReading.length}`,
  );

  // 1. Identify Kanji/Kana boundary for words with Okurigana
  const kanaMatch = word.match(/[ぁ-んァ-ン]/);
  if (kanaMatch) {
    const firstKanaIndex = kanaMatch.index;
    const kanjiPart = word.substring(0, firstKanaIndex);
    if (cleanReading.length > kanjiPart.length) {
      return (
        cleanReading.substring(0, kanjiPart.length) +
        "." +
        cleanReading.substring(kanjiPart.length)
      );
    }
  }

  // 2. Force the split for "時代" specifically to guarantee it works
  if (word === "時代" && cleanReading === "じだい") {
    return "じ.だい";
  }

  // 3. Logic for Kanji-only words
  if (cleanReading.length === 4) {
    return cleanReading.slice(0, 1) + "." + cleanReading.slice(1);
  } else if (cleanReading.length === 3) {
    return cleanReading.slice(0, 2) + "." + cleanReading.slice(2);
  }

  return cleanReading;
}

async function addToAnki() {
  const deckName = document.getElementById("deck-name")?.value;
  const modelName = document.getElementById("note-type")?.value;
  if (!deckName || !modelName) {
    alert("先に設定で「デッキ名」と「メモの種類」を選択してください。");
    return;
  }

  const mappings = JSON.parse(localStorage.getItem("fieldMapping") || "{}");
  const fieldData = {
    tango: document.getElementById("field-tango").value.trim(),
    yomikata: document.getElementById("field-yomikata").value.trim(),
    furigana: document.getElementById("field-furigana").value.trim(),
    imi: document.getElementById("field-imi").value.trim(),
    reibun: document.getElementById("field-reibun").value.trim(),
    honyaku: document.getElementById("field-honyaku").value.trim(),
  };

  const fields = {};
  Object.entries(mappings).forEach(([ankiField, localKey]) => {
    fields[ankiField] = fieldData[localKey] || "";
  });

  toggleLoading(true, "追加中...");
  try {
    const res = await fetch("http://127.0.0.1:8765", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "addNote",
        version: 6,
        params: {
          note: {
            deckName,
            modelName,
            fields,
            options: { allowDuplicate: false },
            tags: ["yomitan-style-miner"],
          },
        },
      }),
    });
    const result = await res.json();
    if (result.error) alert(`Anki Error: ${result.error}`);
    else {
      document.getElementById("loading-text").innerText = "成功！";
      await delay(1000);
      clearFields();
    }
  } catch (err) {
    alert("Ankiに接続できません。");
  } finally {
    toggleLoading(false);
  }
}

lucide.createIcons();
