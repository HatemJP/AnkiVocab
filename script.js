const settingsBtn = document.getElementById("settings-btn");
const settingsModal = document.getElementById("settings-modal");
const closeSettings = document.getElementById("close-settings");
const saveSettings = document.getElementById("save-settings");

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

document
  .getElementById("field-tango")
  .addEventListener("keypress", function (e) {
    if (e.key === "Enter") {
      fetchWordData();
    }
  });

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

function toggleLoading(show, text = "読み込み中...") {
  const overlay = document.getElementById("loading-overlay");
  document.getElementById("loading-text").innerText = text;
  overlay.classList.toggle("hidden", !show);
  document.getElementById("main-container").classList.toggle("hidden", show);
}

function clearFields() {
  document.querySelectorAll("input, textarea").forEach((el) => (el.value = ""));
}

async function fetchWordData() {
  const query = document.getElementById("field-tango").value.trim();
  if (!query) return;
  toggleLoading(true, "検索中...");

  // Direct call: No need for the python proxy
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
    document.getElementById("field-imi").value = entry.senses
      .slice(0, 3)
      .map((s) => s.english_definitions.join(", "))
      .join(", ");

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
    if (data.results && data.results.length > 0) {
      const match = data.results[0];
      document.getElementById("field-reibun").value = match.text;
      const eng = match.translations.flat().find((t) => t.lang === "eng");
      document.getElementById("field-honyaku").value = eng ? eng.text : "";
    }
  } catch (e) {
    console.error("Sentence fetch failed");
  }
}

async function addToAnki() {
  const deckName = (localStorage.getItem("ankiDeck") || "").trim();
  const modelName = (localStorage.getItem("ankiModel") || "").trim();

  // ❌ BLOCK if not configured
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
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "addNote",
        version: 6,
        params: {
          note: {
            deckName,
            modelName,
            fields,
            options: {
              allowDuplicate: false,
            },
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

function generateAnkiFurigana(word, reading) {
  if (word === reading) return word;
  let furigana = "";
  let wIdx = 0,
    rIdx = 0;
  while (wIdx < word.length) {
    let char = word[wIdx];
    if (char.match(/[一-龠々]/)) {
      let kanjiRun = char;
      wIdx++;
      while (wIdx < word.length && word[wIdx].match(/[一-龠々]/)) {
        kanjiRun += word[wIdx];
        wIdx++;
      }
      let nextKana = word[wIdx] || "";
      let targetIdx = nextKana
        ? reading.indexOf(nextKana, rIdx)
        : reading.length;
      if (targetIdx === -1) targetIdx = reading.length;
      let readingPart = reading.substring(rIdx, targetIdx);
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
lucide.createIcons();
