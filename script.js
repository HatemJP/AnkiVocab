const settingsBtn = document.getElementById("settings-btn");
const settingsModal = document.getElementById("settings-modal");
const closeSettings = document.getElementById("close-settings");
const saveSettings = document.getElementById("save-settings");
const sentenceModal = document.getElementById("sentence-modal");

let currentReadings = [];

// --- Keyboard Navigation & Global Listeners ---
document.addEventListener("keydown", (e) => {
  // Close modals with ESC
  if (e.key === "Escape") {
    settingsModal.classList.add("hidden");
    sentenceModal.classList.add("hidden");
  }

  // Trigger "Add to Anki" with Ctrl/Cmd + Enter
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    // Only trigger if we aren't in a modal
    if (
      settingsModal.classList.contains("hidden") &&
      sentenceModal.classList.contains("hidden")
    ) {
      addToAnki();
    }
  }
});

// --- Settings Logic ---
settingsBtn.addEventListener("click", () => {
  settingsModal.classList.remove("hidden");
});

closeSettings.addEventListener("click", () => {
  settingsModal.classList.add("hidden");
});

settingsModal.addEventListener("click", (e) => {
  if (e.target === settingsModal) {
    settingsModal.classList.add("hidden");
  }
});

function loadSettings() {
  document.getElementById("deck-name").value =
    localStorage.getItem("ankiDeck") || "";
  document.getElementById("note-type").value =
    localStorage.getItem("ankiModel") || "";
}

saveSettings.addEventListener("click", () => {
  const deckName = document.getElementById("deck-name").value.trim();
  const noteType = document.getElementById("note-type").value.trim();
  localStorage.setItem("ankiDeck", deckName);
  localStorage.setItem("ankiModel", noteType);
  settingsModal.classList.add("hidden");
});

loadSettings();

// --- Search Logic ---
window.performSearch = function () {
  fetchWordData();
};

document
  .getElementById("field-tango")
  .addEventListener("keypress", function (e) {
    if (e.key === "Enter") {
      fetchWordData();
    }
  });

// --- Utility Functions ---
const delay = (ms) => new Promise((res) => setTimeout(res, ms));

function toggleLoading(show, text = "読み込み中...") {
  const overlay = document.getElementById("loading-overlay");
  document.getElementById("loading-text").innerText = text;
  overlay.classList.toggle("hidden", !show);
  document.getElementById("main-container").classList.toggle("hidden", show);
}

// --- Settings Logic ---
async function fetchAnkiData(action) {
  try {
    const res = await fetch("http://127.0.0.1:8765", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: action, version: 6 }),
    });
    const result = await res.json();
    return result.result || [];
  } catch (e) {
    console.error(`Failed to fetch ${action}`, e);
    return [];
  }
}

async function convertInputsToSelects() {
  const inputs = ["deck-name", "note-type"];
  const actions = ["deckNames", "modelNames"];

  for (let i = 0; i < inputs.length; i++) {
    const oldEl = document.getElementById(inputs[i]);
    if (oldEl.tagName === "INPUT") {
      const select = document.createElement("select");
      select.id = inputs[i];
      select.className =
        oldEl.className +
        " focus:ring-1 focus:ring-teal-500 focus:outline-none";

      // Fetch data
      let options = await fetchAnkiData(actions[i]);

      // --- NEW: Filter out 'Default' ---
      if (i === 0) {
        // Only for deck names
        options = options.filter((opt) => opt.toLowerCase() !== "default");
      }

      select.innerHTML = options
        .map((o) => `<option value="${o}">${o}</option>`)
        .join("");

      const saved = localStorage.getItem(i === 0 ? "ankiDeck" : "ankiModel");
      if (saved) select.value = saved;

      oldEl.parentNode.replaceChild(select, oldEl);
    }
  }
}

// Ensure this runs when the modal is opened
settingsBtn.addEventListener("click", async () => {
  await convertInputsToSelects();
  settingsModal.classList.remove("hidden");
});

// Update save logic
saveSettings.addEventListener("click", () => {
  const deckName = document.getElementById("deck-name").value;
  const noteType = document.getElementById("note-type").value;

  localStorage.setItem("ankiDeck", deckName);
  localStorage.setItem("ankiModel", noteType);
  settingsModal.classList.add("hidden");
});

function clearFields() {
  document.querySelectorAll("input, textarea").forEach((el) => {
    el.value = "";
  });
}

// --- Fetch Logic ---
async function fetchWordData() {
  const query = document.getElementById("field-tango").value.trim();
  if (!query) return;

  toggleLoading(true, "検索中...");

  const url = `https://jisho.org/api/v1/search/words?keyword=${encodeURIComponent(query)}`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (!data.data || data.data.length === 0)
      throw new Error("No results found.");

    const entry = data.data[0];
    const tango = entry.japanese[0].word || entry.japanese[0].reading;
    const yomikata = entry.japanese[0].reading;

    document.getElementById("field-tango").value = tango;
    document.getElementById("field-yomikata").value = yomikata;
    document.getElementById("field-furigana").value = generateAnkiFurigana(
      tango,
      yomikata,
    );

    const definitions = entry.senses
      .slice(0, 3)
      .flatMap((sense) => sense.english_definitions);
    const uniqueMeanings = [
      ...new Set(definitions.map((d) => d.toLowerCase())),
    ].map((key) => {
      const candidates = definitions.filter((d) => d.toLowerCase() === key);
      return candidates.find((d) => /^[A-Z]/.test(d)) || candidates[0];
    });

    document.getElementById("field-imi").value = uniqueMeanings.join(", ");
    await fetchSentenceData(tango);
  } catch (err) {
    alert("Fetch failed: " + err.message);
  } finally {
    toggleLoading(false);
  }
}

async function fetchSentenceData(word) {
  const url = `https://tatoeba.org/en/api_v0/search?from=jpn&to=eng&query=${encodeURIComponent(word)}`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    const filtered = (data.results || []).filter((item) => {
      if (item.text.length < 6) return false;
      const particlePattern = new RegExp(`^${word}[はがをにへともで]`, "u");
      if (particlePattern.test(item.text) && item.text.length < 10)
        return false;
      return item.translations.flat().some((t) => t.lang === "eng");
    });

    currentCandidates = filtered.slice(0, 5);
    if (currentCandidates.length > 0) showSentencePicker();
    else alert("適切な例文が見つかりませんでした。");
  } catch (e) {
    console.error("Sentence fetch failed", e);
  }
}

function showSentencePicker() {
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
  if (word === reading) return word;
  let furigana = "";
  let wIdx = 0;
  let rIdx = 0;
  while (wIdx < word.length) {
    const char = word[wIdx];
    if (char.match(/[一-龠々]/)) {
      let kanjiRun = char;
      wIdx++;
      while (wIdx < word.length && word[wIdx].match(/[一-龠々]/)) {
        kanjiRun += word[wIdx];
        wIdx++;
      }
      const nextKana = word[wIdx] || "";
      let targetIdx = nextKana
        ? reading.indexOf(nextKana, rIdx)
        : reading.length;
      if (targetIdx === -1) targetIdx = reading.length;
      const readingPart = reading.substring(rIdx, targetIdx);
      furigana += ` ${kanjiRun}[${readingPart}]`;
      rIdx = targetIdx;
    } else {
      furigana += char;
      wIdx++;
      rIdx++;
    }
  }
  return furigana.trim();
}

// --- Anki Integration ---
async function addToAnki() {
  const deckName = (localStorage.getItem("ankiDeck") || "").trim();
  const modelName = (localStorage.getItem("ankiModel") || "").trim();

  if (!deckName || !modelName) {
    alert(
      "カードを追加する前に、設定で「デッキ名」と「メモの種類」の両方を設定してください。",
    );
    return;
  }

  const fields = {
    単語: document.getElementById("field-tango").value.trim(),
    読み方: document.getElementById("field-yomikata").value.trim(),
    振り仮名: document.getElementById("field-furigana").value.trim(),
    意味: document.getElementById("field-imi").value.trim(),
    例文: document.getElementById("field-reibun").value.trim(),
    翻訳: document.getElementById("field-honyaku").value.trim(),
  };

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
    if (result.error) {
      alert(`Anki Error: ${result.error}`);
      toggleLoading(false);
    } else {
      document.getElementById("loading-text").innerText = "成功！";
      await delay(1000);
      clearFields();
      toggleLoading(false);
    }
  } catch (err) {
    alert("Could not reach Anki. Is it open?");
    toggleLoading(false);
  }
}

lucide.createIcons();
