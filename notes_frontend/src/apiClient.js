const DEFAULT_DEV_API_BASE = "http://localhost:3001";

/**
 * Returns the configured API base URL.
 * Uses REACT_APP_API_BASE if present; otherwise uses a sensible local dev default.
 */
function getApiBaseUrl() {
  const raw = process.env.REACT_APP_API_BASE;
  const base = (raw && raw.trim()) ? raw.trim() : DEFAULT_DEV_API_BASE;
  return base.replace(/\/+$/, "");
}

/**
 * Minimal JSON fetch wrapper with helpful error messages.
 * @param {string} path
 * @param {RequestInit} options
 */
async function requestJson(path, options = {}) {
  const base = getApiBaseUrl();
  const url = `${base}${path.startsWith("/") ? "" : "/"}${path}`;

  let response;
  try {
    response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });
  } catch (err) {
    // Network errors (CORS, DNS, server down)
    throw new Error(`Network error while calling API (${url}): ${err?.message || String(err)}`);
  }

  const contentType = response.headers.get("content-type") || "";
  const hasJson = contentType.includes("application/json");

  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    if (hasJson) {
      try {
        const body = await response.json();
        detail = body?.detail || body?.message || JSON.stringify(body);
      } catch {
        // ignore
      }
    } else {
      try {
        const text = await response.text();
        if (text) detail = text;
      } catch {
        // ignore
      }
    }
    throw new Error(`API error: ${detail}`);
  }

  if (response.status === 204) return null;
  if (hasJson) return response.json();
  return response.text();
}

// PUBLIC_INTERFACE
export async function listNotes() {
  /** List all notes. GET /notes */
  return requestJson("/notes", { method: "GET" });
}

// PUBLIC_INTERFACE
export async function getNote(id) {
  /** Fetch a single note. GET /notes/{id} */
  return requestJson(`/notes/${encodeURIComponent(id)}`, { method: "GET" });
}

// PUBLIC_INTERFACE
export async function createNote(payload) {
  /** Create a note. POST /notes */
  return requestJson("/notes", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// PUBLIC_INTERFACE
export async function updateNote(id, payload) {
  /** Update a note. PUT /notes/{id} */
  return requestJson(`/notes/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

// PUBLIC_INTERFACE
export async function deleteNote(id) {
  /** Delete a note. DELETE /notes/{id} */
  return requestJson(`/notes/${encodeURIComponent(id)}`, { method: "DELETE" });
}

// PUBLIC_INTERFACE
export function getApiBaseForDebug() {
  /** Exposes the resolved base URL for debugging screens. */
  return getApiBaseUrl();
}
