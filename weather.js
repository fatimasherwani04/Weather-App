// ============================================================
//  AETHER WEATHER — weather.js
//  API: OpenWeatherMap (free tier)
// ============================================================

const API_KEY = "24f0617ced3bd6eb2d5da2a810c2d2ed";
const BASE    = "https://api.openweathermap.org/data/2.5";
const GEO     = "https://api.openweathermap.org/geo/1.0";

// ── Recent Searches (localStorage) ──────────────────────────
const MAX_RECENT = 6;

function getRecent() {
  try { return JSON.parse(localStorage.getItem("aether_recent") || "[]"); }
  catch { return []; }
}
function saveRecent(city) {
  let list = getRecent().filter(c => c.toLowerCase() !== city.toLowerCase());
  list.unshift(city);
  if (list.length > MAX_RECENT) list = list.slice(0, MAX_RECENT);
  localStorage.setItem("aether_recent", JSON.stringify(list));
  renderRecent();
}
function renderRecent() {
  const list = getRecent();
  const el = document.getElementById("recentSearches");
  if (!list.length) { el.innerHTML = ""; return; }
  el.innerHTML = list.map(c =>
    `<div class="recent-tag" onclick="fetchWeather('${c}')">
      <span class="tag-icon">⏱</span>${c}
    </div>`
  ).join("");
}

// ── UI State helpers ─────────────────────────────────────────
function showLoading()  {
  hide("emptyState"); hide("errorState"); hide("weatherMain");
  show("loadingState");
}
function showError(msg) {
  hide("loadingState"); hide("weatherMain");
  document.getElementById("errorMsg").textContent = msg;
  show("errorState");
  setTimeout(() => hide("errorState"), 4000);
}
function showWeather() {
  hide("loadingState"); hide("errorState"); hide("emptyState");
  show("weatherMain");
}
function show(id) { document.getElementById(id)?.classList.remove("hidden"); }
function hide(id) { document.getElementById(id)?.classList.add("hidden"); }

// ── Search ───────────────────────────────────────────────────
function searchCity() {
  const val = document.getElementById("cityInput").value.trim();
  if (!val) return;
  fetchWeather(val);
}

document.getElementById("cityInput").addEventListener("keydown", e => {
  if (e.key === "Enter") searchCity();
});

// ── Geolocation ──────────────────────────────────────────────
function getLocation() {
  if (!navigator.geolocation) {
    showError("Geolocation is not supported by your browser.");
    return;
  }
  showLoading();
  navigator.geolocation.getCurrentPosition(
    pos => fetchWeatherByCoords(pos.coords.latitude, pos.coords.longitude),
    ()  => showError("Location access denied. Please search manually.")
  );
}

// ── Fetch by city name ───────────────────────────────────────
async function fetchWeather(city) {
  showLoading();
  try {
    // Get coordinates first via Geocoding API
    const geoRes = await fetch(`${GEO}/direct?q=${encodeURIComponent(city)}&limit=1&appid=${API_KEY}`);
    const geoData = await geoRes.json();
    if (!geoData.length) { showError(`"${city}" not found. Try a different spelling.`); return; }
    const { lat, lon, name, country } = geoData[0];
    await fetchWeatherByCoords(lat, lon, name, country);
    saveRecent(name);
    document.getElementById("cityInput").value = "";
  } catch (err) {
    showError("Network error. Please check your connection.");
    console.error(err);
  }
}

// ── Fetch by coordinates ─────────────────────────────────────
async function fetchWeatherByCoords(lat, lon, nameOverride, countryOverride) {
  try {
    const [currentRes, forecastRes] = await Promise.all([
      fetch(`${BASE}/weather?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric`),
      fetch(`${BASE}/forecast?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric`)
    ]);
    const current  = await currentRes.json();
    const forecast = await forecastRes.json();

    if (current.cod !== 200) { showError(current.message || "Could not load weather."); return; }

    renderCurrent(current, nameOverride, countryOverride);
    renderHourly(forecast);
    renderDaily(forecast);
    showWeather();

    if (!nameOverride) saveRecent(current.name);
  } catch (err) {
    showError("Failed to load weather data.");
    console.error(err);
  }
}

// ── Render Current ───────────────────────────────────────────
function renderCurrent(data, nameOverride, countryOverride) {
  setText("cityName",    nameOverride || data.name);
  setText("countryName", getCountryName(countryOverride || data.sys.country));
  setText("currentDate", formatDate(new Date()));
  setText("tempMain",    Math.round(data.main.temp));
  setText("weatherDesc", data.weather[0].description);
  setText("humidity",    `${data.main.humidity}%`);
  setText("wind",        `${Math.round(data.wind.speed * 3.6)} km/h`);
  setText("visibility",  data.visibility ? `${(data.visibility/1000).toFixed(1)} km` : "N/A");
  setText("feelsLike",   `${Math.round(data.main.feels_like)}°C`);
  setText("pressure",    `${data.main.pressure} hPa`);
  setText("clouds",      `${data.clouds.all}%`);
  setText("sunrise",     formatTime(data.sys.sunrise));
  setText("sunset",      formatTime(data.sys.sunset));
  document.getElementById("weatherIconBig").textContent = getWeatherEmoji(data.weather[0].id, data.weather[0].icon);
}

// ── Render Hourly ─────────────────────────────────────────────
function renderHourly(forecast) {
  const container = document.getElementById("hourlyScroll");
  const items = forecast.list.slice(0, 12); // next 36 hours (3h intervals)
  const now = new Date();

  container.innerHTML = items.map((item, i) => {
    const time = new Date(item.dt * 1000);
    const isNow = i === 0;
    const rain = item.pop ? `🌧 ${Math.round(item.pop * 100)}%` : "";
    return `
      <div class="hourly-card ${isNow ? "now" : ""}">
        <div class="hourly-time">${isNow ? "Now" : formatHour(time)}</div>
        <div class="hourly-icon">${getWeatherEmoji(item.weather[0].id, item.weather[0].icon)}</div>
        <div class="hourly-temp">${Math.round(item.main.temp)}°</div>
        ${rain ? `<div class="hourly-rain">${rain}</div>` : ""}
      </div>`;
  }).join("");
}

// ── Render 5-Day ──────────────────────────────────────────────
function renderDaily(forecast) {
  const container = document.getElementById("dailyGrid");

  // Group by day
  const days = {};
  forecast.list.forEach(item => {
    const date = new Date(item.dt * 1000);
    const key  = date.toDateString();
    if (!days[key]) days[key] = { temps: [], icons: [], descs: [], date };
    days[key].temps.push(item.main.temp);
    days[key].icons.push({ id: item.weather[0].id, icon: item.weather[0].icon });
    days[key].descs.push(item.weather[0].description);
  });

  const dayList = Object.values(days).slice(0, 5);

  container.innerHTML = dayList.map((day, i) => {
    const high = Math.round(Math.max(...day.temps));
    const low  = Math.round(Math.min(...day.temps));
    const midIcon = day.icons[Math.floor(day.icons.length / 2)];
    const desc = day.descs[Math.floor(day.descs.length / 2)];
    const dayName = i === 0 ? "Today" : day.date.toLocaleDateString("en", { weekday: "short" });
    return `
      <div class="daily-card">
        <div class="daily-day">${dayName}</div>
        <div class="daily-icon">${getWeatherEmoji(midIcon.id, midIcon.icon)}</div>
        <div class="daily-temps">
          <div class="daily-high">${high}°</div>
          <div class="daily-low">${low}°</div>
        </div>
        <div class="daily-desc">${desc}</div>
      </div>`;
  }).join("");
}

// ── Helpers ───────────────────────────────────────────────────
function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function formatDate(d) {
  return d.toLocaleDateString("en", { weekday:"long", day:"numeric", month:"long", year:"numeric" });
}
function formatTime(unix) {
  return new Date(unix * 1000).toLocaleTimeString("en", { hour:"2-digit", minute:"2-digit" });
}
function formatHour(d) {
  return d.toLocaleTimeString("en", { hour:"2-digit", minute:"2-digit", hour12:true });
}

function getCountryName(code) {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) || code;
  } catch { return code; }
}

// Weather ID → emoji mapping
function getWeatherEmoji(id, icon) {
  const isDay = icon && icon.endsWith("d");
  if (id >= 200 && id < 300) return "⛈️";
  if (id >= 300 && id < 400) return "🌦️";
  if (id >= 500 && id < 510) return id === 511 ? "🌨️" : "🌧️";
  if (id >= 510 && id < 600) return "🌧️";
  if (id >= 600 && id < 700) return id === 611 || id === 612 ? "🌨️" : "❄️";
  if (id === 701 || id === 741) return "🌫️";
  if (id >= 700 && id < 800) return "🌪️";
  if (id === 800) return isDay ? "☀️" : "🌙";
  if (id === 801) return isDay ? "🌤️" : "🌙";
  if (id === 802) return "⛅";
  if (id >= 803) return "☁️";
  return "🌡️";
}

// ── Init ─────────────────────────────────────────────────────
renderRecent();