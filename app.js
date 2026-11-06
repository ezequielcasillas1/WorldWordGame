(function () {
  "use strict";

  const VISITOR_STORAGE_KEY = "worldword_visitor_id";
  const THEME_STORAGE_KEY = "worldword_theme";
  const RECENT_WORD_STORAGE_KEY = "worldword_recent_word";
  const AUTO_REFRESH_SECONDS = 30;
  const TILE_COLOR_CLASSES = ["tile-green", "tile-yellow", "tile-gray"];

  // Persistent Visitor ID for multi-visitor tracking via X-Visitor-Id header
  function getOrCreateVisitorId() {
    try {
      let existing = localStorage.getItem(VISITOR_STORAGE_KEY);
      if (existing && /^[a-zA-Z0-9_-]{4,128}$/.test(existing)) {
        return existing;
      }
      const generated =
        "visitor-" +
        Date.now().toString(36) +
        "-" +
        Math.random().toString(36).slice(2, 10);
      localStorage.setItem(VISITOR_STORAGE_KEY, generated);
      return generated;
    } catch (_err) {
      return "visitor-session-" + Math.random().toString(36).slice(2, 10);
    }
  }

  const visitorId = getOrCreateVisitorId();
  let recentSubmittedWord = "";
  try {
    recentSubmittedWord = localStorage.getItem(RECENT_WORD_STORAGE_KEY) || "";
  } catch (_err) {
    recentSubmittedWord = "";
  }

  // DOM References
  const htmlEl = document.documentElement;
  const toastContainer = document.getElementById("toast-container");
  const themeToggleBtn = document.getElementById("theme-toggle-btn");
  const iconMoon = document.getElementById("icon-moon");
  const iconSun = document.getElementById("icon-sun");

  const howToPlayBtn = document.getElementById("how-to-play-btn");
  const howToPlayModal = document.getElementById("how-to-play-modal");
  const modalCloseBtn = document.getElementById("modal-close-btn");
  const modalGotItBtn = document.getElementById("modal-got-it-btn");

  const statTotalSubmissions = document.getElementById("stat-total-submissions");
  const statUniqueWords = document.getElementById("stat-unique-words");
  const statTopWord = document.getElementById("stat-top-word");

  const wordForm = document.getElementById("word-form");
  const inputWrapper = document.getElementById("input-wrapper");
  const wordInput = document.getElementById("word-input");
  const charCounter = document.getElementById("char-counter");
  const submitBtn = document.getElementById("submit-btn");

  const resultCard = document.getElementById("result-card");
  const resultTiles = document.getElementById("result-tiles");
  const resultTimesSaid = document.getElementById("result-times-said");
  const resultGlobalRank = document.getElementById("result-global-rank");
  const resultShareNote = document.getElementById("result-share-note");

  const leaderboardList = document.getElementById("leaderboard-list");
  const refreshBtn = document.getElementById("refresh-btn");
  const refreshIcon = document.getElementById("refresh-icon");
  const countdownSecondsEl = document.getElementById("countdown-seconds");

  // Theme Initialization & Toggle
  function applyTheme(theme) {
    const normalized = theme === "dark" ? "dark" : "light";
    htmlEl.setAttribute("data-theme", normalized);
    if (normalized === "dark") {
      iconMoon.classList.add("hidden");
      iconSun.classList.remove("hidden");
    } else {
      iconSun.classList.add("hidden");
      iconMoon.classList.remove("hidden");
    }
    try {
      localStorage.setItem(THEME_STORAGE_KEY, normalized);
    } catch (_err) {
      // ignore storage errors
    }
  }

  function initTheme() {
    let saved = null;
    try {
      saved = localStorage.getItem(THEME_STORAGE_KEY);
    } catch (_err) {
      saved = null;
    }
    if (saved === "dark" || saved === "light") {
      applyTheme(saved);
    } else if (
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
    ) {
      applyTheme("dark");
    } else {
      applyTheme("light");
    }
  }

  themeToggleBtn.addEventListener("click", () => {
    const current = htmlEl.getAttribute("data-theme");
    applyTheme(current === "dark" ? "light" : "dark");
  });

  // Toast Notifications
  function showToast(message, type = "info", durationMs = 2600) {
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transition = "opacity 0.2s ease";
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 200);
    }, durationMs);
  }

  function triggerInputShake() {
    inputWrapper.classList.remove("shake");
    void inputWrapper.offsetWidth;
    inputWrapper.classList.add("shake");
  }

  // Modal Controls
  function openModal() {
    howToPlayModal.classList.remove("hidden");
    modalCloseBtn.focus();
  }

  function closeModal() {
    howToPlayModal.classList.add("hidden");
    wordInput.focus();
  }

  howToPlayBtn.addEventListener("click", openModal);
  modalCloseBtn.addEventListener("click", closeModal);
  modalGotItBtn.addEventListener("click", closeModal);
  howToPlayModal.addEventListener("click", (e) => {
    if (e.target === howToPlayModal) {
      closeModal();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !howToPlayModal.classList.contains("hidden")) {
      closeModal();
    }
  });

  // Input Filtering & Character Counter (Uppercase, Letters Only, Max 50)
  wordInput.addEventListener("input", () => {
    const raw = wordInput.value;
    const lettersOnly = raw.replace(/[^a-zA-Z]/g, "").toUpperCase().slice(0, 50);
    if (raw.toUpperCase() !== lettersOnly) {
      wordInput.value = lettersOnly;
      if (/[^a-zA-Z\s]/.test(raw)) {
        showToast("Letters only (A–Z) — single word", "error", 1800);
      }
    } else {
      wordInput.value = lettersOnly;
    }
    charCounter.textContent = `${wordInput.value.length} / 50`;
  });

  // API Helper with X-Visitor-Id Header
  async function apiRequest(path, options = {}) {
    const headers = Object.assign(
      {
        "Content-Type": "application/json",
        "X-Visitor-Id": visitorId,
      },
      options.headers || {}
    );

    const response = await fetch(path, {
      ...options,
      headers,
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const errMessage =
        data.error || data.detail || `Request failed (${response.status})`;
      throw new Error(errMessage);
    }
    return data;
  }

  // Render Animated Letter Tiles in Result Card
  function renderResultCard(submission) {
    const upperWord = String(
      submission.displayWord || submission.word || ""
    ).toUpperCase();
    const count = Number(submission.timesSaid ?? submission.count ?? 1);
    const rank = Number(submission.globalRank ?? submission.rank ?? 1);
    const sharePercent =
      submission.sharePercent !== undefined
        ? `${submission.sharePercent}% of global pool`
        : "";

    resultTiles.innerHTML = "";
    const isLongWord = upperWord.length > 10;

    Array.from(upperWord).forEach((char, idx) => {
      const tile = document.createElement("span");
      const colorClass = TILE_COLOR_CLASSES[idx % TILE_COLOR_CLASSES.length];
      tile.className = `letter-tile ${colorClass}${
        isLongWord ? " compact-tile" : ""
      }`;
      tile.style.setProperty("--flip-delay", `${idx * 65}ms`);
      tile.style.setProperty("--cycle-delay", `${idx * 350}ms`);
      tile.textContent = char;
      resultTiles.appendChild(tile);
    });

    resultTimesSaid.textContent = count.toLocaleString();
    resultGlobalRank.textContent = `#${rank.toLocaleString()}`;
    resultShareNote.textContent = sharePercent;
    resultCard.classList.remove("hidden");
  }

  function getModeration() {
    return window.WorldWordModeration || null;
  }

  // Render Stats Bar
  function renderStats(statsData) {
    if (!statsData) return;
    const mod = getModeration();
    const safeStats = mod ? mod.sanitizeStats(statsData) : statsData;
    const total = Number(
      safeStats.totalSubmissions ?? safeStats.total_submissions ?? 0
    );
    const unique = Number(
      safeStats.uniqueWords ?? safeStats.unique_words ?? 0
    );
    const topWord = String(
      safeStats.topWord ?? safeStats.top_word ?? ""
    ).toUpperCase();
    const topCount = Number(
      safeStats.topWordCount ?? safeStats.top_word_count ?? 0
    );

    statTotalSubmissions.textContent = total.toLocaleString();
    statUniqueWords.textContent = unique.toLocaleString();
    statTopWord.textContent = topWord
      ? `${topWord} (${topCount.toLocaleString()})`
      : "—";
  }

  // Render Global Leaderboard (Top 50)
  function renderLeaderboard(payload) {
    const rawItems = Array.isArray(payload)
      ? payload
      : Array.isArray(payload.leaderboard)
      ? payload.leaderboard
      : [];
    const mod = getModeration();
    const items = mod ? mod.filterLeaderboardItems(rawItems) : rawItems;

    if (!recentSubmittedWord && payload && payload.recentWord) {
      recentSubmittedWord = String(payload.recentWord).toLowerCase();
    }

    leaderboardList.innerHTML = "";

    if (items.length === 0) {
      const emptyEl = document.createElement("p");
      emptyEl.className = "input-hint";
      emptyEl.textContent = "No words submitted yet. Be the first!";
      leaderboardList.appendChild(emptyEl);
      return;
    }

    items.forEach((item) => {
      const rank = Number(item.rank);
      const wordLower = String(item.word || "").toLowerCase();
      const wordUpper = String(item.displayWord || wordLower).toUpperCase();
      const count = Number(item.count || 0);
      const share = Number(item.sharePercent ?? item.share ?? 0).toFixed(1);
      const barWidth = Math.max(4, Math.min(100, Number(item.barPercent || 10)));
      const medal =
        rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : "";
      const isRecent =
        Boolean(recentSubmittedWord && wordLower === recentSubmittedWord) ||
        Boolean(item.isRecentVisitorWord && !recentSubmittedWord);

      const row = document.createElement("div");
      row.className = `lb-row rank-${rank}${
        isRecent ? " recent-submission" : ""
      }`;
      row.setAttribute("role", "listitem");
      row.style.setProperty("--bar-width", `${barWidth}%`);

      const bar = document.createElement("div");
      bar.className = "lb-bar";
      row.appendChild(bar);

      const rankCell = document.createElement("div");
      rankCell.className = "lb-cell lb-rank";
      if (medal) {
        const medalSpan = document.createElement("span");
        medalSpan.className = "lb-medal";
        medalSpan.textContent = medal;
        rankCell.appendChild(medalSpan);
      }
      const rankNum = document.createElement("span");
      rankNum.textContent = `#${rank}`;
      rankCell.appendChild(rankNum);
      row.appendChild(rankCell);

      const wordCell = document.createElement("div");
      wordCell.className = "lb-cell lb-word-wrap";
      const wordText = document.createElement("span");
      wordText.className = "lb-word";
      wordText.textContent = wordUpper;
      wordCell.appendChild(wordText);

      if (isRecent) {
        const badge = document.createElement("span");
        badge.className = "your-word-tag";
        badge.textContent = "YOUR WORD";
        wordCell.appendChild(badge);
      }
      row.appendChild(wordCell);

      const countCell = document.createElement("div");
      countCell.className = "lb-cell lb-count";
      countCell.textContent = count.toLocaleString();
      row.appendChild(countCell);

      const shareCell = document.createElement("div");
      shareCell.className = "lb-cell lb-share";
      shareCell.textContent = `${share}%`;
      row.appendChild(shareCell);

      leaderboardList.appendChild(row);
    });
  }

  // Fetch both Leaderboard & Stats
  async function refreshAllData(showFeedbackToast = false) {
    try {
      refreshIcon.classList.add("spinning");
      const [leaderboardData, statsData] = await Promise.all([
        apiRequest("/api/leaderboard?limit=50"),
        apiRequest("/api/stats"),
      ]);
      renderLeaderboard(leaderboardData);
      renderStats(statsData);
      if (showFeedbackToast) {
        showToast("Leaderboard refreshed", "info", 1600);
      }
    } catch (err) {
      if (showFeedbackToast) {
        showToast(err.message || "Could not refresh leaderboard", "error");
      }
    } finally {
      setTimeout(() => refreshIcon.classList.remove("spinning"), 550);
    }
  }

  // Handle Word Submission
  wordForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const rawValue = wordInput.value.trim();

    if (!rawValue) {
      triggerInputShake();
      showToast("Please enter a word first!", "error");
      wordInput.focus();
      return;
    }

    if (!/^[a-zA-Z]+$/.test(rawValue)) {
      triggerInputShake();
      showToast("Single word with letters only (A–Z).", "error");
      wordInput.focus();
      return;
    }

    if (rawValue.length > 50) {
      triggerInputShake();
      showToast("Word must be 50 characters or fewer.", "error");
      wordInput.focus();
      return;
    }

    const moderation = getModeration();
    if (moderation) {
      const verdict = moderation.checkWord(rawValue);
      if (!verdict.ok) {
        triggerInputShake();
        showToast(
          verdict.message ||
            "That word isn't allowed here. Please try a different word.",
          "error"
        );
        wordInput.focus();
        return;
      }
    }

    const originalBtnText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = "CHECKING DICTIONARY...";
    try {
      const response = await apiRequest("/api/submit", {
        method: "POST",
        body: JSON.stringify({ word: rawValue }),
      });

      recentSubmittedWord = String(response.word || rawValue).toLowerCase();
      try {
        localStorage.setItem(RECENT_WORD_STORAGE_KEY, recentSubmittedWord);
      } catch (_err) {
        // ignore storage error
      }

      renderResultCard(response);
      if (response.stats) {
        renderStats(response.stats);
      }

      wordInput.value = "";
      charCounter.textContent = "0 / 50";

      showToast(
        `"${recentSubmittedWord.toUpperCase()}" submitted! Ranked #${
          response.globalRank ?? response.rank
        }`,
        "success"
      );

      await refreshAllData(false);
      resetAutoRefreshTimer();
    } catch (err) {
      triggerInputShake();
      showToast(err.message || "Failed to submit word.", "error");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = originalBtnText;
      wordInput.focus();
    }
  });

  // Auto-Refresh Every 30 Seconds + Manual Refresh Button
  let remainingSeconds = AUTO_REFRESH_SECONDS;
  let countdownIntervalId = null;

  function resetAutoRefreshTimer() {
    remainingSeconds = AUTO_REFRESH_SECONDS;
    if (countdownSecondsEl) {
      countdownSecondsEl.textContent = String(remainingSeconds);
    }
  }

  function startAutoRefreshLoop() {
    if (countdownIntervalId) {
      clearInterval(countdownIntervalId);
    }
    countdownIntervalId = setInterval(() => {
      remainingSeconds -= 1;
      if (remainingSeconds <= 0) {
        resetAutoRefreshTimer();
        refreshAllData(false);
      } else if (countdownSecondsEl) {
        countdownSecondsEl.textContent = String(remainingSeconds);
      }
    }, 1000);
  }

  refreshBtn.addEventListener("click", () => {
    resetAutoRefreshTimer();
    refreshAllData(true);
  });

  // Boot
  initTheme();
  refreshAllData(false);
  startAutoRefreshLoop();
})();
