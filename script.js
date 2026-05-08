const state = {
  couples: [],
  currentIndex: 0,
  score: 0,
  today: "",
  currentToday: "",
  isArchiveRound: false,
  guessesLeft: 3,
  fullMinGap: 0,
  fullMaxGap: 30,
  minGap: 0,
  maxGap: 30,
  history: [],
  finalStatus: null,
  isRoundOver: false,
  clockSyncedAtMs: 0,
  clockSyncedAtPerformanceMs: 0
};

const els = {
  image: document.querySelector("#coupleImage"),
  name: document.querySelector("#coupleName"),
  score: document.querySelector("#score"),
  round: document.querySelector("#round"),
  guesses: document.querySelector("#guesses"),
  slider: document.querySelector("#gapSlider"),
  guessValue: document.querySelector("#guessValue"),
  minLabel: document.querySelector("#minLabel"),
  maxLabel: document.querySelector("#maxLabel"),
  history: document.querySelector("#history"),
  checkButton: document.querySelector("#checkButton"),
  countdown: document.querySelector("#countdown"),
  archiveButton: document.querySelector("#archiveButton"),
  archiveDialog: document.querySelector("#archiveDialog"),
  archiveCloseButton: document.querySelector("#archiveCloseButton"),
  archiveList: document.querySelector("#archiveList")
};

const CENTRAL_TIME_ZONE = "America/Chicago";
const ARCHIVE_STORAGE_KEY = "agegapdle:archive:v1";
const CORS_TIME_URL = "https://gettimeapi.dev/v1/time?timezone=America/Chicago";
const INTERNET_TIME_URL = "https://worldtimeapi.org/api/timezone/America/Chicago";
let countdownTimer = null;
let clockResyncTimer = null;

async function loadCouples() {
  try {
    setControlsEnabled(false);
    await syncTrustedClock();
    const response = await fetch("data.json");
    if (!response.ok) throw new Error("Could not load data.json");
    const data = await response.json();
    state.couples = data.dailyCouples;
    state.currentToday = getTodayKey();
    state.today = state.currentToday;
    state.currentIndex = getDailyCoupleIndex(state.couples, state.today);
    renderRound();
    setControlsEnabled(true);
    startCountdown();
    startClockResync();
  } catch (error) {
    addStatus("Could not verify internet time or load game data. Refresh when you are online.", false);
    setControlsEnabled(false);
  }
}

function setControlsEnabled(isEnabled) {
  [els.archiveButton, els.checkButton].forEach((button) => {
    button.disabled = !isEnabled;
    button.classList.toggle("opacity-50", !isEnabled);
  });
}

async function syncTrustedClock() {
  const time = await getInternetTime();
  state.clockSyncedAtMs = time.getTime();
  state.clockSyncedAtPerformanceMs = performance.now();
}

async function getInternetTime() {
  const sources = [getOriginServerTime, getCorsTimeApiTime, getWorldTimeApiTime];

  for (const source of sources) {
    try {
      const time = await source();
      if (time instanceof Date && Number.isFinite(time.getTime())) {
        return time;
      }
    } catch (error) {
      // Try the next trusted source.
    }
  }

  throw new Error("Could not verify internet time");
}

async function getCorsTimeApiTime() {
  const response = await fetch(`${CORS_TIME_URL}&cacheBust=${getCacheBustValue()}`, {
    cache: "no-store"
  });
  if (!response.ok) throw new Error("CORS time request failed");

  const data = await response.json();
  const timestamp = Number(data.timestamp) * 1000;
  if (!Number.isFinite(timestamp)) throw new Error("CORS time response was invalid");

  return new Date(timestamp);
}

async function getWorldTimeApiTime() {
  const response = await fetch(`${INTERNET_TIME_URL}?cacheBust=${getCacheBustValue()}`, {
    cache: "no-store"
  });
  if (!response.ok) throw new Error("Internet time request failed");

  const data = await response.json();
  const timestamp = data.utc_datetime
    ? Date.parse(data.utc_datetime)
    : Number(data.unixtime) * 1000;
  if (!Number.isFinite(timestamp)) throw new Error("Internet time response was invalid");

  return new Date(timestamp);
}

async function getOriginServerTime() {
  if (isLocalOrigin()) {
    throw new Error("Local server time is not trusted");
  }

  const response = await fetch(`data.json?clock=${getCacheBustValue()}`, {
    cache: "no-store"
  });
  if (!response.ok) throw new Error("Origin time request failed");

  const serverDate = response.headers.get("Date");
  if (!serverDate) throw new Error("Origin did not return a Date header");

  return new Date(serverDate);
}

function isLocalOrigin() {
  return ["", "localhost", "127.0.0.1", "::1"].includes(location.hostname);
}

function getCacheBustValue() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return String(Math.random()).slice(2);
}

function getTrustedNow() {
  if (!state.clockSyncedAtMs) {
    throw new Error("Clock has not been synced");
  }

  const elapsed = performance.now() - state.clockSyncedAtPerformanceMs;
  return new Date(state.clockSyncedAtMs + elapsed);
}

function getTodayKey() {
  const { year, month, day } = getCentralDateParts(getTrustedNow());
  return `${year}-${month}-${day}`;
}

function getCentralDateParts(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CENTRAL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    hour12: false
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second
  };
}

function getNextCentralMidnight() {
  const { year, month, day } = getCentralDateParts(getTrustedNow());
  const centralNoon = makeCentralDate(Number(year), Number(month), Number(day), 12, 0, 0);
  centralNoon.setUTCDate(centralNoon.getUTCDate() + 1);
  const nextDay = getCentralDateParts(centralNoon);

  return makeCentralDate(
    Number(nextDay.year),
    Number(nextDay.month),
    Number(nextDay.day),
    0,
    0,
    0
  );
}

function makeCentralDate(year, month, day, hour, minute, second) {
  let timestamp = Date.UTC(year, month - 1, day, hour, minute, second);

  for (let i = 0; i < 3; i += 1) {
    const parts = getCentralDateParts(new Date(timestamp));
    const wanted = Date.UTC(year, month - 1, day, hour, minute, second);
    const actual = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second)
    );
    timestamp += wanted - actual;
  }

  return new Date(timestamp);
}

function getDailyCoupleIndex(couples, today) {
  const exactIndex = couples.findIndex((couple) => couple.date === today);
  if (exactIndex !== -1) return exactIndex;

  const startDate = parseDateKey(couples[0].date);
  const todayDate = parseDateKey(today);
  const daysSinceStart = Math.floor((todayDate - startDate) / 86400000);
  return ((daysSinceStart % couples.length) + couples.length) % couples.length;
}

function parseDateKey(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function renderRound() {
  const couple = getCurrentCouple();
  const startingMax = Math.max(30, Number(couple.gap) + 5);

  state.score = 0;
  state.guessesLeft = 3;
  state.fullMinGap = 0;
  state.fullMaxGap = startingMax;
  state.minGap = state.fullMinGap;
  state.maxGap = startingMax;
  state.history = [];
  state.finalStatus = null;
  state.isRoundOver = false;

  els.image.src = couple.imageLink;
  els.image.alt = `${couple.name}`;
  els.name.textContent = couple.name;
  els.history.innerHTML = "";
  els.slider.disabled = false;
  els.guessValue.classList.remove("hidden");
  els.checkButton.classList.remove("hidden");

  setSliderRange(state.minGap, state.maxGap, Math.round((state.minGap + state.maxGap) / 2));
  restoreSavedGame();
  updateStats();
}

function getCurrentCouple() {
  return state.couples[state.currentIndex];
}

function setSliderRange(min, max, value) {
  els.slider.min = state.fullMinGap;
  els.slider.max = state.fullMaxGap;
  els.slider.value = clamp(value, min, max);
  els.minLabel.textContent = `${state.fullMinGap} years`;
  els.maxLabel.textContent = `${state.fullMaxGap} years`;
  updateSliderMask();
  updateGuessValue();
}

function updateSliderMask() {
  const fullWidth = state.fullMaxGap - state.fullMinGap;
  const start = ((state.minGap - state.fullMinGap) / fullWidth) * 100;
  const end = ((state.maxGap - state.fullMinGap) / fullWidth) * 100;
  const mid = start + ((end - start) / 2);

  els.slider.style.setProperty("--active-start", `${start}%`);
  els.slider.style.setProperty("--active-mid", `${mid}%`);
  els.slider.style.setProperty("--active-end", `${end}%`);
}

function updateGuessValue() {
  const clampedValue = clamp(Number(els.slider.value), state.minGap, state.maxGap);
  if (Number(els.slider.value) !== clampedValue) {
    els.slider.value = clampedValue;
  }

  const value = Number(els.slider.value);
  const label = value === 1 ? "year" : "years";
  els.guessValue.textContent = `${value} ${label}`;
}

function updateStats() {
  els.score.textContent = state.score;
  els.round.textContent = state.today.slice(5);
  els.guesses.textContent = state.guessesLeft;
}

function startCountdown() {
  updateCountdown();
  countdownTimer = setInterval(updateCountdown, 1000);
}

function startClockResync() {
  if (clockResyncTimer) clearInterval(clockResyncTimer);

  clockResyncTimer = setInterval(() => {
    syncTrustedClock().catch(() => {
      // Keep the already verified monotonic clock running if a refresh fails.
    });
  }, 300000);
}

function updateCountdown() {
  const currentToday = getTodayKey();
  if (state.currentToday && currentToday !== state.currentToday) {
    state.currentToday = currentToday;
    if (!state.isArchiveRound) {
      state.today = currentToday;
      state.currentIndex = getDailyCoupleIndex(state.couples, state.today);
      renderRound();
    }
  }

  if (!state.currentToday) {
    state.today = currentToday;
    state.currentToday = currentToday;
  }

  const remaining = Math.max(0, getNextCentralMidnight() - getTrustedNow());
  const totalSeconds = Math.floor(remaining / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  els.countdown.textContent = [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

function checkGuess() {
  if (state.isRoundOver) return;

  const couple = getCurrentCouple();
  const answer = Number(couple.gap);
  const guess = Number(els.slider.value);
  const difference = Math.abs(guess - answer);

  if (guess === answer) {
    recordGuess(guess, difference);
    state.score += state.guessesLeft;
    endRound(`Correct. ${couple.name} have an age gap of ${answer} years.`, true);
    return;
  }

  state.guessesLeft -= 1;
  if (state.guessesLeft === 0) {
    recordGuess(guess, difference);
    endRound(`Out of guesses. The answer was ${answer} years.`, false);
    return;
  }

  narrowRange(answer, guess);
  recordGuess(guess, difference);
  updateStats();
  saveGame();
}

function narrowRange(answer, guess) {
  const currentWidth = state.maxGap - state.minGap;
  const newWidth = state.guessesLeft === 2
    ? Math.max(8, Math.ceil(currentWidth * 0.5))
    : Math.max(4, Math.ceil(currentWidth * 0.35));
  const half = Math.floor(newWidth / 2);

  state.minGap = Math.max(0, answer - half);
  state.maxGap = Math.max(state.minGap + 2, answer + (newWidth - half));

  if (guess < answer) {
    state.minGap = Math.max(state.minGap, guess + 1);
  } else {
    state.maxGap = Math.min(state.maxGap, guess - 1);
  }

  setSliderRange(state.minGap, state.maxGap, Math.round((state.minGap + state.maxGap) / 2));
}

function recordGuess(guess, difference) {
  const rangeMin = state.minGap;
  const rangeMax = state.maxGap;
  const temperature = getTemperature(difference, rangeMin, rangeMax);
  const item = { guess, difference, rangeMin, rangeMax, temperature: temperature.label };

  state.history.push(item);
  addHistory(item);
}

function getTemperature(difference, rangeMin, rangeMax) {
  if (difference === 0) {
    return { label: "Correct", className: "text-emerald-300" };
  }

  const rangeWidth = Math.max(1, rangeMax - rangeMin);
  const hotThreshold = Math.max(1, Math.ceil(rangeWidth * 0.1));
  const isHot = difference <= hotThreshold;

  return {
    label: isHot ? "Hot" : "Cold",
    className: isHot ? "text-emerald-300" : "text-sky-300"
  };
}

function addHistory(item) {
  const { guess, difference } = item;
  const temperature = item.temperature
    ? {
        label: item.temperature,
        className: item.temperature === "Cold" ? "text-sky-300" : "text-emerald-300"
      }
    : getTemperature(
        difference,
        Number.isFinite(item.rangeMin) ? item.rangeMin : state.minGap,
        Number.isFinite(item.rangeMax) ? item.rangeMax : state.maxGap
      );
  const entry = document.createElement("div");
  entry.className = "flex items-center justify-between rounded border border-[#2a2a2a] bg-black px-3 py-2 text-sm";
  entry.innerHTML = `
    <span>Guessed <strong>${guess}</strong> years</span>
    <span class="${temperature.className}">${temperature.label}</span>
  `;
  els.history.prepend(entry);
}

function addStatus(message, won) {
  const entry = document.createElement("div");
  entry.className = `rounded px-3 py-2 text-center text-sm font-bold ${won ? "bg-[#f5c518] text-black" : "bg-[#b91c1c] text-white"}`;
  entry.textContent = message;
  els.history.prepend(entry);
}

function endRound(message, won) {
  state.isRoundOver = true;
  state.finalStatus = { message, won };
  addStatus(message, won);
  els.slider.disabled = true;
  els.guessValue.classList.add("hidden");
  els.checkButton.classList.add("hidden");

  updateStats();
  saveGame();
}

function getStorageKey() {
  return `agegapdle:${state.today}:${getCurrentCouple().name}`;
}

function saveGame() {
  const savedGame = {
    score: state.score,
    guessesLeft: state.guessesLeft,
    minGap: state.minGap,
    maxGap: state.maxGap,
    sliderValue: Number(els.slider.value),
    history: state.history,
    finalStatus: state.finalStatus,
    isRoundOver: state.isRoundOver
  };

  localStorage.setItem(getStorageKey(), JSON.stringify(savedGame));
  saveArchiveEntry(savedGame);
}

function restoreSavedGame() {
  const savedGame = getSavedGame();
  if (!savedGame) return;

  state.score = Number(savedGame.score) || 0;
  state.guessesLeft = Number(savedGame.guessesLeft) || 3;
  state.minGap = Number(savedGame.minGap);
  state.maxGap = Number(savedGame.maxGap);
  state.history = Array.isArray(savedGame.history) ? savedGame.history : [];
  state.finalStatus = savedGame.finalStatus || null;
  state.isRoundOver = Boolean(savedGame.isRoundOver);

  setSliderRange(
    state.minGap,
    state.maxGap,
    Number(savedGame.sliderValue) || Math.round((state.minGap + state.maxGap) / 2)
  );

  els.history.innerHTML = "";
  state.history.forEach((item) => addHistory(item));

  if (state.finalStatus) {
    addStatus(state.finalStatus.message, state.finalStatus.won);
  }

  if (state.isRoundOver) {
    els.slider.disabled = true;
    els.guessValue.classList.add("hidden");
    els.checkButton.classList.add("hidden");
  }
}

function getSavedGame() {
  try {
    return JSON.parse(localStorage.getItem(getStorageKey()));
  } catch (error) {
    return null;
  }
}

function saveArchiveEntry(savedGame) {
  if (!savedGame.history.length && !savedGame.finalStatus) return;

  const couple = getCurrentCouple();
  const archive = getStoredArchive();
  archive[getStorageKey()] = {
    date: state.today,
    coupleName: couple.name,
    score: Number(savedGame.score) || 0,
    guessesUsed: savedGame.history.length,
    isRoundOver: Boolean(savedGame.isRoundOver),
    won: savedGame.finalStatus ? Boolean(savedGame.finalStatus.won) : null,
    updatedAt: getTrustedNow().toISOString()
  };

  localStorage.setItem(ARCHIVE_STORAGE_KEY, JSON.stringify(archive));
}

function getStoredArchive() {
  try {
    const archive = JSON.parse(localStorage.getItem(ARCHIVE_STORAGE_KEY));
    return archive && typeof archive === "object" ? archive : {};
  } catch (error) {
    return {};
  }
}

function getArchiveEntries() {
  const entriesByKey = getStoredArchive();
  const entriesByDate = {};

  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    const match = key && key.match(/^agegapdle:(\d{4}-\d{2}-\d{2}):(.+)$/);
    if (!match || entriesByKey[key]) continue;

    try {
      const savedGame = JSON.parse(localStorage.getItem(key));
      const history = Array.isArray(savedGame.history) ? savedGame.history : [];
      if (!history.length && !savedGame.finalStatus) continue;

      entriesByKey[key] = {
        date: match[1],
        coupleName: match[2],
        score: Number(savedGame.score) || 0,
        guessesUsed: history.length,
        isRoundOver: Boolean(savedGame.isRoundOver),
        won: savedGame.finalStatus ? Boolean(savedGame.finalStatus.won) : null,
        updatedAt: ""
      };
    } catch (error) {
      // Ignore malformed localStorage items from older or unrelated data.
    }
  }

  Object.values(entriesByKey).forEach((entry) => {
    if (entry.date && entry.coupleName) {
      entriesByDate[entry.date] = entry;
    }
  });

  return state.couples
    .filter((couple) => couple.date <= state.currentToday)
    .map((couple) => {
      const savedEntry = entriesByDate[couple.date];
      return savedEntry || {
        date: couple.date,
        coupleName: couple.name,
        score: 0,
        guessesUsed: 0,
        isRoundOver: false,
        won: null,
        updatedAt: ""
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

function openArchive() {
  renderArchive();
  els.archiveDialog.classList.remove("hidden");
  els.archiveDialog.classList.add("flex");
  els.archiveCloseButton.focus();
}

function closeArchive() {
  els.archiveDialog.classList.add("hidden");
  els.archiveDialog.classList.remove("flex");
  els.archiveButton.focus();
}

function renderArchive() {
  const entries = getArchiveEntries();
  els.archiveList.innerHTML = "";

  if (!entries.length) {
    const empty = document.createElement("p");
    empty.className = "rounded border border-[#2a2a2a] bg-black px-4 py-5 text-center text-sm font-semibold text-[#b3b3b3]";
    empty.textContent = "Played games will show up here with their date and score.";
    els.archiveList.append(empty);
    return;
  }

  getArchiveMonths(entries).forEach((month) => {
    const section = document.createElement("section");
    section.className = "rounded border border-[#2a2a2a] bg-black p-3";

    const heading = document.createElement("h3");
    heading.className = "mb-3 text-base font-black text-[#f5c518]";
    heading.textContent = getMonthLabel(month.key);

    const grid = document.createElement("div");
    grid.className = "grid grid-cols-7 gap-1";

    ["S", "M", "T", "W", "T", "F", "S"].forEach((day) => {
      const label = document.createElement("div");
      label.className = "py-1 text-center text-xs font-black text-[#b3b3b3]";
      label.textContent = day;
      grid.append(label);
    });

    for (let i = 0; i < month.offset; i += 1) {
      const spacer = document.createElement("div");
      spacer.className = "min-h-20 rounded border border-transparent";
      grid.append(spacer);
    }

    month.entries.forEach((entry) => {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = getArchiveCardClass(entry);
      cell.title = `${formatArchiveDate(entry.date)} - ${entry.coupleName}`;
      cell.addEventListener("click", () => selectArchiveGame(entry.date));

      const day = document.createElement("span");
      day.className = "block text-sm font-black text-white";
      day.textContent = String(Number(entry.date.slice(8)));

      cell.append(day);

      if (entry.guessesUsed || entry.isRoundOver) {
        const score = document.createElement("span");
        score.className = "mt-2 block rounded bg-[#f5c518] px-1 py-0.5 text-center text-[0.65rem] font-black text-black";
        score.textContent = `${entry.score}`;
        cell.append(score);
      }

      grid.append(cell);
    });

    section.append(heading, grid);
    els.archiveList.append(section);
  });
}

function getArchiveCardClass(entry) {
  const baseClass = "min-h-20 rounded border bg-[#121212] p-1.5 text-left transition focus:outline-none focus:ring-4 focus:ring-[#f5c518]/30";

  if (entry.date === state.today) {
    return `${baseClass} border-[#f5c518]`;
  }

  if (entry.guessesUsed > 0 || entry.isRoundOver) {
    return `${baseClass} border-[#2a2a2a] hover:border-[#f5c518]/70 hover:bg-[#101010]`;
  }

  return `${baseClass} border-[#2a2a2a] border-dashed hover:border-[#f5c518]/70 hover:bg-[#101010]`;
}

function selectArchiveGame(date) {
  state.today = date;
  state.isArchiveRound = date !== state.currentToday;
  state.currentIndex = getDailyCoupleIndex(state.couples, state.today);
  renderRound();
  closeArchive();
}

function getArchiveMonths(entries) {
  const months = [];
  const monthMap = new Map();

  entries
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .forEach((entry) => {
      const key = entry.date.slice(0, 7);
      if (!monthMap.has(key)) {
        const month = {
          key,
          offset: parseDateKey(`${key}-01`).getUTCDay(),
          entries: []
        };
        monthMap.set(key, month);
        months.push(month);
      }

      monthMap.get(key).entries.push(entry);
    });

  return months.reverse();
}

function getMonthLabel(monthKey) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  }).format(parseDateKey(`${monthKey}-01`));
}

function formatArchiveDate(dateKey) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  }).format(parseDateKey(dateKey));
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

els.slider.addEventListener("input", updateGuessValue);
els.checkButton.addEventListener("click", checkGuess);
els.archiveButton.addEventListener("click", openArchive);
els.archiveCloseButton.addEventListener("click", closeArchive);
els.archiveDialog.addEventListener("click", (event) => {
  if (event.target === els.archiveDialog) closeArchive();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !els.archiveDialog.classList.contains("hidden")) {
    closeArchive();
  }
});

loadCouples();
