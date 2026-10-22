/*!
 * DIG Crates launcher (prototype). Tiny, dependency-free, lazy.
 *
 *   <button type="button" data-dig-open="basement-wax">Dig Our Crates</button>
 *   <div data-dig-inline="basement-wax" style="min-height:650px"></div>
 *   <script async src="https://YOUR-DIG-HOST/embed/dig.js"></script>
 *
 * Overlay: on click, a full-viewport iframe is created over the host page, background scroll is
 * locked, focus is contained, and on close the iframe is removed (stopping any audio), scroll
 * position and focus are restored. All cross-window messages are validated on origin, source
 * window and shape. Nothing here reads or changes host styles beyond the overlay element itself.
 */
(function () {
  "use strict";
  if (window.__digCratesLauncher) return; // dedupe when the script is included twice
  var NS = "dig-crates";
  var VERSION = 1;
  var READY_TIMEOUT_MS = 12000;
  var MIN_INLINE = 480;
  var MAX_INLINE = 1400;

  var script = document.currentScript;
  var appOrigin;
  try {
    appOrigin = new URL(script && script.src ? script.src : window.location.href, window.location.href).origin;
  } catch (e) {
    appOrigin = window.location.origin;
  }

  var state = {
    open: false,
    overlay: null,
    iframe: null,
    slug: null,
    trigger: null,
    savedScrollY: 0,
    savedOverflow: "",
    savedHtmlOverflow: "",
    readyTimer: 0,
  };

  function isValidSlug(s) {
    return typeof s === "string" && /^[a-z0-9-]{1,64}$/.test(s);
  }

  function isMessageFrom(event, iframe) {
    if (!iframe || event.source !== iframe.contentWindow) return false;
    if (event.origin !== appOrigin) return false;
    var d = event.data;
    return !!d && typeof d === "object" && d.namespace === NS && d.version === VERSION && typeof d.type === "string" && typeof d.storeSlug === "string";
  }

  function post(iframe, message) {
    if (!iframe || !iframe.contentWindow) return;
    message.namespace = NS;
    message.version = VERSION;
    iframe.contentWindow.postMessage(message, appOrigin);
  }

  function embedUrl(slug, mode) {
    return appOrigin + "/embed/" + encodeURIComponent(slug) + "?mode=" + mode + "&parentOrigin=" + encodeURIComponent(window.location.origin);
  }

  function el(tag, attrs, styles) {
    var node = document.createElement(tag);
    for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) node.setAttribute(k, attrs[k]);
    for (var s in styles) if (Object.prototype.hasOwnProperty.call(styles, s)) node.style[s] = styles[s];
    return node;
  }

  function closeOverlay() {
    if (!state.open) return;
    state.open = false;
    window.clearTimeout(state.readyTimer);
    if (state.iframe) post(state.iframe, { type: "HOST_CLOSING", storeSlug: state.slug });
    if (state.overlay && state.overlay.parentNode) state.overlay.parentNode.removeChild(state.overlay); // removes iframe: audio stops
    document.body.style.overflow = state.savedOverflow;
    document.documentElement.style.overflow = state.savedHtmlOverflow;
    document.body.removeAttribute("data-dig-open");
    window.scrollTo(0, state.savedScrollY);
    var trigger = state.trigger;
    state.overlay = null;
    state.iframe = null;
    state.trigger = null;
    if (trigger && typeof trigger.focus === "function") trigger.focus();
    document.dispatchEvent(new CustomEvent("dig-crates:closed", { detail: { storeSlug: state.slug } }));
    state.slug = null;
  }

  function openOverlay(slug, trigger) {
    if (state.open || !isValidSlug(slug)) return;
    state.open = true;
    state.slug = slug;
    state.trigger = trigger || document.activeElement;
    state.savedScrollY = window.scrollY || window.pageYOffset || 0;
    state.savedOverflow = document.body.style.overflow;
    state.savedHtmlOverflow = document.documentElement.style.overflow;

    var overlay = el("div", { role: "dialog", "aria-modal": "true", "aria-label": "Record crates", "data-dig-overlay": slug }, {
      position: "fixed", inset: "0", zIndex: "2147483647", background: "rgba(0,0,0,0.6)", display: "flex", flexDirection: "column",
    });
    var bar = el("div", {}, { position: "absolute", top: "max(8px, env(safe-area-inset-top))", right: "max(8px, env(safe-area-inset-right))", zIndex: "2", display: "flex", gap: "8px" });
    var closeBtn = el("button", { type: "button", "aria-label": "Close record crates", "data-dig-close": "" }, {
      minWidth: "44px", minHeight: "44px", border: "0", borderRadius: "999px", background: "rgba(255,255,255,0.92)", color: "#111", font: "600 14px/1 system-ui, sans-serif", cursor: "pointer", padding: "0 14px", boxShadow: "0 2px 10px rgba(0,0,0,0.3)",
    });
    closeBtn.textContent = "Close ✕";
    closeBtn.addEventListener("click", closeOverlay);
    bar.appendChild(closeBtn);

    var loader = el("div", { "data-dig-loader": "", role: "status" }, {
      position: "absolute", inset: "0", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", font: "16px system-ui, sans-serif", pointerEvents: "none",
    });
    loader.textContent = "Loading crates…";

    var iframe = el("iframe", { title: "Browse our record crates", src: embedUrl(slug, "overlay"), allow: "autoplay", "data-dig-iframe": slug }, {
      border: "0", width: "100%", height: "100%", flex: "1", background: "transparent", opacity: "0", transition: "opacity 200ms ease",
    });
    iframe.addEventListener("load", function () {
      // If the app never says READY (blocked framing, network), surface a recoverable error.
      state.readyTimer = window.setTimeout(function () {
        if (!state.open || iframe.style.opacity === "1") return;
        loader.style.pointerEvents = "auto";
        loader.innerHTML = "";
        var box = el("div", {}, { background: "#fff", color: "#111", padding: "20px", borderRadius: "12px", maxWidth: "360px", textAlign: "center", font: "15px/1.4 system-ui, sans-serif" });
        var p = el("p", {}, { margin: "0 0 12px" });
        p.textContent = "The crates could not be loaded here.";
        var link = el("a", { href: appOrigin + "/store/" + encodeURIComponent(slug), target: "_blank", rel: "noopener" }, { display: "inline-block", margin: "0 8px 0 0" });
        link.textContent = "Open in a new tab";
        var retry = el("button", { type: "button" }, { font: "inherit", cursor: "pointer" });
        retry.textContent = "Close";
        retry.addEventListener("click", closeOverlay);
        box.appendChild(p);
        box.appendChild(link);
        box.appendChild(retry);
        loader.appendChild(box);
      }, READY_TIMEOUT_MS);
    });

    overlay.appendChild(loader);
    overlay.appendChild(iframe);
    overlay.appendChild(bar);
    document.body.appendChild(overlay);
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    document.body.setAttribute("data-dig-open", slug);
    state.overlay = overlay;
    state.iframe = iframe;
    closeBtn.focus();
    document.dispatchEvent(new CustomEvent("dig-crates:opened", { detail: { storeSlug: slug } }));
  }

  // Focus containment: Tab cycles between the outer close button and the iframe.
  document.addEventListener("keydown", function (e) {
    if (!state.open) return;
    if (e.key === "Escape") {
      e.preventDefault();
      closeOverlay();
      return;
    }
    if (e.key === "Tab" && state.overlay) {
      var focusables = [state.iframe, state.overlay.querySelector("[data-dig-close]")];
      var active = document.activeElement;
      var idx = focusables.indexOf(active);
      if (idx === -1) {
        e.preventDefault();
        focusables[0].focus();
      } else if (e.shiftKey && idx === 0) {
        e.preventDefault();
        focusables[1].focus();
      } else if (!e.shiftKey && idx === focusables.length - 1) {
        e.preventDefault();
        focusables[0].focus();
      }
    }
  }, true);

  // Event delegation: works for triggers added after the script loaded.
  document.addEventListener("click", function (e) {
    var target = e.target && e.target.closest ? e.target.closest("[data-dig-open]") : null;
    if (!target) return;
    e.preventDefault();
    openOverlay(target.getAttribute("data-dig-open"), target);
  });

  window.addEventListener("message", function (event) {
    var inlineFrames = document.querySelectorAll("iframe[data-dig-inline-frame]");
    var iframe = null;
    if (state.iframe && isMessageFrom(event, state.iframe)) iframe = state.iframe;
    for (var i = 0; !iframe && i < inlineFrames.length; i++) if (isMessageFrom(event, inlineFrames[i])) iframe = inlineFrames[i];
    if (!iframe) {
      return; // unknown sender or origin: ignored
    }
    var msg = event.data;
    switch (msg.type) {
      case "READY":
        if (iframe === state.iframe) {
          window.clearTimeout(state.readyTimer);
          iframe.style.opacity = "1";
          var loader = state.overlay && state.overlay.querySelector("[data-dig-loader]");
          if (loader && loader.parentNode) loader.parentNode.removeChild(loader);
          // The app has its own branded close control now; keep ours as a compact fallback.
          var outerClose = state.overlay && state.overlay.querySelector("[data-dig-close]");
          if (outerClose) {
            outerClose.textContent = "✕";
            outerClose.style.width = "44px";
            outerClose.style.padding = "0";
            outerClose.style.fontSize = "18px";
          }
          iframe.focus();
          post(iframe, { type: "FOCUS", storeSlug: msg.storeSlug });
        } else {
          iframe.style.opacity = "1";
        }
        break;
      case "REQUEST_CLOSE":
        if (iframe === state.iframe) closeOverlay();
        break;
      case "RESIZE":
        if (iframe.hasAttribute("data-dig-inline-frame") && typeof msg.height === "number" && isFinite(msg.height)) {
          var h = Math.max(MIN_INLINE, Math.min(MAX_INLINE, Math.round(msg.height)));
          var current = parseInt(iframe.style.height, 10) || 0;
          if (h > current) iframe.style.height = h + "px"; // grow-only, bounded: no resize loops
        }
        break;
      case "OPEN_DEMO_PRODUCT":
        document.dispatchEvent(new CustomEvent("dig-crates:demo-product", { detail: { storeSlug: msg.storeSlug, recordId: String(msg.recordId) } }));
        break;
      default:
        break;
    }
  });

  function mountInline(container) {
    if (container.getAttribute("data-dig-mounted") === "true") return;
    var slug = container.getAttribute("data-dig-inline");
    if (!isValidSlug(slug)) return;
    container.setAttribute("data-dig-mounted", "true");
    var minHeight = parseInt(window.getComputedStyle(container).minHeight, 10);
    var height = Math.max(MIN_INLINE, isFinite(minHeight) && minHeight > 0 ? minHeight : 650);
    var iframe = el("iframe", { title: "Browse our record crates", src: embedUrl(slug, "inline"), loading: "lazy", allow: "autoplay", "data-dig-inline-frame": slug }, {
      display: "block", width: "100%", height: height + "px", border: "0", opacity: "0", transition: "opacity 200ms ease", borderRadius: "inherit",
    });
    // Make sure the frame becomes visible even if READY is never received (e.g. older app build).
    iframe.addEventListener("load", function () { window.setTimeout(function () { iframe.style.opacity = "1"; }, 1500); });
    container.appendChild(iframe);
  }

  function mountAllInline() {
    var containers = document.querySelectorAll("[data-dig-inline]");
    for (var i = 0; i < containers.length; i++) mountInline(containers[i]);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mountAllInline);
  else mountAllInline();
  // Hosts built with client-side frameworks may (re)render containers later; mount those too.
  if (typeof MutationObserver === "function") {
    var pending = 0;
    new MutationObserver(function () {
      if (pending) return;
      pending = window.setTimeout(function () { pending = 0; mountAllInline(); }, 50);
    }).observe(document.documentElement, { childList: true, subtree: true });
  }

  window.__digCratesLauncher = { open: openOverlay, close: closeOverlay, mountInline: mountAllInline, appOrigin: appOrigin, version: VERSION };
})();
