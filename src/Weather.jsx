import { useEffect, useRef, useState } from "react";
import "./Weather.css";

const weatherDescriptions = {
  0: "Giedra", 1: "Daugiausia giedra", 2: "Debesuota su pragiedruliais",
  3: "Apsiniaukę", 45: "Rūkas", 48: "Rūkas su šerkšnu",
  51: "Silpna dulksna", 53: "Dulksna", 55: "Stipri dulksna",
  56: "Šąlanti dulksna", 57: "Stipri šąlanti dulksna",
  61: "Silpnas lietus", 63: "Lietus", 65: "Stiprus lietus",
  66: "Šąlantis lietus", 67: "Stiprus šąlantis lietus",
  71: "Silpnas sniegas", 73: "Sniegas", 75: "Stiprus sniegas",
  77: "Sniego grūdeliai", 80: "Silpna liūtis", 81: "Liūtis",
  82: "Stipri liūtis", 85: "Trumpas snygis", 86: "Stiprus snygis",
  95: "Perkūnija", 96: "Perkūnija su kruša", 99: "Perkūnija su stipria kruša",
};

function Weather() {
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [place, setPlace] = useState({ name: "Vilnius", country: "Lietuva", latitude: 54.6872, longitude: 25.2797 });
  const searchController = useRef(null);
  const [weather, setWeather] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => () => {
    searchController.current?.abort();
    searchController.current = null;
  }, []);

  async function searchPlaces(event) {
    event.preventDefault();
    searchController.current?.abort();
    const controller = new AbortController();
    searchController.current = controller;
    setSearching(true);
    setSearchError("");
    setPlaces([]);
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const params = new URLSearchParams({ name: query.trim(), language: "lt", count: "8" });
      const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params}`, { signal: controller.signal });
      if (!response.ok) throw new Error();
      const data = await response.json();
      const results = (data.results ?? []).filter((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude));
      if (searchController.current !== controller) return;
      setPlaces(results);
      if (!results.length) setSearchError("Vietovė nerasta. Įveskite miesto pavadinimą, pvz., Vilnius, Lietuva.");
    } catch {
      if (searchController.current === controller) setSearchError("Paieška nepavyko. Bandykite dar kartą.");
    } finally {
      clearTimeout(timeout);
      if (searchController.current === controller) setSearching(false);
    }
  }

  function selectPlace(nextPlace) {
    setPlace(nextPlace);
    setWeather(null);
    setError("");
    setLoading(true);
    setPlaces([]);
  }

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let active = true;
    const params = new URLSearchParams({
      latitude: String(place.latitude),
      longitude: String(place.longitude),
      current: "temperature_2m,apparent_temperature,weather_code,wind_speed_10m",
      daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
      forecast_days: "5",
      timezone: "auto",
      wind_speed_unit: "ms",
    });

    async function loadWeather() {
      try {
        const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Nepavyko gauti orų.");
        const data = await response.json();
        const current = data.current;
        if (!current || ![current.temperature_2m, current.apparent_temperature,
          current.wind_speed_10m, current.weather_code].every(Number.isFinite)
          || typeof current.time !== "string") {
          throw new Error("Netinkami orų duomenys.");
        }
        const daily = data.daily;
        const fields = ["weather_code", "temperature_2m_max", "temperature_2m_min", "precipitation_probability_max"];
        if (!Array.isArray(daily?.time) || daily.time.length !== 5
          || !fields.every((field) => Array.isArray(daily[field]) && daily[field].length === 5)) {
          throw new Error("Netinkama prognozė.");
        }
        if (active) setWeather({ ...current, daily, timezone: data.timezone });
      } catch {
        if (active) setError("Nepavyko įkelti orų. Bandykite dar kartą.");
      } finally {
        clearTimeout(timeout);
        if (active) setLoading(false);
      }
    }

    loadWeather();
    return () => {
      active = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [attempt, place]);

  function retry() {
    setError("");
    setLoading(true);
    setAttempt((value) => value + 1);
  }

  return (
    <section className="weather-card" aria-labelledby="weather-title">
      <header className="weather-card__header">
        <h2 id="weather-title">Orai</h2>
        <span>{place.country}</span>
      </header>
      <form className="weather-card__search" onSubmit={searchPlaces}>
        <label htmlFor="weather-location">Miestas arba šalis</label>
        <div>
          <input id="weather-location" value={query} onChange={(event) => setQuery(event.target.value)}
            placeholder="Pvz., Vilnius, Lietuva" minLength={2} maxLength={120} required />
          <button type="submit" disabled={searching || query.trim().length < 2}>Ieškoti</button>
        </div>
        <p>Prognozė rodoma pasirinktai vietovei.</p>
      </form>
      {searching && <p role="status">Ieškoma vietovės...</p>}
      {searchError && <p role="alert">{searchError}</p>}
      {places.length > 0 && (
        <ul className="weather-card__places" aria-label="Pasirinkite vietovę">
          {places.map((item) => <li key={item.id}>
            <button type="button" onClick={() => selectPlace(item)}>
              {[item.name, item.admin1, item.country].filter(Boolean).join(", ")}
            </button>
          </li>)}
        </ul>
      )}
      <h3 className="weather-card__location">{place.name}{place.country ? `, ${place.country}` : ""}</h3>
      {loading && <p role="status">Įkeliami orai...</p>}
      {error && (
        <div>
          <p role="alert">{error}</p>
          <button type="button" onClick={retry}>Bandyti dar kartą</button>
        </div>
      )}
      {!loading && !error && weather && (
        <>
          <p className="weather-card__temperature">{Math.round(weather.temperature_2m)} °C</p>
          <p className="weather-card__description">
            {weatherDescriptions[weather.weather_code] ?? "Orų sąlygos nežinomos"}
          </p>
          <dl className="weather-card__details">
            <div><dt>Jaučiama</dt><dd>{Math.round(weather.apparent_temperature)} °C</dd></div>
            <div><dt>Vėjas</dt><dd>{weather.wind_speed_10m.toLocaleString("lt-LT")} m/s</dd></div>
          </dl>
          <p className="weather-card__time">
            Duomenys: <time dateTime={weather.time}>{weather.time.replace("T", " ")}</time>
            {" "}(vietos laiku, {weather.timezone})
          </p>
          <h3 className="weather-card__forecast-title">5 dienų prognozė</h3>
          <ul className="weather-card__forecast">
            {weather.daily.time.map((date, index) => (
              <li key={date}>
                <time dateTime={date}>{new Date(`${date}T12:00:00`).toLocaleDateString("lt-LT", { weekday: "short", month: "2-digit", day: "2-digit" })}</time>
                <span>{weatherDescriptions[weather.daily.weather_code[index]] ?? "Orų sąlygos nežinomos"}</span>
                <strong>{Number.isFinite(weather.daily.temperature_2m_min[index]) ? Math.round(weather.daily.temperature_2m_min[index]) : "–"} / {Number.isFinite(weather.daily.temperature_2m_max[index]) ? Math.round(weather.daily.temperature_2m_max[index]) : "–"} °C</strong>
                <small>Kritulių tikimybė: {weather.daily.precipitation_probability_max[index] ?? "–"} %</small>
              </li>
            ))}
          </ul>
        </>
      )}
      <a className="weather-card__source" href="https://open-meteo.com/" target="_blank" rel="noreferrer">
        Orų duomenys: Open-Meteo
      </a>
    </section>
  );
}

export default Weather;
