/**
 * The script that runs *inside* the sandboxed iframe.
 *
 * It is kept as a plain string rather than a module because the frame is
 * created with `sandbox="allow-scripts"` and no `allow-same-origin`, which puts
 * it on an opaque origin: it cannot import from us, read our DOM, or touch our
 * storage. `postMessage` is the only channel, in both directions.
 */
export const SANDBOX_BOOTSTRAP = String.raw`
(function () {
  var MAX_DEPTH = 4;
  var MAX_ITEMS = 100;
  var MAX_STRING = 10000;

  function typeTag(v) {
    return Object.prototype.toString.call(v).slice(8, -1);
  }

  function quote(s) {
    if (s.length > MAX_STRING) s = s.slice(0, MAX_STRING) + "… (truncated)";
    return "'" + s.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n") + "'";
  }

  function format(value, depth, seen) {
    depth = depth || 0;
    seen = seen || [];

    if (value === null) return "null";
    if (value === undefined) return "undefined";

    var t = typeof value;
    if (t === "string") return depth === 0 ? value : quote(value);
    if (t === "number" || t === "boolean") return String(value);
    if (t === "bigint") return String(value) + "n";
    if (t === "symbol") return value.toString();
    if (t === "function") {
      return (value.name ? "ƒ " + value.name : "ƒ anonymous") + "()";
    }

    if (value instanceof Error) {
      return value.stack || value.name + ": " + value.message;
    }

    if (seen.indexOf(value) !== -1) return "[Circular]";
    if (depth >= MAX_DEPTH) return Array.isArray(value) ? "[Array]" : "{…}";

    var nextSeen = seen.concat([value]);
    var tag = typeTag(value);

    if (tag === "Date") return value.toISOString();
    if (tag === "RegExp") return String(value);

    if (Array.isArray(value)) {
      var items = [];
      for (var i = 0; i < value.length && i < MAX_ITEMS; i++) {
        items.push(format(value[i], depth + 1, nextSeen));
      }
      if (value.length > MAX_ITEMS) items.push("… " + (value.length - MAX_ITEMS) + " more");
      return "[" + items.join(", ") + "]";
    }

    if (tag === "Map") {
      var entries = [];
      var mi = 0;
      value.forEach(function (v, k) {
        if (mi++ < MAX_ITEMS) {
          entries.push(format(k, depth + 1, nextSeen) + " => " + format(v, depth + 1, nextSeen));
        }
      });
      return "Map(" + value.size + ") {" + entries.join(", ") + "}";
    }

    if (tag === "Set") {
      var members = [];
      var si = 0;
      value.forEach(function (v) {
        if (si++ < MAX_ITEMS) members.push(format(v, depth + 1, nextSeen));
      });
      return "Set(" + value.size + ") {" + members.join(", ") + "}";
    }

    var keys = Object.keys(value);
    var pairs = [];
    for (var k = 0; k < keys.length && k < MAX_ITEMS; k++) {
      pairs.push(keys[k] + ": " + format(value[keys[k]], depth + 1, nextSeen));
    }
    if (keys.length > MAX_ITEMS) pairs.push("… " + (keys.length - MAX_ITEMS) + " more");
    var prefix = value.constructor && value.constructor.name && value.constructor.name !== "Object"
      ? value.constructor.name + " "
      : "";
    return prefix + "{" + pairs.join(", ") + "}";
  }

  var currentRun = 0;

  function emit(output) {
    parent.postMessage({ channel: "playground", type: "out", runId: currentRun, output: output }, "*");
  }

  // The parent sizes the frame to this, then scrolls the plain div wrapping it.
  // Relying on the frame to scroll its own document is what breaks on iOS,
  // where an iframe renders full content height and clips instead.
  var lastHeight = -1;
  function postHeight() {
    var height = Math.max(
      document.documentElement.scrollHeight,
      document.body ? document.body.scrollHeight : 0
    );
    if (height === lastHeight) return;
    lastHeight = height;
    parent.postMessage({ channel: "playground", type: "height", height: height }, "*");
  }

  var observer = null;
  if (typeof ResizeObserver !== "undefined") {
    observer = new ResizeObserver(postHeight);
    observer.observe(document.documentElement);
  }

  // In web mode this script runs inside <head>, where document.body does not
  // exist yet — so the body is observed as soon as it does. Without this the
  // preview only resizes on the slow poll below.
  function observeBody() {
    if (observer && document.body) observer.observe(document.body);
    postHeight();
  }
  if (document.body) observeBody();
  else document.addEventListener("DOMContentLoaded", observeBody);

  // Images and webfonts change layout after DOMContentLoaded.
  window.addEventListener("load", postHeight);

  // Covers content that changes without resizing the observed boxes, and
  // anything drawn from a timer after the run already finished.
  setInterval(postHeight, 500);

  function log(level) {
    return function () {
      var parts = [];
      for (var i = 0; i < arguments.length; i++) parts.push(format(arguments[i], 0, []));
      emit({ kind: "log", level: level, parts: parts });
    };
  }

  console.log = log("log");
  console.info = log("info");
  console.debug = log("log");
  console.warn = log("warn");
  console.error = log("error");

  // console.table renders as a real grid in the results pane rather than a
  // stringified object, which is most of the reason people reach for it.
  console.table = function (data) {
    if (data === null || typeof data !== "object") return log("log")(data);
    var rowsIn = Array.isArray(data) ? data : Object.keys(data).map(function (k) { return data[k]; });
    var index = Array.isArray(data) ? null : Object.keys(data);
    var cols = [];
    var scalarOnly = true;
    rowsIn.forEach(function (r) {
      if (r !== null && typeof r === "object" && !Array.isArray(r)) {
        scalarOnly = false;
        Object.keys(r).forEach(function (k) { if (cols.indexOf(k) === -1) cols.push(k); });
      }
    });
    if (scalarOnly) cols = ["Value"];
    var columns = [index ? "(index)" : "(index)"].concat(cols);
    var rows = rowsIn.slice(0, MAX_ITEMS).map(function (r, i) {
      var head = index ? index[i] : i;
      if (scalarOnly) return [head, format(r, 1, [])];
      return [head].concat(cols.map(function (c) {
        return r && typeof r === "object" && c in r ? format(r[c], 1, []) : "";
      }));
    });
    emit({ kind: "table", columns: columns, rows: rows, truncated: rowsIn.length > MAX_ITEMS });
  };

  var timers = {};
  console.time = function (label) { timers[label || "default"] = performance.now(); };
  console.timeEnd = function (label) {
    var key = label || "default";
    if (!(key in timers)) return;
    emit({ kind: "log", level: "log", parts: [key + ": " + (performance.now() - timers[key]).toFixed(2) + "ms"] });
    delete timers[key];
  };

  function reportError(err) {
    emit({
      kind: "error",
      message: err && err.stack ? String(err.stack) : String(err && err.message ? err.message : err),
    });
  }

  // Errors thrown out of setTimeout or a rejected promise arrive after the run
  // has already resolved; they are still tagged with the run that started them.
  window.addEventListener("error", function (e) {
    e.preventDefault();
    reportError(e.error || e.message);
  });
  window.addEventListener("unhandledrejection", function (e) {
    e.preventDefault();
    reportError(e.reason);
  });

  window.addEventListener("message", function (event) {
    var data = event.data;
    if (!data || data.channel !== "playground" || data.type !== "run") return;
    currentRun = data.runId;

    // Each run starts from a blank page, otherwise DOM from the previous run
    // accumulates in the preview.
    document.body.innerHTML = "";

    (async function () {
      try {
        var body = '"use strict";\n' + data.code;
        var AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
        var fn = new AsyncFunction(body);
        await fn();
      } catch (err) {
        reportError(err);
      }

      // The parent cannot read this document — the frame is on an opaque
      // origin — so whether there is anything to preview is reported from here.
      var rendered =
        document.body.childElementCount > 0 ||
        (document.body.textContent || "").trim().length > 0;

      postHeight();
      parent.postMessage(
        { channel: "playground", type: "done", runId: data.runId, rendered: rendered },
        "*"
      );
    })();
  });

  parent.postMessage({ channel: "playground", type: "ready" }, "*");
})();
`;
