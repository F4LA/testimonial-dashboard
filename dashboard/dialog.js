/**
 * Testimonial Dashboard — confirmation dialog
 *
 * Used ONLY for stage moves that are outward-facing or hard to reverse:
 * firing the fan-out (Invited), Published, and Declined / Dropped.
 *
 * Deliberately not used on ordinary moves. A confirmation that appears on
 * every action stops being read, and then it protects nothing — so the value
 * of this dialog depends on how rarely it appears.
 *
 * The same dialog will back drag-and-drop when that lands: the drag replaces
 * the button as the way to *initiate* a move, and lands here unchanged.
 */
(function (root) {
  "use strict";

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  /**
   * @param {Object} o
   * @param {string} o.title
   * @param {string} o.body            what is about to happen, in plain words
   * @param {Array}  [o.consequences]  bullet list of the visible effects
   * @param {string} [o.confirmLabel]
   * @param {string} [o.tone]          "danger" | "normal"
   * @param {Object} [o.input]         { label, placeholder, required }
   * @returns {Promise<null|{value:string}>}  null when cancelled
   */
  function confirm(o) {
    return new Promise(function (resolve) {
      var wrap = document.createElement("div");
      wrap.className = "modal";
      wrap.innerHTML =
        '<div class="modal__box' + (o.tone === "danger" ? " modal__box--danger" : "") + '" role="dialog" aria-modal="true">' +
          '<h3 class="modal__title">' + esc(o.title) + "</h3>" +
          '<p class="modal__body">' + esc(o.body) + "</p>" +
          (o.consequences && o.consequences.length
            ? '<ul class="modal__list">' + o.consequences.map(function (c) {
                return "<li>" + esc(c) + "</li>";
              }).join("") + "</ul>"
            : "") +
          (o.select
            ? '<label class="modal__label">' + esc(o.select.label) + "</label>" +
              '<select id="modalSelect">' +
                '<option value="">' + esc(o.select.placeholder || "— choose —") + "</option>" +
                o.select.options.map(function (op) {
                  return '<option value="' + esc(op.value) + '">' + esc(op.label) + "</option>";
                }).join("") +
              "</select>"
            : "") +
          (o.input
            ? '<label class="modal__label">' + esc(o.input.label) + "</label>" +
              '<input id="modalInput" type="text" placeholder="' + esc(o.input.placeholder || "") + '">'
            : "") +
          (o.select || o.input ? '<div id="modalErr" class="modal__err"></div>' : "") +
          '<div class="modal__actions">' +
            '<button id="modalCancel" class="btn">Cancel</button>' +
            '<button id="modalOk" class="btn ' + (o.tone === "danger" ? "btn--danger" : "btn--ok") + '">' +
              esc(o.confirmLabel || "Confirm") + "</button>" +
          "</div>" +
        "</div>";

      function close(result) {
        document.removeEventListener("keydown", onKey);
        if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
        resolve(result);
      }
      function onKey(e) {
        if (e.key === "Escape") close(null);
      }

      document.body.appendChild(wrap);
      document.addEventListener("keydown", onKey);

      wrap.addEventListener("click", function (e) {
        if (e.target === wrap) close(null);            // click the backdrop
      });
      wrap.querySelector("#modalCancel").addEventListener("click", function () { close(null); });
      wrap.querySelector("#modalOk").addEventListener("click", function () {
        var val = "", selected = "";
        if (o.select) {
          var sel = wrap.querySelector("#modalSelect");
          selected = sel.value;
          if (!selected) {
            wrap.querySelector("#modalErr").textContent = "Choose one first.";
            sel.focus();
            return;
          }
        }
        if (o.input) {
          var node = wrap.querySelector("#modalInput");
          val = node.value.trim();
          if (o.input.required && !val) {
            wrap.querySelector("#modalErr").textContent = "This is required.";
            node.focus();
            return;
          }
        }
        close({ value: val, selected: selected });
      });

      var focusTarget = wrap.querySelector(o.select ? "#modalSelect" : (o.input ? "#modalInput" : "#modalOk"));
      if (focusTarget) focusTarget.focus();
    });
  }

  /* ---------- Feedback ---------- */

  var toastHost = null;

  /**
   * A fixed toast, visible regardless of scroll position.
   *
   * The client card runs several screens long, and the result element used to
   * sit at the very bottom of it — so an error from a button near the top
   * rendered far out of view and read as "nothing happened". Errors stay until
   * dismissed; successes fade.
   */
  function toast(message, kind) {
    if (!toastHost) {
      toastHost = document.createElement("div");
      toastHost.className = "toasts";
      document.body.appendChild(toastHost);
    }
    var t = document.createElement("div");
    t.className = "toast toast--" + (kind || "info");
    t.innerHTML = '<span class="toast__msg"></span><button class="toast__x" aria-label="Dismiss">×</button>';
    t.querySelector(".toast__msg").textContent = message;
    t.querySelector(".toast__x").addEventListener("click", function () {
      if (t.parentNode) t.parentNode.removeChild(t);
    });
    toastHost.appendChild(t);
    if (kind === "ok" || kind === "info") {
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 6000);
    }
    return t;
  }

  /**
   * Report the outcome of an action in all the places it might be looked for:
   * a toast, beside the button that was clicked, and in the view's result
   * strip. Feedback that only exists somewhere off-screen is not feedback.
   */
  function feedback(btn, message, kind) {
    toast(message, kind);

    if (btn && btn.parentNode) {
      var slot = btn.parentNode.querySelector(":scope > .btnresult");
      if (!slot) {
        slot = document.createElement("span");
        slot.className = "btnresult";
        btn.parentNode.insertBefore(slot, btn.nextSibling);
      }
      slot.textContent = message;
      slot.className = "btnresult btnresult--" + (kind || "info");
    }

    ["cardResult", "queueResult", "boardResult"].forEach(function (id) {
      var n = document.getElementById(id);
      if (n) { n.textContent = message; n.className = "result " + (kind === "ok" ? "ok" : kind === "bad" ? "bad" : kind === "warn" ? "warn" : ""); }
    });
  }

  root.Dialog = { confirm: confirm, toast: toast, feedback: feedback };
})(typeof window !== "undefined" ? window : this);
