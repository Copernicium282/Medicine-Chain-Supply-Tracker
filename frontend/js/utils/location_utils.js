// ==========================================
// SHARED LOCATION UTILITIES (STRICT MODE)
// Uses: Open Location Code (Plus Codes) + Nominatim + Leaflet
// ==========================================

/**
 * Resolves a location query to coordinates.
 * Supports:
 * 1. Direct Coordinates ("12.34, 56.78")
 * 2. Full Plus Codes ("8FWH+7G")
 * 3. Short Plus Codes + Context ("WJ62+H8 Bengaluru")
 *
 * @param {string} query - The input string.
 * @returns {Promise<{lat: number, lon: number}|null>} Result object or null if failed.
 */
async function resolveLocation(query) {
  if (!query) return null;
  query = query.trim();

  // 0. Coordinate Passthrough
  // If the input is already a raw lat/long pair (e.g. from a GPS click),
  // we skip the API lookup entirely to save bandwidth and ensure accuracy.
  const coordMatch = query.match(/^(-?\d+(\.\d+)?),\s*(-?\d+(\.\d+)?)$/);
  if (coordMatch) {
    console.log("Resolved via Coordinates:", query);
    return { lat: parseFloat(coordMatch[1]), lon: parseFloat(coordMatch[3]) };
  }

  // 1. Plus Code Logic
  // We prefer Plus Codes (Open Location Code) because they provide a short,
  // offline-decodable identifier for locations even in areas without street addresses.
  try {
    const result = await plusCodeToLatLng(query);
    console.log(
      `Resolved via Plus Code (${result.fullCode}):`,
      result.lat,
      result.lng
    );
    return { lat: result.lat, lon: result.lng };
  } catch (e) {
    console.warn("Location resolution failed:", e.message);
    return null;
  }
}

/**
 * Validates a location for Dashboards.
 */
async function validateAddress(query) {
  const res = await resolveLocation(query);
  return res !== null;
}

// ==========================================
// USER PROVIDED CORE LOGIC
// ==========================================

async function plusCodeToLatLng(input) {
  input = input.trim();

  // Case 1: FULL Plus Code (global, no context needed)
  // Check the first token. If it's a full code, we don't need context.
  const firstToken = input.split(" ")[0];
  if (
    OpenLocationCode.isValid(firstToken) &&
    OpenLocationCode.isFull(firstToken)
  ) {
    const decoded = OpenLocationCode.decode(firstToken);
    return {
      lat: (decoded.latitudeLo + decoded.latitudeHi) / 2,
      lng: (decoded.longitudeLo + decoded.longitudeHi) / 2,
      fullCode: firstToken,
    };
  }

  // Case 2: SHORT Plus Code (needs locality)
  // Split by space. First part SHOULD be the code.
  const [shortCode, ...placeParts] = input.split(" ");

  // Basic validation before network call
  if (!OpenLocationCode.isValid(shortCode)) {
    throw new Error("Invalid Code format (not a Plus Code)");
  }
  if (!OpenLocationCode.isShort(shortCode)) {
    // It's valid but not short, and not full? (Maybe 3 chars? Invalid length?)
    // Or maybe it IS full but failed the first check?
    // OpenLocationCode.isValid handles simple regex checks.
    // If it's valid and NOT full, it MUST be short.
    // So this check is essentially "Is it a valid short code?"
  }

  const place = placeParts.join(" ").trim();
  if (!place) {
    throw new Error("Short Plus Code requires a reference place (e.g. 'City')");
  }

  // Geocode reference place (global)
  console.log(`Fetching reference for '${place}'...`);
  const ref = await geocodePlace(place);

  // Expand short code → full code
  const fullCode = OpenLocationCode.recoverNearest(shortCode, ref.lat, ref.lng);

  const decoded = OpenLocationCode.decode(fullCode);

  return {
    lat: (decoded.latitudeLo + decoded.latitudeHi) / 2,
    lng: (decoded.longitudeLo + decoded.longitudeHi) / 2,
    fullCode,
  };
}

async function geocodePlace(place) {
  const url =
    "https://nominatim.openstreetmap.org/search?" +
    new URLSearchParams({
      q: place,
      format: "json",
      limit: 1,
    });

  /* 
     Note: Browsers might block setting 'User-Agent' header in fetch requests.
     Nominatim requires it, but usually accepts the browser's default UA + Referer.
     If CORS issues occur, we might need a proxy or rely on default behavior.
  */
  const res = await fetch(url);

  if (!res.ok) throw new Error("Network error contacting geocode service");

  const data = await res.json();

  if (!data || !data.length) {
    throw new Error(`Reference place not found: ${place}`);
  }

  return {
    lat: parseFloat(data[0].lat),
    lng: parseFloat(data[0].lon),
  };
}

/**
 * Gets the device's current location and converts it to a Full Plus Code.
 * Returns a Promise that resolves to the Plus Code string.
 */
function getDeviceLocationAsPlusCode() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject("Geolocation is not supported by your browser.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        // Encode to Plus Code (default length is usually 10, sufficient for high precision)
        const code = OpenLocationCode.encode(lat, lon);
        console.log(`Device Location: ${lat},${lon} -> ${code}`);
        resolve(code);
      },
      (error) => {
        let msg = "Unable to retrieve your location.";
        if (error.code === 1) msg = "Location permission denied.";
        else if (error.code === 2) msg = "Location unavailable.";
        else if (error.code === 3) msg = "Location request timed out.";
        reject(msg);
      }
    );
  });
}
