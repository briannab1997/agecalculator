let map;

document.getElementById("darkToggle").onclick = () => {
  document.body.classList.toggle("dark");
  localStorage.setItem("darkMode", document.body.classList.contains("dark"));
};
if (localStorage.getItem("darkMode") === "true") {
  document.body.classList.add("dark");
}

let autocompleteOpen = false;

document.getElementById("city").addEventListener("input", async function () {
  const q = this.value.trim();
  const list = document.getElementById("autocomplete-list");
  list.innerHTML = "";
  if (q.length < 2) {
    list.style.display = "none";
    autocompleteOpen = false;
    return;
  }

  const url =
    "https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&q=" +
    encodeURIComponent(q);
  const res = await fetch(url);
  let data = await res.json();

  const unique = new Map();
  data.forEach((p) => {
    const city =
      p.address.city ||
      p.address.town ||
      p.address.village ||
      p.address.hamlet ||
      "";
    const state = p.address.state || "";
    const key = city + "|" + state;
    if (city && !unique.has(key)) {
      unique.set(key, p);
    }
  });

  data = [...unique.values()];

  if (!data.length) {
    list.style.display = "none";
    autocompleteOpen = false;
    return;
  }

  list.style.display = "block";
  autocompleteOpen = true;

  data.slice(0, 5).forEach((place) => {
    const item = document.createElement("div");
    item.classList.add("autocomplete-item");
    item.textContent =
      (place.address.city ||
        place.address.town ||
        place.address.village ||
        place.address.hamlet) +
      ", " +
      (place.address.state || "") +
      ", " +
      place.address.country;

    item.onclick = () => {
      document.getElementById("city").value = item.textContent;
      list.style.display = "none";
      list.style.opacity = "1";
      list.style.pointerEvents = "auto";
      autocompleteOpen = false;
      document.getElementById("city").blur();
    };
    list.appendChild(item);
  });
});

document.addEventListener("click", function (e) {
  if (
    !e.target.closest("#autocomplete-list") &&
    !e.target.closest("#city") &&
    autocompleteOpen
  ) {
    document.getElementById("autocomplete-list").style.display = "none";
    autocompleteOpen = false;
  }
});

async function calculate() {
  const dob = new Date(document.getElementById("dob").value);
  const cityInput = document.getElementById("city").value.trim();
  if (!dob || !cityInput) return;

  const diff = new Date() - dob;
  const ageY = Math.floor(diff / 31556952000);
  const ageM = Math.floor((diff % 31556952000) / 2629746000);
  const ageD = Math.floor((diff % 2629746000) / 86400000);
  const sign = zodiacSign(dob.getDate(), dob.getMonth() + 1);

  const place = await lookupPlace(cityInput);
  if (!place) {
    document.getElementById("result").innerHTML =
      "<p>City not found. Please select a suggestion.</p>";
    return;
  }

  const { display, lat, lon, country, city } = place;

  const population = await getPopulation(city, country);
  const wikiTitle = await getWikiTitleByCoords(lat, lon);
  const fact = await fetchWikiFact(wikiTitle);
  const photo = await fetchCityPhoto(wikiTitle);

  document.getElementById("result").innerHTML = `
    <p><strong>Age:</strong> ${ageY} years, ${ageM} months, ${ageD} days</p>
    <p><strong>Zodiac:</strong> ${sign}</p>
    <h3>${display}</h3>
    ${
      population
        ? `<p><strong>Population:</strong> ${population.toLocaleString()}</p>`
        : ""
    }
    <p><strong>Latitude:</strong> ${lat}</p>
    <p><strong>Longitude:</strong> ${lon}</p>
    <p><strong>Fact:</strong> ${fact}</p>
    ${photo ? `<img src="${photo}" class="city-photo" />` : ""}
  `;

  document.getElementById("shareBtn").style.display = "block";

  showMap(lat, lon, display);
}

function zodiacSign(day, month) {
  const s = [
    ["Capricorn", 20],
    ["Aquarius", 19],
    ["Pisces", 21],
    ["Aries", 20],
    ["Taurus", 21],
    ["Gemini", 21],
    ["Cancer", 23],
    ["Leo", 23],
    ["Virgo", 23],
    ["Libra", 23],
    ["Scorpio", 22],
    ["Sagittarius", 22],
    ["Capricorn", 31],
  ];
  return day < s[month - 1][1] ? s[month - 1][0] : s[month][0];
}

async function lookupPlace(q) {
  const url =
    "https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=5&q=" +
    encodeURIComponent(q);
  const res = await fetch(url);
  const d = await res.json();
  if (!d.length) return null;

  const p = d[0];
  return {
    display: p.display_name,
    country: p.address?.country || "",
    city: p.address?.city || p.address?.town || p.address?.village || "",
    lat: p.lat,
    lon: p.lon,
  };
}

async function getPopulation(city, country) {
  if (!city || !country) return null;
  const url =
    "https://geodb-free-service.wirefreethought.com/v1/geo/cities?namePrefix=" +
    encodeURIComponent(city) +
    "&countryIds=" +
    encodeURIComponent(country) +
    "&limit=1&sort=-population";
  try {
    const r = await fetch(url);
    const d = await r.json();
    if (!d.data.length) return null;
    return d.data[0].population || null;
  } catch {
    return null;
  }
}

async function getWikiTitleByCoords(lat, lon) {
  const url =
    "https://en.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=" +
    lat +
    "%7C" +
    lon +
    "&gsradius=10000&gslimit=1&format=json&origin=*";
  const r = await fetch(url);
  const d = await r.json();
  if (d.query.geosearch.length) {
    return d.query.geosearch[0].title;
  }
  return null;
}

async function fetchWikiFact(title) {
  if (!title) return "No fact available.";
  const url =
    "https://en.wikipedia.org/api/rest_v1/page/summary/" +
    encodeURIComponent(title);
  try {
    const r = await fetch(url);
    const d = await r.json();
    return d.extract || "No fact available.";
  } catch {
    return "No fact available.";
  }
}

async function fetchCityPhoto(title) {
  if (!title) return null;
  const url =
    "https://en.wikipedia.org/api/rest_v1/page/summary/" +
    encodeURIComponent(title);
  try {
    const r = await fetch(url);
    const d = await r.json();
    return d.thumbnail?.source || null;
  } catch {
    return null;
  }
}

function showMap(lat, lon, label) {
  if (!map) {
    map = L.map("map").setView([lat, lon], 10);
  } else {
    map.setView([lat, lon], 10);
  }
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
  }).addTo(map);
  L.marker([lat, lon]).addTo(map).bindPopup(label).openPopup();
}

async function shareResults() {
  const container = document.querySelector(".container");
  const result = document.getElementById("result");
  const mapBox = document.getElementById("map");

  const wasDark = document.body.classList.contains("dark");
  const originalBG = container.style.background;
  const originalColor = container.style.color;

  document.body.classList.remove("dark");

  container.style.background = "white";
  container.style.color = "black";
  result.style.opacity = "1";
  mapBox.style.opacity = "1";

  await new Promise((resolve) => setTimeout(resolve, 150));

  html2canvas(container, {
    useCORS: true,
    backgroundColor: "white",
    scale: 2,
  }).then((canvas) => {
    const link = document.createElement("a");
    link.download = "zodiac_results.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  });

  if (wasDark) document.body.classList.add("dark");
  container.style.background = originalBG;
  container.style.color = originalColor;
}
