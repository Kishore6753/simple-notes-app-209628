import React, { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import {
  createNote,
  deleteNote,
  getApiBaseForDebug,
  listNotes,
  updateNote,
} from "./apiClient";

function isBlank(value) {
  return !value || !value.trim();
}

function nowIso() {
  return new Date().toISOString();
}

// PUBLIC_INTERFACE
function App() {
  const apiBase = useMemo(() => getApiBaseForDebug(), []);

  const [notes, setNotes] = useState([]);
  const [selectedId, setSelectedId] = useState(null);

  const [isLoadingList, setIsLoadingList] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [listError, setListError] = useState("");
  const [actionError, setActionError] = useState("");

  // Editor state (draft)
  const [draftTitle, setDraftTitle] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [draftUpdatedAt, setDraftUpdatedAt] = useState(null);

  const [mode, setMode] = useState("view"); // view | edit | create

  const titleInputRef = useRef(null);

  const selectedNote = useMemo(
    () => notes.find((n) => String(n.id) === String(selectedId)) || null,
    [notes, selectedId]
  );

  const hasUnsavedChanges = useMemo(() => {
    if (mode === "create") {
      return !isBlank(draftTitle) || !isBlank(draftContent);
    }
    if (mode !== "edit" || !selectedNote) return false;
    return (
      (draftTitle ?? "") !== (selectedNote.title ?? "") ||
      (draftContent ?? "") !== (selectedNote.content ?? "")
    );
  }, [mode, draftTitle, draftContent, selectedNote]);

  async function refreshList({ preserveSelection = true } = {}) {
    setIsLoadingList(true);
    setListError("");
    try {
      const data = await listNotes();
      const normalized = Array.isArray(data) ? data : [];
      setNotes(normalized);

      if (!preserveSelection) {
        setSelectedId(null);
        return;
      }

      // Keep selection if still present; otherwise select first note.
      if (selectedId != null) {
        const stillExists = normalized.some(
          (n) => String(n.id) === String(selectedId)
        );
        if (!stillExists) {
          setSelectedId(normalized[0]?.id ?? null);
        }
      } else {
        setSelectedId(normalized[0]?.id ?? null);
      }
    } catch (err) {
      setListError(err?.message || "Failed to load notes.");
    } finally {
      setIsLoadingList(false);
    }
  }

  // Initial load
  useEffect(() => {
    refreshList({ preserveSelection: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync draft when selection changes (unless mid-edit with unsaved changes)
  useEffect(() => {
    setActionError("");

    if (!selectedNote) {
      if (mode !== "create") {
        setMode("view");
      }
      setDraftTitle("");
      setDraftContent("");
      setDraftUpdatedAt(null);
      return;
    }

    if (mode === "edit" && hasUnsavedChanges) return;

    setMode("view");
    setDraftTitle(selectedNote.title ?? "");
    setDraftContent(selectedNote.content ?? "");
    setDraftUpdatedAt(selectedNote.updated_at || selectedNote.updatedAt || null);
  }, [selectedId, selectedNote, mode, hasUnsavedChanges]);

  useEffect(() => {
    if (mode === "edit" || mode === "create") {
      // Small delay to ensure element exists after render
      window.setTimeout(() => titleInputRef.current?.focus(), 0);
    }
  }, [mode]);

  function selectNote(id) {
    setActionError("");
    if (mode === "edit" && hasUnsavedChanges) {
      const ok = window.confirm(
        "You have unsaved changes. Discard them and switch notes?"
      );
      if (!ok) return;
    }
    setSelectedId(id);
  }

  function startCreate() {
    setActionError("");
    if (mode === "edit" && hasUnsavedChanges) {
      const ok = window.confirm(
        "You have unsaved changes. Discard them and create a new note?"
      );
      if (!ok) return;
    }
    setMode("create");
    setSelectedId(null);
    setDraftTitle("");
    setDraftContent("");
    setDraftUpdatedAt(null);
  }

  function startEdit() {
    setActionError("");
    if (!selectedNote) return;
    setMode("edit");
  }

  function cancelEditOrCreate() {
    setActionError("");
    if (mode === "create") {
      // Return to first note if any
      setMode("view");
      if (notes.length > 0) {
        setSelectedId(notes[0].id);
      }
      return;
    }
    if (!selectedNote) {
      setMode("view");
      return;
    }
    setMode("view");
    setDraftTitle(selectedNote.title ?? "");
    setDraftContent(selectedNote.content ?? "");
    setDraftUpdatedAt(selectedNote.updated_at || selectedNote.updatedAt || null);
  }

  async function handleSave() {
    setActionError("");

    if (isBlank(draftTitle)) {
      setActionError("Title is required.");
      titleInputRef.current?.focus();
      return;
    }

    setIsSaving(true);
    try {
      if (mode === "create") {
        const created = await createNote({
          title: draftTitle.trim(),
          content: draftContent ?? "",
        });

        await refreshList({ preserveSelection: true });

        // Prefer selecting created note if returned.
        if (created?.id != null) {
          setSelectedId(created.id);
        }
        setMode("view");
      } else if (mode === "edit" && selectedNote) {
        const updated = await updateNote(selectedNote.id, {
          title: draftTitle.trim(),
          content: draftContent ?? "",
        });

        // Optimistic update if API returns note; otherwise refresh list
        if (updated?.id != null) {
          setNotes((prev) =>
            prev.map((n) => (String(n.id) === String(updated.id) ? updated : n))
          );
          setDraftUpdatedAt(updated.updated_at || updated.updatedAt || nowIso());
        } else {
          await refreshList({ preserveSelection: true });
        }

        setMode("view");
      }
    } catch (err) {
      setActionError(err?.message || "Failed to save note.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    setActionError("");
    if (!selectedNote) return;

    const ok = window.confirm(
      `Delete "${selectedNote.title || "Untitled"}"? This cannot be undone.`
    );
    if (!ok) return;

    setIsDeleting(true);
    try {
      await deleteNote(selectedNote.id);
      await refreshList({ preserveSelection: false });
      setMode("view");
    } catch (err) {
      setActionError(err?.message || "Failed to delete note.");
    } finally {
      setIsDeleting(false);
    }
  }

  const sidebarContent = (() => {
    if (isLoadingList) {
      return (
        <div className="panelMessage" role="status" aria-live="polite">
          Loading notes…
        </div>
      );
    }

    if (listError) {
      return (
        <div className="panelMessage panelMessageError" role="alert">
          <div className="panelMessageTitle">Couldn’t load notes</div>
          <div className="panelMessageBody">{listError}</div>
          <button className="btn btnPrimary" onClick={() => refreshList()}>
            Retry
          </button>
        </div>
      );
    }

    if (!notes.length) {
      return (
        <div className="panelMessage" role="status" aria-live="polite">
          <div className="panelMessageTitle">No notes yet</div>
          <div className="panelMessageBody">
            Create your first note to get started.
          </div>
        </div>
      );
    }

    return (
      <ul className="notesList" aria-label="Notes list">
        {notes.map((note) => {
          const active = String(note.id) === String(selectedId);
          return (
            <li key={note.id} className="notesListItem">
              <button
                className={`noteRow ${active ? "noteRowActive" : ""}`}
                onClick={() => selectNote(note.id)}
                aria-current={active ? "true" : "false"}
              >
                <div className="noteRowTitle">{note.title || "Untitled"}</div>
                <div className="noteRowMeta">
                  {(note.updated_at || note.updatedAt || "").slice(0, 10) ||
                    "—"}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    );
  })();

  const editorHeaderTitle =
    mode === "create"
      ? "New note"
      : selectedNote
      ? "Note"
      : "Select a note";

  return (
    <div className="appShell">
      <header className="topbar">
        <div className="topbarLeft">
          <div className="brandMark" aria-hidden="true">
            SN
          </div>
          <div className="topbarTitleBlock">
            <h1 className="topbarTitle">Simple Notes</h1>
            <div className="topbarSubtitle">Retro UI • Light theme</div>
          </div>
        </div>

        <div className="topbarRight">
          <div className="topbarHint" title="API base URL">
            API: <span className="mono">{apiBase}</span>
          </div>
          <button className="btn btnSuccess" onClick={startCreate}>
            + Add note
          </button>
        </div>
      </header>

      <main className="mainGrid">
        <aside className="sidebar" aria-label="Notes sidebar">
          <div className="sidebarHeader">
            <div className="sidebarTitle">Notes</div>
            <button className="btn btnGhost" onClick={() => refreshList()}>
              Refresh
            </button>
          </div>
          <div className="sidebarBody">{sidebarContent}</div>
        </aside>

        <section className="editor" aria-label="Note editor">
          <div className="editorHeader">
            <div className="editorHeaderLeft">
              <div className="editorTitle">{editorHeaderTitle}</div>
              {mode !== "create" && selectedNote && (
                <div className="editorMeta">
                  Updated:{" "}
                  <span className="mono">
                    {draftUpdatedAt
                      ? new Date(draftUpdatedAt).toLocaleString()
                      : "—"}
                  </span>
                </div>
              )}
            </div>

            <div className="editorHeaderRight">
              {actionError ? (
                <div className="inlineError" role="alert">
                  {actionError}
                </div>
              ) : null}

              {mode === "view" ? (
                <>
                  <button
                    className="btn btnPrimary"
                    onClick={startEdit}
                    disabled={!selectedNote}
                  >
                    Edit
                  </button>
                  <button
                    className="btn btnDanger"
                    onClick={handleDelete}
                    disabled={!selectedNote || isDeleting}
                  >
                    {isDeleting ? "Deleting…" : "Delete"}
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="btn btnPrimary"
                    onClick={handleSave}
                    disabled={isSaving}
                  >
                    {isSaving ? "Saving…" : "Save"}
                  </button>
                  <button className="btn btnGhost" onClick={cancelEditOrCreate}>
                    Cancel
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="editorBody">
            {mode === "view" && !selectedNote ? (
              <div className="panelMessage" role="status" aria-live="polite">
                <div className="panelMessageTitle">Pick a note</div>
                <div className="panelMessageBody">
                  Select a note from the left, or create a new one.
                </div>
              </div>
            ) : (
              <div className="form">
                <label className="field">
                  <div className="labelRow">
                    <span className="labelText">Title</span>
                    {mode === "view" ? (
                      <span className="pill">Read-only</span>
                    ) : (
                      <span className="pill pillAccent">Editing</span>
                    )}
                  </div>
                  <input
                    ref={titleInputRef}
                    className="input"
                    value={draftTitle}
                    onChange={(e) => setDraftTitle(e.target.value)}
                    placeholder="e.g., Shopping list"
                    readOnly={mode === "view"}
                  />
                </label>

                <label className="field">
                  <div className="labelRow">
                    <span className="labelText">Content</span>
                    <span className="hintText">
                      {mode === "view"
                        ? "View"
                        : "Tip: Cmd/Ctrl+Enter to save"}
                    </span>
                  </div>
                  <textarea
                    className="textarea"
                    value={draftContent}
                    onChange={(e) => setDraftContent(e.target.value)}
                    placeholder="Write something delightful…"
                    readOnly={mode === "view"}
                    onKeyDown={(e) => {
                      if (
                        (mode === "edit" || mode === "create") &&
                        (e.ctrlKey || e.metaKey) &&
                        e.key === "Enter"
                      ) {
                        e.preventDefault();
                        handleSave();
                      }
                    }}
                  />
                </label>

                {mode === "view" && selectedNote ? (
                  <div className="preview">
                    <div className="previewTitle">Preview</div>
                    <div className="previewBody">
                      {isBlank(draftContent) ? (
                        <div className="muted">(No content)</div>
                      ) : (
                        <pre className="previewPre">{draftContent}</pre>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="footerText">
          Retro Notes • Accents{" "}
          <span className="swatch swatchPrimary" aria-hidden="true" /> #3b82f6{" "}
          <span className="swatch swatchSuccess" aria-hidden="true" /> #06b6d4
        </div>
      </footer>
    </div>
  );
}

export default App;
