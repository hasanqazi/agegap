const state = {
  couples: [],
  currentIndex: 0,
  score: 0,
  today: "",
  guessesLeft: 3,
  fullMinGap: 0,
  fullMaxGap: 30,
  minGap: 0,
  maxGap: 30,
  history: [],
  finalStatus: null,
  isRoundOver: false
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
  countdown: document.querySelector("#countdown")
};

const CENTRAL_TIME_ZONE = "America/Chicago";
let countdownTimer = null;

async function loadCouples() {
  try {
    const response = await fetch("data.json");
    if (!response.ok) throw new Error("Could not load data.json");
    const data = await response.json();
    state.couples = data.dailyCouples;
    state.today = getTodayKey();
    state.currentIndex = getDailyCoupleIndex(state.couples, state.today);
    renderRound();
    startCountdown();
  } catch (error) {
    addStatus("Could not load data.json. Start a local server and refresh the page.", false);
    els.checkButton.disabled = true;
    els.checkButton.classList.add("opacity-50");
  }
}

function getTodayKey() {
  const { year, month, day } = getCentralDateParts(new Date());
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
  const { year, month, day } = getCentralDateParts(new Date());
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

function updateCountdown() {
  const currentToday = getTodayKey();
  if (state.today && currentToday !== state.today) {
    state.today = currentToday;
    state.currentIndex = getDailyCoupleIndex(state.couples, state.today);
    renderRound();
  }

  const remaining = Math.max(0, getNextCentralMidnight() - new Date());
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

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

els.slider.addEventListener("input", updateGuessValue);
els.checkButton.addEventListener("click", checkGuess);

loadCouples();
