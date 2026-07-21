import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import PageLayout from "../components/PageLayout";
import { auth } from "../firebase";
import {
  listenToProjects, createProject, deleteProject,
  listenToProjectDocuments, createProjectDocument, updateProjectDocument, deleteProjectDocument,
  listenToProjectDocCategories, createProjectDocCategory, deleteProjectDocCategory,
  listenToProjectProgressEntries, createProjectProgressEntry, deleteProjectProgressEntry,
  listenToProjectDailyLogs,
  listenToProjectTodos, createProjectTodo, updateProjectTodo, deleteProjectTodo,
  PRIORITY_LEVELS, getPriorityStyle, sortTodos,
} from "../lib/projects";
import { awardXp, revokeXp, XP, xpId } from "../lib/xp";

const FONTS = [
  { label: "Serif",  value: "Georgia, serif" },
  { label: "Sans",   value: "Arial, sans-serif" },
  { label: "Mono",   value: "'Courier New', monospace" },
  { label: "Pixel",  value: "'Press Start 2P', cursive" },
];
const FONT_SIZES = ["10","11","12","14","16","18","20","24","28","32","36","48","64"];
const EMOJIS = ["📄","📝","📋","🗒️","📖","📗","📘","📙","📕","🗂️","💡","🎯","🚀","⭐","🔥","📁","🗃️","📦"];

// ── Toolbar helpers ────────────────────────────────────────────────────

function TBtn({ onPointerDown, active, title, children, wide }) {
  return (
    <button
      onPointerDown={e => { e.preventDefault(); onPointerDown(); }}
      title={title}
      className={`py-1 rounded text-xs transition h-7 flex items-center justify-center select-none font-medium flex-shrink-0 ${wide ? "px-2" : "px-1.5 min-w-[28px]"} ${
        active
          ? "bg-brand-800 dark:bg-white text-white dark:text-brand-900 ring-2 ring-brand-500"
          : "text-brand-700 dark:text-brand-200 hover:bg-brand-100 dark:hover:bg-brand-700"
      }`}
    >
      {children}
    </button>
  );
}
function TSep() {
  return <div className="w-px h-6 bg-brand-200 dark:bg-brand-600 mx-1 flex-shrink-0" />;
}

// ── Wrap selection in a tag ────────────────────────────────────────────

function wrapSelection(tag, style = {}) {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return;
  const range = sel.getRangeAt(0);
  const el = document.createElement(tag);
  Object.assign(el.style, style);
  try { range.surroundContents(el); }
  catch {
    const frag = range.extractContents();
    el.appendChild(frag);
    range.insertNode(el);
  }
  sel.removeAllRanges();
  const newRange = document.createRange();
  newRange.selectNodeContents(el);
  sel.addRange(newRange);
}

// Toggle a block-level element for the current selection / cursor line
// Get the block-level ancestor that is a direct child of editorEl
function getBlockNode(editorEl) {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return null;
  let node = sel.getRangeAt(0).startContainer;
  // If it's a text node, go to its parent
  if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;
  // Walk up until direct child of editor
  while (node && node.parentNode !== editorEl) node = node.parentNode;
  return node || null;
}

// Get the inner HTML of a node safely — handles text nodes and elements
function getNodeHTML(node) {
  if (!node) return "<br>";
  if (node.nodeType === Node.TEXT_NODE) return node.textContent || "<br>";
  return node.innerHTML || "<br>";
}

function toggleBlock(editorEl, tag) {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return;
  let node = getBlockNode(editorEl);
  if (!node) return;

  // If it's a raw text node sitting in the editor, wrap it in a p first
  if (node.nodeType === Node.TEXT_NODE) {
    const p = document.createElement("p");
    p.textContent = node.textContent;
    editorEl.replaceChild(p, node);
    node = p;
  }

  if (node.nodeName.toLowerCase() === tag) {
    // Already this tag — convert back to p
    const p = document.createElement("p");
    p.innerHTML = node.innerHTML || "<br>";
    editorEl.replaceChild(p, node);
    const range = document.createRange();
    range.selectNodeContents(p);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  } else {
    const newEl = document.createElement(tag);
    newEl.innerHTML = node.innerHTML || "<br>";
    editorEl.replaceChild(newEl, node);
    const range = document.createRange();
    range.selectNodeContents(newEl);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  }
}

// Wrap the current block in a list (ul or ol)
function toggleList(editorEl, listTag) {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return;

  // If editor is empty or cursor is directly in editor (no block child)
  let node = getBlockNode(editorEl);

  // Handle case where cursor is directly in the editor div (no wrapping block)
  // e.g. editor just has a text node or is empty
  if (!node || node === editorEl) {
    // Collect all direct text/non-block children and wrap them
    const list = document.createElement(listTag);
    const li = document.createElement("li");
    // Grab any raw text content directly in the editor
    let textContent = "";
    const toRemove = [];
    editorEl.childNodes.forEach(child => {
      if (child.nodeType === Node.TEXT_NODE) {
        textContent += child.textContent;
        toRemove.push(child);
      }
    });
    toRemove.forEach(c => editorEl.removeChild(c));
    li.innerHTML = textContent || "<br>";
    list.appendChild(li);
    editorEl.insertBefore(list, editorEl.firstChild);
    const range = document.createRange();
    range.selectNodeContents(li);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
    return;
  }

  // If it's a raw text node, wrap in p first
  if (node.nodeType === Node.TEXT_NODE) {
    const p = document.createElement("p");
    p.textContent = node.textContent;
    editorEl.replaceChild(p, node);
    node = p;
  }

  // If already a list of the same type, unwrap it
  if (node.nodeName.toLowerCase() === listTag) {
    const fragment = document.createDocumentFragment();
    Array.from(node.children).forEach(li => {
      const p = document.createElement("p");
      p.innerHTML = li.innerHTML || "<br>";
      fragment.appendChild(p);
    });
    editorEl.replaceChild(fragment, node);
    return;
  }

  // If inside a list item (nested), unwrap
  let liAncestor = sel.getRangeAt(0).startContainer;
  while (liAncestor && liAncestor !== editorEl) {
    if (liAncestor.nodeName === "LI") {
      const parentList = liAncestor.parentNode;
      const p = document.createElement("p");
      p.innerHTML = liAncestor.innerHTML || "<br>";
      parentList.replaceWith(p);
      return;
    }
    liAncestor = liAncestor.parentNode;
  }

  // Convert the current block into a list item
  const html = getNodeHTML(node);
  const list = document.createElement(listTag);
  const li = document.createElement("li");
  li.innerHTML = html;
  list.appendChild(li);
  editorEl.replaceChild(list, node);

  const range = document.createRange();
  range.selectNodeContents(li);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

// Set alignment on the current block
function setAlign(editorEl, align) {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return;
  const node = getBlockNode(editorEl);
  if (node) node.style.textAlign = align;
}

// ── Document Editor ────────────────────────────────────────────────────

function DocumentEditor({ docData, onBack, onSave }) {
  const editorRef   = useRef(null);
  const saveTimer   = useRef(null);
  const titleRef    = useRef(docData.name);
  const historyRef  = useRef([]);   // custom undo stack
  const histIdxRef  = useRef(-1);   // current position in stack
  const suppressRef = useRef(false);// prevent recording during undo/redo

  const [saved, setSaved]           = useState(true);
  const [title, setTitle]           = useState(docData.name);
  const [fontFamily, setFontFamily] = useState("Georgia, serif");
  const [fontSize, setFontSize]     = useState("14");
  const [fmt, setFmt]               = useState({ bold: false, italic: false, underline: false, strike: false });

  // ── history helpers ──────────────────────────────────────────────
  const pushHistory = useCallback(() => {
    if (suppressRef.current) return;
    const html = editorRef.current?.innerHTML || "";
    const stack = historyRef.current;
    const idx = histIdxRef.current;
    // Truncate forward history
    stack.splice(idx + 1);
    // Avoid duplicate entries
    if (stack[stack.length - 1] !== html) {
      stack.push(html);
      if (stack.length > 200) stack.shift();
    }
    histIdxRef.current = stack.length - 1;
  }, []);

  const undo = useCallback(() => {
    const stack = historyRef.current;
    if (histIdxRef.current <= 0) return;
    histIdxRef.current--;
    suppressRef.current = true;
    editorRef.current.innerHTML = stack[histIdxRef.current];
    suppressRef.current = false;
    scheduleSave();
  }, []);

  const redo = useCallback(() => {
    const stack = historyRef.current;
    if (histIdxRef.current >= stack.length - 1) return;
    histIdxRef.current++;
    suppressRef.current = true;
    editorRef.current.innerHTML = stack[histIdxRef.current];
    suppressRef.current = false;
    scheduleSave();
  }, []);

  // ── mount ────────────────────────────────────────────────────────
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    el.innerHTML = docData.content || "<p><br></p>";
    // Seed history
    historyRef.current = [el.innerHTML];
    histIdxRef.current = 0;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }, []);

  useEffect(() => { titleRef.current = title; }, [title]);

  const doSave = useCallback(() => {
    if (!docData.id) return;
    const content = editorRef.current?.innerHTML || "";
    onSave(docData.id, { content, name: titleRef.current });
    setSaved(true);
  }, [docData.id, onSave]);

  const scheduleSave = useCallback(() => {
    if (!docData.id) return;
    setSaved(false);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(doSave, 120000);
  }, [docData.id, doSave]);

  useEffect(() => () => clearTimeout(saveTimer.current), []);

  const refreshFmt = useCallback(() => {
    try {
      setFmt({
        bold:      document.queryCommandState("bold"),
        italic:    document.queryCommandState("italic"),
        underline: document.queryCommandState("underline"),
        strike:    document.queryCommandState("strikeThrough"),
      });
    } catch {}
  }, []);

  const exec = useCallback((cmd, val = null) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false, val);
    pushHistory();
    refreshFmt();
    scheduleSave();
  }, [pushHistory, refreshFmt, scheduleSave]);

  const applyFont = useCallback((family) => {
    setFontFamily(family);
    if (editorRef.current) editorRef.current.style.fontFamily = family;
  }, []);

  const applySize = useCallback((size) => {
    setFontSize(size);
    const sel = window.getSelection();
    const hasSelection = sel && sel.rangeCount > 0 && !sel.getRangeAt(0).collapsed;
    if (!hasSelection) {
      if (editorRef.current) editorRef.current.style.fontSize = size + "px";
      return;
    }
    wrapSelection("span", { fontSize: size + "px" });
    pushHistory();
    scheduleSave();
  }, [pushHistory, scheduleSave]);

  const applyHeading = useCallback((tag) => {
    editorRef.current?.focus();
    const el = editorRef.current;
    if (!el) return;
    toggleBlock(el, tag);
    pushHistory();
    scheduleSave();
  }, [pushHistory, scheduleSave]);

  const applyList = useCallback((listTag) => {
    editorRef.current?.focus();
    const el = editorRef.current;
    if (!el) return;
    toggleList(el, listTag);
    pushHistory();
    scheduleSave();
  }, [pushHistory, scheduleSave]);

  const applyAlign = useCallback((align) => {
    editorRef.current?.focus();
    const el = editorRef.current;
    if (!el) return;
    setAlign(el, align);
    pushHistory();
    scheduleSave();
  }, [pushHistory, scheduleSave]);

  const [selectedImg, setSelectedImg] = useState(null); // {el, rect}

  // Click handler on the page area — detect image clicks
  const handlePageClick = useCallback((e) => {
    if (e.target.tagName === "IMG") {
      e.preventDefault();
      const img = e.target;
      const rect = img.getBoundingClientRect();
      setSelectedImg({ el: img, rect });
    } else {
      setSelectedImg(null);
      editorRef.current?.focus();
    }
  }, []);

  const handleManualSave = useCallback(() => {
    clearTimeout(saveTimer.current);
    doSave();
  }, [doSave]);

  const handleBack = useCallback(() => {
    clearTimeout(saveTimer.current);
    doSave();
    onBack();
  }, [doSave, onBack]);

  // ── List keyboard handler ─────────────────────────────────────────
  // Tab inside li → indent (create nested list)
  // Enter on empty li → if nested, outdent; if top level, exit list
  // Double-enter on empty li → exit list entirely
  const handleKeyDown = useCallback((e) => {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    let node = range.startContainer;
    // Walk up to find the li
    let li = null;
    let n = node;
    while (n) {
      if (n.nodeName === "LI") { li = n; break; }
      n = n.parentNode;
    }

    if (e.key === "Tab" && li) {
      e.preventDefault();
      if (e.shiftKey) {
        // Shift+Tab: outdent
        const parentList = li.parentNode;
        const grandParentLi = parentList?.parentNode;
        if (grandParentLi?.nodeName === "LI") {
          const grandList = grandParentLi.parentNode;
          grandList.insertBefore(li, grandParentLi.nextSibling);
          if (parentList.children.length === 0) grandParentLi.removeChild(parentList);
        }
      } else {
        // Tab: indent — wrap in new nested list of same type
        const parentList = li.parentNode;
        const listTag = parentList?.nodeName?.toLowerCase() || "ul";
        const prevLi = li.previousElementSibling;
        if (prevLi) {
          let nested = prevLi.querySelector(listTag);
          if (!nested) {
            nested = document.createElement(listTag);
            prevLi.appendChild(nested);
          }
          nested.appendChild(li);
        }
      }
      // Restore cursor
      const r = document.createRange();
      r.selectNodeContents(li);
      r.collapse(false);
      sel.removeAllRanges();
      sel.addRange(r);
      pushHistory(); scheduleSave();
      return;
    }

    if (e.key === "Enter" && li) {
      const isEmpty = li.textContent.trim() === "" && !li.querySelector("img");
      if (isEmpty) {
        e.preventDefault();
        const parentList = li.parentNode;
        const grandParentLi = parentList?.parentNode;

        const placeCursor = (target) => {
          // Use setTimeout to let DOM settle before moving cursor
          setTimeout(() => {
            const r = document.createRange();
            const s = window.getSelection();
            if (target.firstChild && target.firstChild.nodeType === Node.TEXT_NODE) {
              r.setStart(target.firstChild, target.firstChild.length);
            } else {
              r.selectNodeContents(target);
              r.collapse(false);
            }
            s?.removeAllRanges();
            s?.addRange(r);
            target.focus?.();
            editorRef.current?.focus();
          }, 0);
        };

        if (grandParentLi?.nodeName === "LI") {
          // Nested → outdent: move li to parent level after grandParentLi
          const grandList = grandParentLi.parentNode;
          li.innerHTML = "<br>";
          grandList.insertBefore(li, grandParentLi.nextSibling);
          if (parentList.children.length === 0) grandParentLi.removeChild(parentList);
          placeCursor(li);
        } else {
          // Top-level empty li → exit list, insert <p> after the list
          const list = parentList;
          const p = document.createElement("p");
          p.innerHTML = "<br>";
          list.parentNode.insertBefore(p, list.nextSibling);
          li.remove();
          if (list.children.length === 0) list.remove();
          placeCursor(p);
        }
        pushHistory(); scheduleSave();
        return;
      }
    }

    // Ctrl/Cmd shortcuts
    if (e.ctrlKey || e.metaKey) {
      if (e.key === "b") { e.preventDefault(); exec("bold"); }
      if (e.key === "i") { e.preventDefault(); exec("italic"); }
      if (e.key === "u") { e.preventDefault(); exec("underline"); }
      if (e.key === "s") { e.preventDefault(); handleManualSave(); }
      if (e.key === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
      if (e.key === "y") { e.preventDefault(); redo(); }
    }
  }, [exec, handleManualSave, undo, redo, pushHistory, scheduleSave]);

  return (
    <div className="fixed inset-0 z-[90] flex flex-col bg-stone-100 dark:bg-brand-950">

      {/* Top bar */}
      <div className="flex items-center gap-2 px-4 bg-white dark:bg-brand-900 border-b border-brand-200 dark:border-brand-700 shadow-sm flex-shrink-0" style={{ paddingTop: "max(0.625rem, env(safe-area-inset-top, 0.625rem))", paddingBottom: "0.625rem" }}>
        <button onClick={handleBack}
          className="text-sm font-medium text-accent-600 dark:text-accent-300 hover:underline flex-shrink-0">
          ‹ Back
        </button>
        <input value={title} onChange={e => { setTitle(e.target.value); scheduleSave(); }}
          className="flex-1 min-w-0 text-sm font-semibold bg-transparent text-brand-800 dark:text-brand-100 focus:outline-none border-b-2 border-transparent focus:border-accent-400 pb-0.5"
          placeholder="Document name" />
        <span className={`text-[10px] flex-shrink-0 ${saved ? "text-emerald-500" : "text-amber-500"}`}>
          {saved ? "✓ Saved" : "● Unsaved"}
        </span>
        <button
          onClick={handleManualSave}
          className="flex-shrink-0 px-3 py-1.5 text-xs bg-brand-700 dark:bg-brand-200 text-white dark:text-brand-900 rounded-lg hover:bg-brand-800 dark:hover:bg-white transition font-medium border-2 border-brand-600 dark:border-brand-300">
          Save
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex items-center flex-wrap gap-0.5 px-2 py-1.5 bg-white dark:bg-brand-900 border-b-2 border-brand-200 dark:border-brand-700 flex-shrink-0">

        <select value={fontFamily} onChange={e => applyFont(e.target.value)}
          onMouseDown={e => e.stopPropagation()}
          className="h-7 text-xs rounded border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-800 text-brand-700 dark:text-brand-200 px-1.5 focus:outline-none mr-1">
          {FONTS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>

        <select value={fontSize} onChange={e => applySize(e.target.value)}
          onMouseDown={e => e.stopPropagation()}
          className="h-7 w-16 text-xs rounded border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-800 text-brand-700 dark:text-brand-200 px-1 focus:outline-none mr-1">
          {FONT_SIZES.map(s => <option key={s} value={s}>{s}px</option>)}
        </select>

        <TSep />

        <TBtn onPointerDown={() => applyHeading("h1")} title="Heading 1"><b className="text-sm">H1</b></TBtn>
        <TBtn onPointerDown={() => applyHeading("h2")} title="Heading 2"><b className="text-xs">H2</b></TBtn>
        <TBtn onPointerDown={() => applyHeading("h3")} title="Heading 3"><b className="text-[10px]">H3</b></TBtn>
        <TBtn onPointerDown={() => applyHeading("p")}  title="Normal text"><span className="text-xs">¶</span></TBtn>

        <TSep />

        <TBtn onPointerDown={() => exec("bold")}          active={fmt.bold}      title="Bold"><b>B</b></TBtn>
        <TBtn onPointerDown={() => exec("italic")}        active={fmt.italic}    title="Italic"><i>I</i></TBtn>
        <TBtn onPointerDown={() => exec("underline")}     active={fmt.underline} title="Underline"><u>U</u></TBtn>
        <TBtn onPointerDown={() => exec("strikeThrough")} active={fmt.strike}    title="Strikethrough"><s>S</s></TBtn>

        <TSep />

        <TBtn onPointerDown={() => applyAlign("left")}    title="Align left">
          <svg width="13" height="11" viewBox="0 0 13 11" fill="currentColor"><rect y="0" width="13" height="2" rx="1"/><rect y="4.5" width="8" height="2" rx="1"/><rect y="9" width="11" height="2" rx="1"/></svg>
        </TBtn>
        <TBtn onPointerDown={() => applyAlign("center")}  title="Center">
          <svg width="13" height="11" viewBox="0 0 13 11" fill="currentColor"><rect y="0" width="13" height="2" rx="1"/><rect x="2.5" y="4.5" width="8" height="2" rx="1"/><rect x="1" y="9" width="11" height="2" rx="1"/></svg>
        </TBtn>
        <TBtn onPointerDown={() => applyAlign("right")}   title="Align right">
          <svg width="13" height="11" viewBox="0 0 13 11" fill="currentColor"><rect y="0" width="13" height="2" rx="1"/><rect x="5" y="4.5" width="8" height="2" rx="1"/><rect x="2" y="9" width="11" height="2" rx="1"/></svg>
        </TBtn>
        <TBtn onPointerDown={() => applyAlign("justify")} title="Justify">
          <svg width="13" height="11" viewBox="0 0 13 11" fill="currentColor"><rect y="0" width="13" height="2" rx="1"/><rect y="4.5" width="13" height="2" rx="1"/><rect y="9" width="13" height="2" rx="1"/></svg>
        </TBtn>

        <TSep />

        <TBtn onPointerDown={() => applyList("ul")} title="Bullet list (Tab to indent, Enter×2 to exit)">
          <svg width="14" height="11" viewBox="0 0 14 11" fill="currentColor"><circle cx="1.5" cy="1.5" r="1.5"/><rect x="4" y="0.5" width="10" height="2" rx="1"/><circle cx="1.5" cy="5.5" r="1.5"/><rect x="4" y="4.5" width="10" height="2" rx="1"/><circle cx="1.5" cy="9.5" r="1.5"/><rect x="4" y="8.5" width="10" height="2" rx="1"/></svg>
        </TBtn>
        <TBtn onPointerDown={() => applyList("ol")} title="Numbered list (Tab to indent, Enter×2 to exit)">
          <svg width="14" height="11" viewBox="0 0 14 11" fill="currentColor"><text x="0" y="9" fontSize="8" fontFamily="monospace" fill="currentColor">1.</text><rect x="6" y="0.5" width="8" height="2" rx="1"/><rect x="6" y="4.5" width="8" height="2" rx="1"/><rect x="6" y="8.5" width="8" height="2" rx="1"/></svg>
        </TBtn>

        <TSep />

        <label className="flex items-center gap-1 cursor-pointer h-7 px-1.5 rounded hover:bg-brand-100 dark:hover:bg-brand-700" title="Text color">
          <b className="text-xs text-brand-700 dark:text-brand-200">A</b>
          <input type="color" defaultValue="#111827" onInput={e => { exec("styleWithCSS", "true"); exec("foreColor", e.target.value); }}
            className="w-4 h-4 cursor-pointer border-0 p-0 bg-transparent" />
        </label>
        <label className="flex items-center gap-1 cursor-pointer h-7 px-1.5 rounded hover:bg-brand-100 dark:hover:bg-brand-700" title="Highlight">
          <span className="text-yellow-400 font-bold text-xs">H</span>
          <input type="color" defaultValue="#fef08a" onInput={e => { exec("styleWithCSS", "true"); exec("hiliteColor", e.target.value); }}
            className="w-4 h-4 cursor-pointer border-0 p-0 bg-transparent" />
        </label>

        <TSep />

        {/* Image upload — compressed via canvas before inserting */}
        <label className="flex items-center gap-1 cursor-pointer h-7 px-1.5 rounded text-brand-700 dark:text-brand-200 hover:bg-brand-100 dark:hover:bg-brand-700 text-xs font-medium" title="Insert image">
          🖼
          <input type="file" accept="image/*" className="sr-only"
            onChange={e => {
              const file = e.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = ev => {
                const img = new Image();
                img.onload = () => {
                  // Max 800px wide, compress to JPEG 0.8
                  const MAX_W = 800;
                  const ratio = Math.min(MAX_W / img.width, 1);
                  const w = Math.round(img.width * ratio);
                  const h = Math.round(img.height * ratio);
                  const canvas = document.createElement("canvas");
                  canvas.width = w; canvas.height = h;
                  canvas.getContext("2d").drawImage(img, 0, 0, w, h);
                  const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
                  // Insert at cursor
                  editorRef.current?.focus();
                  document.execCommand("insertHTML", false,
                    `<img src="${dataUrl}" style="max-width:100%;height:auto;display:block;margin:8px 0;" />`
                  );
                  pushHistory(); scheduleSave();
                };
                img.src = ev.target.result;
              };
              reader.readAsDataURL(file);
              // Reset so same file can be re-selected
              e.target.value = "";
            }}
          />
        </label>

        <TSep />

        <TBtn title="Undo (Ctrl+Z)" onPointerDown={undo}>↩</TBtn>
        <TBtn title="Redo (Ctrl+Y)" onPointerDown={redo}>↪</TBtn>
      </div>

      {/* Page */}
      <div className="flex-1 overflow-y-auto bg-stone-300 dark:bg-[#111] py-10 px-4 relative"
        onClick={handlePageClick}>
        <div
          className="mx-auto bg-white dark:bg-[#1e1c2e] shadow-2xl"
          style={{ maxWidth: 794, minHeight: 1123, padding: "80px 80px" }}
          onClick={e => e.stopPropagation()}
        >
          <style>{`
            #chaos-editor h1 { font-size: 2em; font-weight: bold; margin: 0.5em 0; line-height: 1.2; }
            #chaos-editor h2 { font-size: 1.5em; font-weight: bold; margin: 0.5em 0; line-height: 1.3; }
            #chaos-editor h3 { font-size: 1.2em; font-weight: bold; margin: 0.5em 0; line-height: 1.4; }
            #chaos-editor p  { margin: 0.3em 0; min-height: 1.2em; }
            #chaos-editor ul { list-style-type: disc; padding-left: 1.5em; margin: 0.3em 0; }
            #chaos-editor ol { list-style-type: decimal; padding-left: 1.5em; margin: 0.3em 0; }
            #chaos-editor li { margin: 0.2em 0; }
            #chaos-editor ul ul { list-style-type: circle; }
            #chaos-editor ul ul ul { list-style-type: square; }
            #chaos-editor ol ol { list-style-type: lower-alpha; }
            #chaos-editor ol ol ol { list-style-type: lower-roman; }
            #chaos-editor img { max-width: 100%; height: auto; display: block; margin: 8px 0; border-radius: 4px; cursor: pointer; }
            #chaos-editor img.selected { outline: 2px solid #7c3aed; outline-offset: 2px; }
          `}</style>
          <div
            id="chaos-editor"
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            onInput={() => { pushHistory(); scheduleSave(); }}
            onKeyUp={refreshFmt}
            onMouseUp={refreshFmt}
            onFocus={refreshFmt}
            onSelect={refreshFmt}
            onKeyDown={handleKeyDown}
            onClick={e => {
              if (e.target.tagName === "IMG") {
                // Highlight selected image
                editorRef.current?.querySelectorAll("img.selected").forEach(i => i.classList.remove("selected"));
                e.target.classList.add("selected");
                setSelectedImg({ el: e.target, rect: e.target.getBoundingClientRect() });
                e.stopPropagation();
              } else {
                editorRef.current?.querySelectorAll("img.selected").forEach(i => i.classList.remove("selected"));
                setSelectedImg(null);
              }
            }}
            spellCheck
            className="outline-none w-full text-gray-900 dark:text-gray-100"
            style={{ fontFamily, fontSize: fontSize + "px", lineHeight: "1.8", minHeight: 900, display: "block" }}
          />
        </div>

        {/* Floating image resize toolbar */}
        {selectedImg && (() => {
          const rect = selectedImg.el.getBoundingClientRect();
          const scrollEl = selectedImg.el.closest(".overflow-y-auto");
          const scrollTop = scrollEl?.scrollTop || 0;
          const containerRect = scrollEl?.getBoundingClientRect();
          const top = rect.bottom - (containerRect?.top || 0) + scrollTop + 6;
          const left = rect.left - (containerRect?.left || 0);

          const setWidth = (w) => {
            selectedImg.el.style.width = w;
            selectedImg.el.style.height = "auto";
            setSelectedImg({ el: selectedImg.el, rect: selectedImg.el.getBoundingClientRect() });
            pushHistory(); scheduleSave();
          };
          const deleteImg = () => {
            selectedImg.el.remove();
            setSelectedImg(null);
            pushHistory(); scheduleSave();
          };

          return (
            <div
              className="absolute z-50 flex items-center gap-1 px-2 py-1.5 bg-brand-900 dark:bg-brand-800 border border-brand-600 rounded-xl shadow-xl"
              style={{ top, left }}
              onPointerDown={e => e.preventDefault()}
            >
              <span className="text-[10px] text-brand-400 mr-1">Size:</span>
              {[["XS","20%"],["S","35%"],["M","50%"],["L","75%"],["Full","100%"]].map(([label, w]) => (
                <button key={label} onClick={() => setWidth(w)}
                  className={`px-2 py-0.5 text-[10px] rounded font-medium transition ${
                    selectedImg.el.style.width === w
                      ? "bg-accent-500 text-white"
                      : "text-brand-200 hover:bg-brand-700"
                  }`}>
                  {label}
                </button>
              ))}
              <div className="w-px h-4 bg-brand-600 mx-1" />
              {/* Float alignment */}
              <button onClick={() => { selectedImg.el.style.marginLeft = "0"; selectedImg.el.style.marginRight = "auto"; scheduleSave(); }}
                className="text-brand-300 hover:text-white text-xs px-1" title="Align left">◀</button>
              <button onClick={() => { selectedImg.el.style.marginLeft = "auto"; selectedImg.el.style.marginRight = "auto"; scheduleSave(); }}
                className="text-brand-300 hover:text-white text-xs px-1" title="Center">◆</button>
              <button onClick={() => { selectedImg.el.style.marginLeft = "auto"; selectedImg.el.style.marginRight = "0"; scheduleSave(); }}
                className="text-brand-300 hover:text-white text-xs px-1" title="Align right">▶</button>
              <div className="w-px h-4 bg-brand-600 mx-1" />
              <button onClick={deleteImg} className="text-red-400 hover:text-red-300 text-xs px-1" title="Delete image">🗑</button>
            </div>
          );
        })()}
      </div>
    </div>
  );
} 

// ── Project Documents ─────────────────────────────────────────────────

function ProjectDocuments({ project, onBack }) {
  const uid = auth.currentUser?.uid;
  const [documents, setDocuments]     = useState([]);
  const [docCategories, setDocCategories] = useState([]);
  const [openDoc, setOpenDoc]         = useState(null);
  const [adding, setAdding]           = useState(false);
  const [newName, setNewName]         = useState("");
  const [newCategoryId, setNewCategoryId] = useState("");
  const [saving, setSaving]           = useState(false);
  const [showCatForm, setShowCatForm] = useState(false);
  const [newCatName, setNewCatName]   = useState("");
  const [newCatColor, setNewCatColor] = useState("violet");
  const [tab, setTab]                 = useState("docs"); // "docs" | "progress" | "todos"
  const [dailyLogs, setDailyLogs]     = useState([]);
  const [manualEntries, setManualEntries] = useState([]);
  const [todos, setTodos]             = useState([]);
  const [addingTodo, setAddingTodo]   = useState(false);
  const [todoText, setTodoText]       = useState("");
  const [todoPriority, setTodoPriority] = useState(null);
  const [addingProgress, setAddingProgress] = useState(false);
  const [progressNote, setProgressNote]   = useState("");
  const [progressDate, setProgressDate]   = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  });
  const [selectedProgress, setSelectedProgress] = useState(null);

  useEffect(() => {
    if (!uid) return;
    const u1 = listenToProjectDocuments(uid, project.id, setDocuments);
    const u2 = listenToProjectDailyLogs(uid, project.id, setDailyLogs);
    const u3 = listenToProjectProgressEntries(uid, project.id, setManualEntries);
    const u4 = listenToProjectTodos(uid, project.id, setTodos);
    const u5 = listenToProjectDocCategories(uid, project.id, setDocCategories);
    return () => { u1(); u2(); u3(); u4(); u5(); };
  }, [uid, project.id]);

  // Merge and sort all progress entries
  const allProgress = useMemo(() => {
    const items = [];
    dailyLogs.forEach(log => {
      log.entries.forEach(e => {
        items.push({
          id: `log-${log.id}`,
          date: log.date,
          note: e.note,
          source: "daily-log",
        });
      });
    });
    manualEntries.forEach(e => {
      items.push({
        id: e.id,
        date: e.date,
        note: e.note,
        source: "manual",
      });
    });
    return items.sort((a, b) => b.date.localeCompare(a.date));
  }, [dailyLogs, manualEntries]);

  const sortedTodos = useMemo(() => sortTodos(todos), [todos]);
  const pendingTodos = useMemo(() => sortedTodos.filter(t => !t.done), [sortedTodos]);
  const doneTodos = useMemo(() => sortedTodos.filter(t => t.done), [sortedTodos]);

  const handleAddTodo = async () => {
    if (!todoText.trim()) return;
    setSaving(true);
    try {
      await createProjectTodo(uid, project.id, { text: todoText.trim(), priority: todoPriority });
      setTodoText(""); setTodoPriority(null); setAddingTodo(false);
    } finally { setSaving(false); }
  };

  const handleSaveDoc = useCallback(async (id, changes) => {
    await updateProjectDocument(id, changes);
    setDocuments(prev => prev.map(d => d.id === id ? { ...d, ...changes } : d));
  }, []);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const ref = await createProjectDocument(uid, project.id, { name: newName.trim(), categoryId: newCategoryId });
      const newDoc = { id: ref.id, projectId: project.id, name: newName.trim(), content: "", categoryId: newCategoryId, uid };
      setNewName(""); setNewCategoryId(""); setAdding(false);
      setOpenDoc(newDoc);
    } finally { setSaving(false); }
  };

  const handleAddCategory = async () => {
    if (!newCatName.trim()) return;
    setSaving(true);
    try {
      await createProjectDocCategory(uid, project.id, { name: newCatName.trim(), color: newCatColor });
      setNewCatName(""); setShowCatForm(false);
    } finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this document?")) return;
    await deleteProjectDocument(id);
    if (openDoc?.id === id) setOpenDoc(null);
  };

  const handleAddProgress = async () => {
    if (!progressNote.trim()) return;
    setSaving(true);
    try {
      await createProjectProgressEntry(uid, project.id, { note: progressNote.trim(), date: progressDate });
      setProgressNote(""); setAddingProgress(false);
    } finally { setSaving(false); }
  };

  const fmtDate = (ts) => ts?.toDate
    ? ts.toDate().toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : "";

  const fmtDateStr = (str) => {
    if (!str) return "";
    const d = new Date(str + "T00:00:00");
    return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  };

  if (openDoc) {
    return <DocumentEditor docData={openDoc} onBack={() => setOpenDoc(null)} onSave={handleSaveDoc} />;
  }

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-brand-50 dark:bg-brand-950">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 bg-white dark:bg-brand-900 border-b border-brand-200 dark:border-brand-700 shadow-sm flex-shrink-0" style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top, 0.75rem))", paddingBottom: "0.75rem" }}>
        <button onClick={onBack} className="text-sm font-medium text-accent-600 dark:text-accent-300 hover:underline flex-shrink-0">‹ Projects</button>
        <span className="text-xl flex-shrink-0">{project.emoji}</span>
        <h2 className="text-sm font-semibold text-brand-800 dark:text-brand-100 flex-1 min-w-0 truncate">{project.name}</h2>
        {tab === "docs" && (
          <button onClick={() => { setAdding(true); setNewName(""); setNewCategoryId(""); }}
            className="text-xs text-accent-500 dark:text-accent-300 font-medium flex-shrink-0">+ New doc</button>
        )}
        {tab === "progress" && (
          <button onClick={() => setAddingProgress(true)}
            className="text-xs text-accent-500 dark:text-accent-300 font-medium flex-shrink-0">+ Add entry</button>
        )}
        {tab === "todos" && (
          <button onClick={() => setAddingTodo(true)}
            className="text-xs text-accent-500 dark:text-accent-300 font-medium flex-shrink-0">+ Add task</button>
        )}
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 p-2 bg-white dark:bg-brand-900 border-b border-brand-200 dark:border-brand-700 flex-shrink-0">
        <button onClick={() => setTab("docs")}
          className={`flex-1 py-1.5 text-xs rounded-lg font-medium transition ${tab === "docs" ? "bg-brand-100 dark:bg-brand-700 text-brand-700 dark:text-brand-100" : "text-brand-400 dark:text-brand-500"}`}>
          📄 Docs {documents.length > 0 && `(${documents.length})`}
        </button>
        <button onClick={() => setTab("todos")}
          className={`flex-1 py-1.5 text-xs rounded-lg font-medium transition ${tab === "todos" ? "bg-brand-100 dark:bg-brand-700 text-brand-700 dark:text-brand-100" : "text-brand-400 dark:text-brand-500"}`}>
          ✅ Next Up {pendingTodos.length > 0 && `(${pendingTodos.length})`}
        </button>
        <button onClick={() => setTab("progress")}
          className={`flex-1 py-1.5 text-xs rounded-lg font-medium transition ${tab === "progress" ? "bg-brand-100 dark:bg-brand-700 text-brand-700 dark:text-brand-100" : "text-brand-400 dark:text-brand-500"}`}>
          🚀 Progress {allProgress.length > 0 && `(${allProgress.length})`}
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-4 max-w-lg mx-auto w-full">

        {/* ── Documents tab ── */}
        {tab === "docs" && (
          <>
            {/* New doc form */}
            {adding && (
              <div className="mb-4 rounded-2xl border-2 shadow-sm border-accent-300 dark:border-accent-600 bg-white dark:bg-brand-800 p-4 space-y-2">
                <p className="text-xs font-pixel text-brand-500 dark:text-brand-400">NEW DOCUMENT</p>
                <input autoFocus value={newName} onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") setAdding(false); }}
                  placeholder="Document name"
                  className="w-full rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-900 text-brand-800 dark:text-brand-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400" />
                {docCategories.length > 0 && (
                  <select value={newCategoryId} onChange={e => setNewCategoryId(e.target.value)}
                    className="w-full rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-900 text-brand-800 dark:text-brand-100 px-3 py-2 text-sm focus:outline-none appearance-none">
                    <option value="">— No category —</option>
                    {docCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                )}
                <div className="flex gap-2">
                  <button onClick={handleCreate} disabled={saving || !newName.trim()}
                    className="px-3 py-2 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50">
                    {saving ? "…" : "Create"}
                  </button>
                  <button onClick={() => setAdding(false)} className="text-brand-400 text-sm">Cancel</button>
                </div>
              </div>
            )}

            {/* Category management */}
            <div className="mb-3">
              {!showCatForm && (
                <button onClick={() => setShowCatForm(true)}
                  className="text-[10px] text-brand-400 dark:text-brand-500 hover:text-accent-500 dark:hover:text-accent-300">
                  + Add category
                </button>
              )}
              {showCatForm && (
                <div className="flex gap-2 items-center mb-2">
                  <input autoFocus value={newCatName} onChange={e => setNewCatName(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") handleAddCategory(); if (e.key === "Escape") setShowCatForm(false); }}
                    placeholder="Category name"
                    className="flex-1 rounded-lg border border-accent-300 dark:border-accent-600 bg-white dark:bg-brand-800 text-brand-800 dark:text-brand-100 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400" />
                  <select value={newCatColor} onChange={e => setNewCatColor(e.target.value)}
                    className="rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-800 text-brand-700 dark:text-brand-200 px-2 py-1.5 text-xs focus:outline-none appearance-none">
                    {[["violet","🟣"],["blue","🔵"],["emerald","🟢"],["amber","🟡"],["red","🔴"],["pink","🩷"],["gray","⚪"]].map(([c, e]) =>
                      <option key={c} value={c}>{e} {c}</option>
                    )}
                  </select>
                  <button onClick={handleAddCategory} disabled={saving || !newCatName.trim()}
                    className="px-3 py-1.5 text-sm bg-brand-600 text-white rounded-lg disabled:opacity-50">{saving ? "…" : "Add"}</button>
                  <button onClick={() => setShowCatForm(false)} className="text-brand-400 text-sm">✕</button>
                </div>
              )}
              {/* Show existing categories as removable chips */}
              {docCategories.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {docCategories.map(c => {
                    const colorMap = {
                      violet: "bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-700",
                      blue:   "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-700",
                      emerald:"bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700",
                      amber:  "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-700",
                      red:    "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-700",
                      pink:   "bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300 border-pink-200 dark:border-pink-700",
                      gray:   "bg-brand-100 dark:bg-brand-700 text-brand-600 dark:text-brand-300 border-brand-200 dark:border-brand-600",
                    };
                    return (
                      <span key={c.id} className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${colorMap[c.color] || colorMap.gray}`}>
                        {c.name}
                        <button onClick={() => { if (confirm(`Delete category "${c.name}"?`)) deleteProjectDocCategory(c.id); }}
                          className="opacity-50 hover:opacity-100 leading-none ml-0.5">×</button>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>

            {documents.length === 0 && !adding && (
              <div className="flex flex-col items-center gap-2 py-16 text-center">
                <span className="text-4xl">📄</span>
                <p className="text-sm text-brand-300 dark:text-brand-500 italic">No documents yet.</p>
                <button onClick={() => setAdding(true)} className="text-xs text-accent-500 dark:text-accent-300 underline mt-1">Create your first document</button>
              </div>
            )}

            {/* Documents grouped by category */}
            {(() => {
              const COLORS = {
                violet: "bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-700",
                blue:   "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-700",
                emerald:"bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700",
                amber:  "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-700",
                red:    "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-700",
                pink:   "bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300 border-pink-200 dark:border-pink-700",
                gray:   "bg-brand-100 dark:bg-brand-700 text-brand-600 dark:text-brand-300 border-brand-200 dark:border-brand-600",
              };

              const DocCard = ({ d }) => (
                <div key={d.id} onClick={() => setOpenDoc(d)}
                  className="group cursor-pointer rounded-2xl border-2 shadow-sm border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-800 p-4 hover:border-accent-300 dark:hover:border-accent-500 transition">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-base flex-shrink-0">📄</span>
                      <p className="text-sm font-semibold text-brand-800 dark:text-brand-100 truncate">{d.name}</p>
                    </div>
                    <button onClick={e => { e.stopPropagation(); handleDelete(d.id); }}
                      className="text-brand-300 hover:text-red-400 text-lg leading-none opacity-0 group-hover:opacity-100 transition flex-shrink-0">×</button>
                  </div>
                  <p className="text-xs text-brand-400 dark:text-brand-500 line-clamp-2 pl-7">
                    {d.content ? d.content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 100) : "Empty document"}
                  </p>
                  {d.updatedAt && <p className="text-[10px] text-brand-300 dark:text-brand-600 mt-1 pl-7">{fmtDate(d.updatedAt)}</p>}
                </div>
              );

              if (docCategories.length === 0) {
                // No categories — just list all docs
                return <div className="space-y-2">{documents.map(d => <DocCard key={d.id} d={d} />)}</div>;
              }

              // Group by category
              const uncategorized = documents.filter(d => !d.categoryId);
              return (
                <div className="space-y-5">
                  {docCategories.map(cat => {
                    const catDocs = documents.filter(d => d.categoryId === cat.id);
                    if (catDocs.length === 0) return null;
                    return (
                      <div key={cat.id}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${COLORS[cat.color] || COLORS.gray}`}>{cat.name}</span>
                          <div className="flex-1 h-px bg-brand-100 dark:bg-brand-700" />
                        </div>
                        <div className="space-y-2">{catDocs.map(d => <DocCard key={d.id} d={d} />)}</div>
                      </div>
                    );
                  })}
                  {uncategorized.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[10px] font-pixel text-brand-400 dark:text-brand-500">UNCATEGORIZED</span>
                        <div className="flex-1 h-px bg-brand-100 dark:bg-brand-700" />
                      </div>
                      <div className="space-y-2">{uncategorized.map(d => <DocCard key={d.id} d={d} />)}</div>
                    </div>
                  )}
                </div>
              );
            })()}
          </>
        )}

        {/* ── Todos tab ── */}
        {tab === "todos" && (
          <>
            {/* Add todo form */}
            {addingTodo && (
              <div className="mb-4 rounded-2xl border-2 shadow-sm border-accent-300 dark:border-accent-600 bg-white dark:bg-brand-800 p-4 space-y-3">
                <p className="text-xs font-pixel text-brand-500 dark:text-brand-400">NEW TASK</p>
                <input autoFocus value={todoText} onChange={e => setTodoText(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleAddTodo(); if (e.key === "Escape") setAddingTodo(false); }}
                  placeholder="What needs to be done?"
                  className="w-full rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-900 text-brand-800 dark:text-brand-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400" />
                {/* Priority picker */}
                <div>
                  <label className="block text-[10px] text-brand-400 dark:text-brand-500 mb-1.5">Priority</label>
                  <div className="flex gap-2">
                    <button onClick={() => setTodoPriority(null)}
                      className={`px-3 py-1 rounded-lg text-xs border-2 transition ${!todoPriority ? "bg-brand-700 dark:bg-brand-200 text-white dark:text-brand-900 border-brand-600" : "bg-white dark:bg-brand-900 border-brand-200 dark:border-brand-600 text-brand-500"}`}>
                      None
                    </button>
                    {PRIORITY_LEVELS.map(p => (
                      <button key={p.id} onClick={() => setTodoPriority(p.id)}
                        className={`px-3 py-1 rounded-lg text-xs border-2 transition ${todoPriority === p.id ? `${p.bg} ${p.border} ${p.color} font-medium` : "bg-white dark:bg-brand-900 border-brand-200 dark:border-brand-600 text-brand-500"}`}>
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={handleAddTodo} disabled={saving || !todoText.trim()}
                    className="px-3 py-1.5 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50">
                    {saving ? "…" : "Add"}
                  </button>
                  <button onClick={() => { setAddingTodo(false); setTodoText(""); setTodoPriority(null); }}
                    className="px-3 py-1.5 text-sm text-brand-500 dark:text-brand-400">Cancel</button>
                </div>
              </div>
            )}

            {pendingTodos.length === 0 && doneTodos.length === 0 && !addingTodo && (
              <div className="flex flex-col items-center gap-2 py-16 text-center">
                <span className="text-4xl">✅</span>
                <p className="text-sm text-brand-300 dark:text-brand-500 italic">No tasks yet.</p>
                <button onClick={() => setAddingTodo(true)} className="text-xs text-accent-500 dark:text-accent-300 underline mt-1">Add your first task</button>
              </div>
            )}

            {/* Pending todos */}
            {pendingTodos.length > 0 && (
              <div className="space-y-2 mb-4">
                {pendingTodos.map(todo => {
                  const ps = getPriorityStyle(todo.priority);
                  return (
                    <div key={todo.id} className={`flex items-start gap-3 rounded-2xl border-2 p-3 ${ps ? `${ps.bg} ${ps.border}` : "bg-white dark:bg-brand-800 border-brand-200 dark:border-brand-600"}`}>
                      {/* Checkbox */}
                      <button onClick={() => {
                        const uid = auth.currentUser?.uid;
                        updateProjectTodo(todo.id, { done: true });
                        if (uid) awardXp(uid, "project-todo", xpId.projectTodo(todo.id), XP.PROJECT_TODO);
                      }}
                        className="w-5 h-5 rounded-full border-2 border-current flex-shrink-0 mt-0.5 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition flex items-center justify-center text-brand-300 dark:text-brand-500">
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-brand-800 dark:text-brand-100 leading-snug">{todo.text}</p>
                        {ps && <span className={`text-[10px] font-medium ${ps.color}`}>{ps.label} priority</span>}
                      </div>
                      <button onClick={() => { if (confirm("Delete this task?")) deleteProjectTodo(todo.id); }}
                        className="text-brand-300 hover:text-red-400 text-sm leading-none flex-shrink-0">×</button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Done todos */}
            {doneTodos.length > 0 && (
              <div>
                <p className="text-[10px] font-pixel text-brand-400 dark:text-brand-500 mb-2">COMPLETED</p>
                <div className="space-y-1.5 opacity-60">
                  {doneTodos.map(todo => (
                    <div key={todo.id} className="flex items-center gap-3 rounded-xl border border-brand-200 dark:border-brand-600 bg-brand-50 dark:bg-brand-800 px-3 py-2">
                      <button onClick={() => {
                        const uid = auth.currentUser?.uid;
                        updateProjectTodo(todo.id, { done: false });
                        if (uid) revokeXp(uid, xpId.projectTodo(todo.id));
                      }}
                        className="w-5 h-5 rounded-full border-2 border-emerald-500 flex-shrink-0 bg-emerald-500 flex items-center justify-center">
                        <span className="text-white text-[10px]">✓</span>
                      </button>
                      <p className="text-sm text-brand-500 dark:text-brand-400 line-through flex-1 leading-snug">{todo.text}</p>
                      <button onClick={() => deleteProjectTodo(todo.id)}
                        className="text-brand-300 hover:text-red-400 text-sm leading-none flex-shrink-0">×</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Progress tab ── */}
        {tab === "progress" && (
          <>
            {/* Manual entry form */}
            {addingProgress && (
              <div className="mb-4 rounded-2xl border-2 shadow-sm border-accent-300 dark:border-accent-600 bg-white dark:bg-brand-800 p-4 space-y-3">
                <p className="text-xs font-pixel text-brand-500 dark:text-brand-400">ADD PROGRESS ENTRY</p>
                <div>
                  <label className="block text-[10px] text-brand-400 dark:text-brand-500 mb-1">Date</label>
                  <input type="date" value={progressDate} onChange={e => setProgressDate(e.target.value)}
                    className="w-full rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-900 text-brand-800 dark:text-brand-100 px-3 pr-4 py-2 appearance-none text-sm focus:outline-none focus:ring-2 focus:ring-accent-400" />
                </div>
                <textarea value={progressNote} onChange={e => setProgressNote(e.target.value)}
                  placeholder="What did you work on or achieve?"
                  rows={3}
                  className="w-full rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-900 text-brand-800 dark:text-brand-100 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-accent-400" />
                <div className="flex gap-2">
                  <button onClick={handleAddProgress} disabled={saving || !progressNote.trim()}
                    className="px-3 py-1.5 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50">
                    {saving ? "Saving…" : "Save"}
                  </button>
                  <button onClick={() => { setAddingProgress(false); setProgressNote(""); }}
                    className="px-3 py-1.5 text-sm text-brand-500 dark:text-brand-400">Cancel</button>
                </div>
              </div>
            )}

            {allProgress.length === 0 && !addingProgress && (
              <div className="flex flex-col items-center gap-2 py-16 text-center">
                <span className="text-4xl">🚀</span>
                <p className="text-sm text-brand-300 dark:text-brand-500 italic">No progress recorded yet.</p>
                <p className="text-xs text-brand-300 dark:text-brand-600">Progress entries from your Daily Log will appear here automatically.</p>
                <button onClick={() => setAddingProgress(true)} className="text-xs text-accent-500 dark:text-accent-300 underline mt-1">Add a manual entry</button>
              </div>
            )}

            <div className="space-y-2">
              {allProgress.map(entry => (
                <div key={entry.id}
                  onClick={() => setSelectedProgress(entry)}
                  className="group cursor-pointer rounded-2xl border-2 shadow-sm border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-800 p-4 hover:border-accent-300 dark:hover:border-accent-500 transition">
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs">{entry.source === "daily-log" ? "📓" : "✏️"}</span>
                      <p className="text-[10px] font-medium text-brand-500 dark:text-brand-400">
                        {fmtDateStr(entry.date)}
                        <span className="ml-2 text-brand-300 dark:text-brand-600">
                          {entry.source === "daily-log" ? "from Daily Log" : "manual"}
                        </span>
                      </p>
                    </div>
                    {entry.source === "manual" && (
                      <button onClick={e => { e.stopPropagation(); if (confirm("Delete this entry?")) deleteProjectProgressEntry(entry.id); }}
                        className="text-brand-300 hover:text-red-400 text-sm leading-none flex-shrink-0 opacity-0 group-hover:opacity-100 transition">×</button>
                    )}
                  </div>
                  <p className="text-sm text-brand-700 dark:text-brand-200 leading-relaxed line-clamp-3">{entry.note}</p>
                  {entry.note.length > 120 && (
                    <p className="text-[10px] text-accent-400 dark:text-accent-500 mt-1">Tap to read more</p>
                  )}
                </div>
              ))}
            </div>

            {/* Full note modal */}
            {selectedProgress && (
              <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
                <div className="absolute inset-0 bg-black/50" onClick={() => setSelectedProgress(null)} />
                <div className="relative w-full max-w-lg max-h-[80vh] flex flex-col bg-white dark:bg-brand-900 rounded-2xl shadow-2xl border border-brand-200 dark:border-brand-700">
                  {/* Modal header */}
                  <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-brand-100 dark:border-brand-700 flex-shrink-0">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{selectedProgress.source === "daily-log" ? "📓" : "✏️"}</span>
                        <p className="text-sm font-semibold text-brand-800 dark:text-brand-100">{fmtDateStr(selectedProgress.date)}</p>
                      </div>
                      <p className="text-[10px] text-brand-400 dark:text-brand-500 mt-0.5 ml-6">
                        {selectedProgress.source === "daily-log" ? "From Daily Log" : "Manual entry"}
                      </p>
                    </div>
                    <button onClick={() => setSelectedProgress(null)}
                      className="text-brand-400 hover:text-brand-700 dark:hover:text-brand-200 text-xl leading-none flex-shrink-0">×</button>
                  </div>
                  {/* Scrollable note body */}
                  <div className="flex-1 overflow-y-auto px-5 py-4">
                    <p className="text-sm text-brand-800 dark:text-brand-100 leading-relaxed whitespace-pre-wrap">{selectedProgress.note}</p>
                  </div>
                  {/* Delete button for manual entries */}
                  {selectedProgress.source === "manual" && (
                    <div className="px-5 py-3 border-t border-brand-100 dark:border-brand-700 flex-shrink-0">
                      <button
                        onClick={() => {
                          if (confirm("Delete this entry?")) {
                            deleteProjectProgressEntry(selectedProgress.id);
                            setSelectedProgress(null);
                          }
                        }}
                        className="text-xs text-red-400 hover:text-red-600 font-medium">
                        Delete this entry
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Main Projects page ─────────────────────────────────────────────────

function Projects() {
  const uid = auth.currentUser?.uid;
  const [projects, setProjects]       = useState([]);
  const [openProject, setOpenProject] = useState(null);
  const [adding, setAdding]           = useState(false);
  const [newName, setNewName]         = useState("");
  const [newEmoji, setNewEmoji]       = useState("📁");
  const [showEmoji, setShowEmoji]     = useState(false);
  const [saving, setSaving]           = useState(false);
  const [search, setSearch]           = useState("");

  useEffect(() => {
    if (!uid) return;
    return listenToProjects(uid, setProjects);
  }, [uid]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      await createProject(uid, { name: newName.trim(), emoji: newEmoji });
      setNewName(""); setNewEmoji("📁"); setAdding(false);
    } finally { setSaving(false); }
  };

  const filtered = projects.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));

  if (openProject) return <ProjectDocuments project={openProject} onBack={() => setOpenProject(null)} />;

  return (
    <PageLayout title="Projects">
      <div className="max-w-lg mx-auto px-4 pt-4 pb-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-pixel text-brand-800 dark:text-brand-100">PROJECTS</h2>
          {!adding && <button onClick={() => setAdding(true)} className="text-xs text-accent-500 dark:text-accent-300 font-medium">+ New project</button>}
        </div>

        {adding && (
          <div className="mb-4 rounded-2xl border-2 shadow-sm border-accent-300 dark:border-accent-600 bg-white dark:bg-brand-800 p-4 space-y-3">
            <p className="text-xs font-pixel text-brand-500 dark:text-brand-400">NEW PROJECT</p>
            <div className="flex gap-2">
              <div className="relative">
                <button onClick={() => setShowEmoji(s => !s)}
                  className="w-10 h-10 flex items-center justify-center rounded-lg border border-brand-200 dark:border-brand-600 text-xl hover:bg-brand-50 dark:hover:bg-brand-900">
                  {newEmoji}
                </button>
                {showEmoji && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowEmoji(false)} />
                    <div className="absolute top-11 left-0 z-20 bg-white dark:bg-brand-800 border border-brand-200 dark:border-brand-600 rounded-xl shadow-lg p-2 flex flex-wrap gap-1 w-48">
                      {EMOJIS.map(e => (
                        <button key={e} onClick={() => { setNewEmoji(e); setShowEmoji(false); }}
                          className="text-xl w-8 h-8 rounded hover:bg-brand-100 dark:hover:bg-brand-700 flex items-center justify-center">{e}</button>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <input autoFocus value={newName} onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") setAdding(false); }}
                placeholder="Project name"
                className="flex-1 rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-900 text-brand-800 dark:text-brand-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400" />
            </div>
            <div className="flex gap-2">
              <button onClick={handleCreate} disabled={saving || !newName.trim()}
                className="px-3 py-1.5 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50">
                {saving ? "Creating…" : "Create"}
              </button>
              <button onClick={() => setAdding(false)} className="px-3 py-1.5 text-sm text-brand-500 dark:text-brand-400">Cancel</button>
            </div>
          </div>
        )}

        {projects.length > 3 && (
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search projects…"
            className="w-full mb-4 rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-800 text-brand-800 dark:text-brand-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400" />
        )}

        {projects.length === 0 && !adding && (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <span className="text-4xl">📁</span>
            <p className="text-sm text-brand-300 dark:text-brand-500 italic">No projects yet.</p>
            <button onClick={() => setAdding(true)} className="text-xs text-accent-500 dark:text-accent-300 underline mt-1">Create your first project</button>
          </div>
        )}

        <div className="space-y-3">
          {filtered.map(project => (
            <div key={project.id} onClick={() => setOpenProject(project)}
              className="group cursor-pointer rounded-2xl border-2 shadow-sm border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-800 p-4 hover:border-accent-300 dark:hover:border-accent-500 transition">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xl flex-shrink-0">{project.emoji || "📁"}</span>
                  <p className="text-sm font-semibold text-brand-800 dark:text-brand-100 truncate">{project.name}</p>
                </div>
                <button onClick={e => { e.stopPropagation(); if (confirm(`Delete "${project.name}"?`)) deleteProject(project.id); }}
                  className="text-brand-300 hover:text-red-400 text-lg leading-none opacity-0 group-hover:opacity-100 transition flex-shrink-0">×</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </PageLayout>
  );
}

export default Projects;
