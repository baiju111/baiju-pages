(function () {
  "use strict";

  var DEFAULTS = {
    preset: "cylinder",
    intro: "rise",
    cardWidth: 220,
    aspectRatio: "1",
    speed: 14,
    captions: true
  };

  var clamp = function (value, min, max) {
    return Math.max(min, Math.min(max, value));
  };

  var mod = function (value, length) {
    return ((value % length) + length) % length;
  };

  var shortestDelta = function (from, to) {
    return ((to - from + 540) % 360) - 180;
  };

  var normalizeAngle = function (angle) {
    return ((angle + 180) % 360 + 360) % 360 - 180;
  };

  var numberOr = function (value, fallback) {
    var parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  var ratioOr = function (value) {
    var text = String(value == null ? "1" : value).trim();
    return /^\d+(\.\d+)?(\s*\/\s*\d+(\.\d+)?)?$/.test(text) ? text : "1";
  };

  var pad = function (value) {
    return String(value).padStart(2, "0");
  };

  var CARD_MARKUP = [
    '<span class="cc-card-scale">',
    '  <span class="cc-intro">',
    '    <span class="cc-flip">',
    '      <span class="cc-face cc-face-front">',
    "      </span>",
    '      <span class="cc-face cc-face-back" aria-hidden="true">',
    '        <span class="cc-back-top">',
    '          <span class="cc-back-index"></span>',
    '          <span class="cc-back-mark" aria-hidden="true"></span>',
    "        </span>",
    '        <span class="cc-back-copy">',
    '          <span class="cc-back-title"></span>',
    '          <span class="cc-back-subtitle"></span>',
    "        </span>",
    "      </span>",
    "    </span>",
    "  </span>",
    "</span>"
  ].join("");

  var ARROW_SVG = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3L5 8l5 5"/></svg>';

  class CircularCarousel extends HTMLElement {
    static get observedAttributes() {
      return ["preset", "intro", "card-width", "aspect-ratio", "speed", "captions"];
    }

    constructor() {
      super();
      this._items = [];
      this._cards = [];
      this._indexEls = [];
      this._cardsByIndex = new Map();
      this._built = false;
      this._bound = false;
      this._ready = false;
      this._index = 0;
      this._angle = 0;
      this._radius = 0;
      this._step = 60;
      this._cardW = DEFAULTS.cardWidth;
      this._speed = DEFAULTS.speed;
      this._preset = DEFAULTS.preset;
      this._intro = DEFAULTS.intro;
      this._captions = DEFAULTS.captions;
      this._reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      this._inView = true;
      this._hover = false;
      this._keyboardFocus = false;
      this._lastInput = "pointer";
      this._dragging = false;
      this._drag = null;
      this._suppressClick = false;
      this._suppressTimer = 0;
      this._snapping = false;
      this._flipped = null;
      this._mode = null;
      this._raf = 0;
      this._resumeTimer = 0;
      this._introTimer = 0;
      this._lastTick = 0;
      this._snap = null;
      this._resizeObserver = null;
      this._intersectionObserver = null;
      this._abort = null;
      this._onMediaChange = this._onMediaChange.bind(this);
      this._onVisibility = this._onVisibility.bind(this);
      this._tick = this._tick.bind(this);
    }

    connectedCallback() {
      this._readConfig();
      if (!this._built) {
        this._build();
        this._built = true;
      }
      this._applyConfig();
      this._bind();
      this._observe();
      if (this._items.length) this._renderItems();
      else this._renderEmpty();
    }

    disconnectedCallback() {
      this._teardown();
    }

    attributeChangedCallback(name, oldValue, newValue) {
      if (!this._built || oldValue === newValue) return;
      this._readConfig();
      this._applyConfig();
      this._measure();
      this._paint();
      this._syncActive(false);
    }

    set items(value) {
      var next = Array.isArray(value) ? value : [];
      this._items = next
        .filter(function (item) {
          return item && item.src && item.title;
        })
        .map(function (item) {
          return {
            src: String(item.src),
            alt: item.alt ? String(item.alt) : String(item.title),
            title: String(item.title),
            subtitle: item.subtitle ? String(item.subtitle) : ""
          };
        });
      if (this._built) this._renderItems();
    }

    get items() {
      return this._items.slice();
    }

    get index() {
      return this._index;
    }

    next() {
      this._goTo(this._index + 1, false);
    }

    prev() {
      this._goTo(this._index - 1, false);
    }

    goTo(index) {
      this._goTo(index, false);
    }

    pause() {
      this._stopAuto();
    }

    play() {
      this._scheduleResume(200);
    }

    getState() {
      return {
        ready: this._ready,
        preset: this._preset,
        intro: this._intro,
        captions: this._captions,
        cardWidth: this._cardW,
        radius: Number(this._radius.toFixed(2)),
        speed: this._speed,
        index: this._index,
        angle: Number(this._angle.toFixed(2)),
        flipped: this._flipped,
        auto: this._mode === "auto",
        inView: this._inView,
        reduced: this._reduced,
        count: this._items.length
      };
    }

    _readConfig() {
      var preset = this.getAttribute("preset");
      var intro = this.getAttribute("intro");
      var width = numberOr(this.getAttribute("card-width"), DEFAULTS.cardWidth);
      var speed = numberOr(this.getAttribute("speed"), DEFAULTS.speed);

      this._preset = preset === "flat" ? "flat" : "cylinder";
      this._intro = ["rise", "fade", "none"].indexOf(intro) >= 0 ? intro : DEFAULTS.intro;
      this._cardW = clamp(width, 150, 360);
      this._ratio = ratioOr(this.getAttribute("aspect-ratio"));
      this._speed = clamp(speed, 4, 120);
      this._captions = this.getAttribute("captions") !== "false";
    }

    _applyConfig() {
      this.style.setProperty("--cc-card-width", this._cardW + "px");
      this.style.setProperty("--cc-ratio", this._ratio);
      this.dataset.preset = this._preset;
      this.dataset.intro = this._intro;
      this.dataset.captions = this._captions ? "true" : "false";
      if (this._stage) this._stage.dataset.preset = this._preset;
      this._updateCardLabels();
      if (!this._captions && this._flipped !== null) this._unflip(false);
      if (this._layoutCards) this._layoutCards();
    }

    _build() {
      this.classList.add("cc");
      this.setAttribute("role", "region");
      this.setAttribute("aria-roledescription", "carousel");
      if (!this.getAttribute("aria-label")) this.setAttribute("aria-label", "作品轮播");

      this.innerHTML = [
        '<div class="cc-viewport">',
        '  <div class="cc-stage" data-preset="cylinder">',
        '    <div class="cc-ring"></div>',
        '    <button class="cc-arrow cc-prev" type="button" aria-label="上一件作品">' + ARROW_SVG + "</button>",
        '    <button class="cc-arrow cc-next" type="button" aria-label="下一件作品">' + ARROW_SVG + "</button>",
        "  </div>",
        "</div>",
        '<div class="cc-caption" hidden>',
        '  <div class="cc-caption-copy">',
        '    <p class="cc-kicker"></p>',
        '    <h3><span class="cc-caption-title"></span><span class="cc-caption-subtitle"></span></h3>',
        "  </div>",
        '  <a class="cc-open" target="_blank" rel="noopener">OPEN <span aria-hidden="true">↗</span></a>',
        "</div>",
        '<div class="cc-index" role="group" aria-label="作品索引" hidden></div>',
        '<p class="cc-sr" aria-live="polite"></p>'
      ].join("");

      this._stage = this.querySelector(".cc-stage");
      this._ring = this.querySelector(".cc-ring");
      this._prev = this.querySelector(".cc-prev");
      this._next = this.querySelector(".cc-next");
      this._caption = this.querySelector(".cc-caption");
      this._kicker = this.querySelector(".cc-kicker");
      this._title = this.querySelector(".cc-caption-title");
      this._subtitle = this.querySelector(".cc-caption-subtitle");
      this._open = this.querySelector(".cc-open");
      this._indexBar = this.querySelector(".cc-index");
      this._status = this.querySelector(".cc-sr");

      this._next.querySelector("svg").style.transform = "scaleX(-1)";
    }

    _bind() {
      if (this._bound) return;
      this._bound = true;
      this._abort = new AbortController();
      var signal = this._abort.signal;
      var self = this;

      this.addEventListener("click", function (event) {
        self._onClick(event);
      }, { signal: signal });

      this.addEventListener("focusin", function (event) {
        self._onFocusIn(event);
      }, { signal: signal });

      this.addEventListener("focusout", function (event) {
        self._onFocusOut(event);
      }, { signal: signal });

      this.addEventListener("keydown", function (event) {
        self._onKeyDown(event);
      }, { signal: signal });

      this.addEventListener("pointerdown", function () {
        self._lastInput = "pointer";
        self._keyboardFocus = false;
      }, { signal: signal, capture: true });

      this._stage.addEventListener("pointerenter", function () {
        self._hover = true;
        self._stopAuto();
      }, { signal: signal });

      this._stage.addEventListener("pointerleave", function () {
        self._hover = false;
        if (self._drag && !self._drag.moved) self._drag = null;
        self._scheduleResume(1800);
      }, { signal: signal });

      this._stage.addEventListener("pointerdown", function (event) {
        self._onPointerDown(event);
      }, { signal: signal });

      this._stage.addEventListener("pointermove", function (event) {
        self._onPointerMove(event);
      }, { signal: signal });

      this._stage.addEventListener("pointerup", function (event) {
        self._onPointerUp(event);
      }, { signal: signal });

      this._stage.addEventListener("pointercancel", function (event) {
        self._onPointerUp(event);
      }, { signal: signal });

      this._prev.addEventListener("click", function () {
        self._lastInput = "pointer";
        self._goTo(self._index - 1, false);
      }, { signal: signal });

      this._next.addEventListener("click", function () {
        self._lastInput = "pointer";
        self._goTo(self._index + 1, false);
      }, { signal: signal });

      this._indexBar.addEventListener("click", function (event) {
        var button = event.target.closest(".cc-index-button");
        if (!button) return;
        self._lastInput = "pointer";
        self._goTo(Number(button.dataset.index), false);
      }, { signal: signal });

      document.addEventListener("visibilitychange", this._onVisibility, { signal: signal });

      document.addEventListener("keydown", function (event) {
        if (event.key === "Tab") self._lastInput = "keyboard";
      }, { signal: signal, capture: true });
    }

    _observe() {
      if (!this._resizeObserver && "ResizeObserver" in window) {
        this._resizeObserver = new ResizeObserver(() => {
          this._measure();
        });
        this._resizeObserver.observe(this._stage);
      }

      if (!this._intersectionObserver && "IntersectionObserver" in window) {
        this._intersectionObserver = new IntersectionObserver((entries) => {
          var entry = entries[0];
          this._inView = Boolean(entry && entry.isIntersecting);
          if (this._inView) this._scheduleResume(900);
          else this._stopAuto();
        }, { threshold: 0.16 });
        this._intersectionObserver.observe(this);
      }

      this._mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
      if (typeof this._mediaQuery.addEventListener === "function") {
        this._mediaQuery.addEventListener("change", this._onMediaChange);
      } else if (typeof this._mediaQuery.addListener === "function") {
        this._mediaQuery.addListener(this._onMediaChange);
      }
    }

    _teardown() {
      this._stopAuto();
      cancelAnimationFrame(this._raf);
      this._raf = 0;
      this._mode = null;
      this._snap = null;
      this._snapping = false;
      clearTimeout(this._resumeTimer);
      clearTimeout(this._introTimer);
      clearTimeout(this._suppressTimer);
      if (this._abort) this._abort.abort();
      this._abort = null;
      this._bound = false;
      if (this._resizeObserver) this._resizeObserver.disconnect();
      if (this._intersectionObserver) this._intersectionObserver.disconnect();
      if (this._mediaQuery) {
        if (typeof this._mediaQuery.removeEventListener === "function") {
          this._mediaQuery.removeEventListener("change", this._onMediaChange);
        } else if (typeof this._mediaQuery.removeListener === "function") {
          this._mediaQuery.removeListener(this._onMediaChange);
        }
      }
      this._resizeObserver = null;
      this._intersectionObserver = null;
      this._mediaQuery = null;
    }

    _renderEmpty() {
      if (!this._ring) return;
      this._ring.innerHTML = '<p class="cc-empty">暂无作品。</p>';
      this._caption.hidden = true;
      this._indexBar.hidden = true;
      this._ready = false;
    }

    _renderItems() {
      if (!this._built) return;
      cancelAnimationFrame(this._raf);
      this._raf = 0;
      this._mode = null;
      this._snap = null;
      this._snapping = false;
      this._stopAuto();
      this._unflip(false);
      this._ring.innerHTML = "";
      this._indexBar.innerHTML = "";
      this._cards = [];
      this._indexEls = [];
      this._cardsByIndex.clear();
      this._flipped = null;
      this._index = 0;
      this._angle = 0;

      if (!this._items.length) {
        this._renderEmpty();
        return;
      }

      this._caption.hidden = false;
      this._indexBar.hidden = false;

      var fragment = document.createDocumentFragment();
      for (var index = 0; index < this._items.length; index += 1) {
        var card = this._buildCard(this._items[index], index);
        fragment.appendChild(card);
        this._cards.push(card);
        this._cardsByIndex.set(index, card);
      }
      this._ring.appendChild(fragment);

      var indexFragment = document.createDocumentFragment();
      for (var i = 0; i < this._items.length; i += 1) {
        var button = document.createElement("button");
        button.type = "button";
        button.className = "cc-index-button";
        button.dataset.index = String(i);
        button.textContent = pad(i + 1);
        button.setAttribute("aria-label", "显示第 " + (i + 1) + " 件作品：" + this._items[i].title);
        button.setAttribute("aria-current", i === 0 ? "true" : "false");
        indexFragment.appendChild(button);
        this._indexEls.push(button);
      }
      this._indexBar.appendChild(indexFragment);

      this._setActive(0, false);
      this._ready = true;
      this._measure();
      this._paint();
      this._scheduleResume(this._reduced ? 0 : 1100);
    }
    _buildCard(item, index) {
      var card = document.createElement("button");
      card.type = "button";
      card.className = "cc-card";
      card.dataset.index = String(index);
      card.style.setProperty("--i", String(index));
      card.innerHTML = CARD_MARKUP;
      card._front = card.querySelector(".cc-face-front");
      card._back = card.querySelector(".cc-face-back");
      var img = document.createElement("img");
      img.alt = item.alt;
      img.draggable = false;
      img.decoding = "async";
      img.src = item.src;
      card._img = img;
      card._front.appendChild(img);
      img.addEventListener("error", function () {
        card.classList.add("is-image-error");
      }, { once: true });

      card.querySelector(".cc-back-index").textContent = "STUDY " + pad(index + 1);
      card.querySelector(".cc-back-title").textContent = item.title;
      card.querySelector(".cc-back-subtitle").textContent = item.subtitle;
      this._updateCardLabel(card, index);
      return card;
    }

    _updateCardLabel(card, index) {
      var item = this._items[index];
      if (!item) return;
      var label;
      if (!this._captions) {
        label = "聚焦作品 " + item.title + (item.subtitle ? "，" + item.subtitle : "");
      } else if (this._flipped === index) {
        label = "翻回作品 " + item.title + " 正面";
      } else {
        label = "聚焦并翻开作品 " + item.title + (item.subtitle ? "，" + item.subtitle : "");
      }
      card.setAttribute("aria-label", label);
      if (this._captions) card.setAttribute("aria-pressed", this._flipped === index ? "true" : "false");
      else card.removeAttribute("aria-pressed");
    }

    _updateCardLabels() {
      if (!this._cards) return;
      for (var index = 0; index < this._cards.length; index += 1) {
        this._updateCardLabel(this._cards[index], index);
      }
    }

    _measure() {
      if (!this._stage || !this._cards.length) return;
      var stageWidth = this._stage.clientWidth;
      if (!stageWidth) return;
      var first = this._cards[0];
      var cardWidth = first.offsetWidth || this._cardW;
      if (!cardWidth) return;
      this._cardW = cardWidth;
      this._step = 360 / this._cards.length;
      var circumference = this._cards.length * cardWidth * 1.2;
      var radius = circumference / (2 * Math.PI);
      var maxRadius = Math.max(cardWidth * 0.7, stageWidth / 2 - cardWidth * 0.28);
      var minRadius = cardWidth * 0.72;
      this._radius = clamp(radius, minRadius, maxRadius);
      this._layoutCards();
      this._paint();
      this._syncActive(false);
    }

    _layoutCards() {
      if (!this._cards.length) return;
      if (this._preset === "cylinder") {
        this._ring.style.transform = "none";
      }
    }

    _paint() {
      if (!this._cards.length) return;
      var count = this._cards.length;
      var step = this._step;
      var angle = this._angle;

      if (this._preset === "cylinder") {
        this._ring.style.transform = "none";
        for (var index = 0; index < count; index += 1) {
          var card = this._cards[index];
          var absolute = index * step + angle;
          var rad = (absolute * Math.PI) / 180;
          var depth = Math.cos(rad);
          var x = Math.sin(rad) * this._radius;
          var z = Math.cos(rad) * this._radius;
          var face = normalizeAngle(absolute) * 0.62;
          var opacity = depth > 0 ? 0.52 + 0.48 * depth : 0;
          card.style.transform =
            "translate(-50%, -50%) translateX(" + x.toFixed(2) + "px) translateZ(" + z.toFixed(2) + "px) rotateY(" + face.toFixed(2) + "deg)";
          card.style.opacity = opacity.toFixed(3);
          card.style.pointerEvents = opacity > 0.08 ? "auto" : "none";
          card.style.zIndex = String(Math.round(depth * 80) + 100);
        }
      } else {
        this._ring.style.transform = "none";
        for (var flatIndex = 0; flatIndex < count; flatIndex += 1) {
          var flatCard = this._cards[flatIndex];
          var flatAngle = normalizeAngle(flatIndex * step + angle);
          var distance = Math.abs(flatAngle) / step;
          var offset = (flatAngle / step) * (this._cardW * 1.1);
          var scale = distance < 0.55 ? 1.05 : 1 - Math.min(distance, 2.4) * 0.055;
          var flatOpacity = Math.max(0, 1 - Math.max(0, distance - 0.8) * 0.42);
          flatCard.style.transform =
            "translate(-50%, -50%) translateX(" + offset + "px) scale(" + scale + ")";
          flatCard.style.opacity = flatOpacity.toFixed(3);
          flatCard.style.pointerEvents = flatOpacity > 0.1 ? "auto" : "none";
          flatCard.style.zIndex = String(Math.round((3 - Math.min(distance, 3)) * 30) + 100);
        }
      }
    }

    _activeIndex() {
      if (!this._cards.length) return 0;
      return mod(Math.round(-this._angle / this._step), this._cards.length);
    }

    _syncActive(announce) {
      if (!this._cards.length) return;
      var next = this._activeIndex();
      if (next === this._index) return;
      this._setActive(next, announce);
    }

    _setActive(index, announce) {
      if (!this._items.length) return;
      index = mod(index, this._items.length);
      this._index = index;

      for (var i = 0; i < this._cards.length; i += 1) {
        this._cards[i].classList.toggle("is-active", i === index);
      }
      for (var j = 0; j < this._indexEls.length; j += 1) {
        this._indexEls[j].setAttribute("aria-current", j === index ? "true" : "false");
      }

      var item = this._items[index];
      this._kicker.textContent = "STUDY " + pad(index + 1) + " / " + pad(this._items.length);
      this._title.textContent = item.title;
      this._subtitle.textContent = item.subtitle;
      this._open.href = item.src;
      this._open.setAttribute("aria-label", "打开 " + item.title + " 原始 SVG");

      if (announce && this._status) {
        this._status.textContent = "第 " + (index + 1) + " 件，共 " + this._items.length + " 件：" + item.title + (item.subtitle ? "，" + item.subtitle : "");
      }

      this.dispatchEvent(new CustomEvent("cc-change", {
        detail: { index: index, item: item }
      }));
    }

    _onClick(event) {
      if (this._suppressClick) {
        this._suppressClick = false;
        return;
      }

      var card = event.target.closest(".cc-card");
      if (card) {
        if (this._snapping) return;
        var index = Number(card.dataset.index);
        if (this._flipped === index) {
          this._unflip(true);
          return;
        }
        this._goTo(index, this._captions);
        return;
      }

      var indexButton = event.target.closest(".cc-index-button");
      if (indexButton) {
        this._goTo(Number(indexButton.dataset.index), false);
      }
    }

    _onFocusIn(event) {
      if (this._lastInput !== "keyboard") return;
      this._keyboardFocus = true;
      this._stopAuto();
      var card = event.target.closest(".cc-card");
      if (card && !this._snapping) {
        this._goTo(Number(card.dataset.index), false);
      }
    }

    _onFocusOut(event) {
      if (this.contains(event.relatedTarget)) return;
      this._keyboardFocus = false;
      this._scheduleResume(2300);
    }

    _onKeyDown(event) {
      this._lastInput = "keyboard";
      this._keyboardFocus = true;
      this._stopAuto();

      if (event.key === "Escape" && this._flipped !== null) {
        event.preventDefault();
        this._unflip(true);
        return;
      }

      if (event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "Home" || event.key === "End") {
        if (event.target.closest(".cc-open")) return;
        event.preventDefault();
        var next = this._index;
        if (event.key === "ArrowLeft") next -= 1;
        else if (event.key === "ArrowRight") next += 1;
        else if (event.key === "Home") next = 0;
        else next = this._items.length - 1;
        this._goTo(next, false);
        var target = this._cards[mod(next, this._items.length)];
        if (target) target.focus({ preventScroll: true });
      }
    }

    _onPointerDown(event) {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      if (event.target.closest(".cc-arrow")) return;
      if (this._snapping) return;
      this._stopAuto();
      clearTimeout(this._resumeTimer);
      this._drag = {
        id: event.pointerId,
        startX: event.clientX,
        lastX: event.clientX,
        lastTime: performance.now(),
        startAngle: this._angle,
        velocity: 0,
        moved: false
      };
    }

    _onPointerMove(event) {
      var drag = this._drag;
      if (!drag || drag.id !== event.pointerId) return;
      var dx = event.clientX - drag.startX;
      if (!drag.moved && Math.abs(dx) > 5) {
        drag.moved = true;
        this._dragging = true;
        this._stage.classList.add("is-dragging");
        if (this._flipped !== null) this._unflip(false);
        try {
          this._stage.setPointerCapture(event.pointerId);
        } catch (error) {}
      }
      if (!drag.moved) return;

      var now = performance.now();
      var dt = Math.max(1, now - drag.lastTime);
      var stepX = event.clientX - drag.lastX;
      drag.velocity = (stepX / dt) * 0.22;
      drag.lastX = event.clientX;
      drag.lastTime = now;
      this._angle = drag.startAngle + dx * 0.22;
      this._paint();
      this._syncActive(false);
    }

    _onPointerUp(event) {
      var drag = this._drag;
      if (!drag || drag.id !== event.pointerId) return;
      this._drag = null;
      this._dragging = false;
      this._stage.classList.remove("is-dragging");
      if (event.pointerType === "touch") this._hover = false;
      try {
        this._stage.releasePointerCapture(event.pointerId);
      } catch (error) {}

      if (!drag.moved) {
        this._scheduleResume(1800);
        return;
      }

      this._suppressClick = true;
      clearTimeout(this._suppressTimer);
      this._suppressTimer = setTimeout(() => {
        this._suppressClick = false;
      }, 360);

      var kick = clamp(drag.velocity * 120, -70, 70);
      this._angle += kick;
      this._paint();
      this._syncActive(false);
      this._snapToNearest(480);
    }

    _snapToNearest(duration) {
      if (!this._cards.length) return;
      var index = this._activeIndex();
      this._setActive(index, true);
      var target = this._targetForIndex(index);
      this._snapTo(target, duration, null);
    }

    _targetForIndex(index) {
      var base = -index * this._step;
      return this._angle + shortestDelta(this._angle, base);
    }

    _goTo(index, flip) {
      if (!this._items.length || this._snapping) return;
      index = mod(index, this._items.length);

      if (this._flipped !== null && this._flipped !== index) {
        this._unflip(false);
      }

      var target = this._targetForIndex(index);

      if (index === this._index && !flip && Math.abs(shortestDelta(this._angle, target)) < 0.5) {
        this._setActive(index, true);
        this._scheduleResume(2000);
        return;
      }

      this._setActive(index, true);

      if (flip && Math.abs(target - this._angle) < 0.1) {
        this._flip(index);
        return;
      }

      this._snapTo(target, this._reduced ? 0 : 480, () => {
        if (flip) this._flip(index);
        else this._scheduleResume(2300);
      });
    }

    _snapTo(target, duration, callback) {
      this._stopAuto();
      this._snapping = true;
      clearTimeout(this._resumeTimer);
      if (!duration) {
        this._angle = target;
        this._paint();
        this._syncActive(false);
        this._snapping = false;
        if (callback) callback();
        else this._scheduleResume(2300);
        return;
      }

      this._mode = "snap";
      this._snap = {
        from: this._angle,
        to: target,
        start: performance.now(),
        duration: duration,
        callback: callback
      };
      this._lastTick = performance.now();
      this._raf = requestAnimationFrame(this._tick);
    }

    _tick(now) {
      this._raf = 0;
      if (this._mode === "auto") {
        var dt = clamp((now - this._lastTick) / 1000, 0.001, 0.05);
        this._lastTick = now;
        this._angle -= (360 / this._speed) * dt;
        this._paint();
        this._syncActive(false);
        this._raf = requestAnimationFrame(this._tick);
        return;
      }

      if (this._mode === "snap" && this._snap) {
        var progress = clamp((now - this._snap.start) / this._snap.duration, 0, 1);
        var eased = 1 - Math.pow(1 - progress, 3);
        this._angle = this._snap.from + (this._snap.to - this._snap.from) * eased;
        this._paint();
        if (progress < 1) {
          this._raf = requestAnimationFrame(this._tick);
          return;
        }

        var callback = this._snap.callback;
        this._snap = null;
        this._mode = null;
        this._snapping = false;
        this._paint();
        this._syncActive(false);
        if (callback) callback();
        else this._scheduleResume(2300);
      }
    }

    _startAuto() {
      if (this._mode === "auto" || this._mode === "snap") return;
      if (!this._ready || this._items.length < 2) return;
      if (this._reduced || !this._inView || this._hover || this._keyboardFocus) return;
      if (this._dragging || this._snapping || this._flipped !== null) return;
      if (document.visibilityState === "hidden") return;
      this._mode = "auto";
      this._lastTick = performance.now();
      this._raf = requestAnimationFrame(this._tick);
    }

    _stopAuto() {
      if (this._mode !== "auto") return;
      cancelAnimationFrame(this._raf);
      this._raf = 0;
      this._mode = null;
    }

    _scheduleResume(delay) {
      clearTimeout(this._resumeTimer);
      if (this._reduced || !this._inView || this._hover || this._keyboardFocus) return;
      if (this._dragging || this._snapping || this._flipped !== null) return;
      if (document.visibilityState === "hidden") return;
      var wait = typeof delay === "number" ? delay : 2300;
      this._resumeTimer = setTimeout(() => {
        this._startAuto();
      }, wait);
    }

    _flip(index) {
      if (!this._captions || !this._cards[index]) return;
      if (this._flipped === index) {
        this._unflip(true);
        return;
      }
      if (this._flipped !== null && this._cards[this._flipped]) {
        var previous = this._cards[this._flipped];
        previous.classList.remove("is-flipped");
        previous.setAttribute("aria-pressed", "false");
        previous._front.setAttribute("aria-hidden", "false");
        previous._back.setAttribute("aria-hidden", "true");
        this._updateCardLabel(previous, this._flipped);
      }

      var card = this._cards[index];
      this._flipped = index;
      this._stopAuto();
      clearTimeout(this._resumeTimer);
      card.classList.add("is-flipped");
      card.setAttribute("aria-pressed", "true");
      card._front.setAttribute("aria-hidden", "true");
      card._back.setAttribute("aria-hidden", "false");
      this._updateCardLabel(card, index);

      if (this._status) {
        var item = this._items[index];
        this._status.textContent = "已翻开 " + item.title + (item.subtitle ? "，" + item.subtitle : "");
      }
      this.dispatchEvent(new CustomEvent("cc-flip", {
        detail: { index: index, flipped: true, item: this._items[index] }
      }));
    }

    _unflip(announce) {
      if (this._flipped === null) return;
      var index = this._flipped;
      var card = this._cards[index];
      this._flipped = null;
      if (card) {
        card.classList.remove("is-flipped");
        card.setAttribute("aria-pressed", "false");
        card._front.setAttribute("aria-hidden", "false");
        card._back.setAttribute("aria-hidden", "true");
        this._updateCardLabel(card, index);
      }
      if (announce && this._status) {
        this._status.textContent = "已翻回作品正面。";
      }
      this.dispatchEvent(new CustomEvent("cc-flip", {
        detail: { index: index, flipped: false, item: this._items[index] }
      }));
      this._scheduleResume(2500);
    }

    _onMediaChange(event) {
      this._reduced = event.matches;
      if (this._reduced) {
        this._stopAuto();
        if (this._flipped !== null) this._unflip(false);
      } else {
        this._scheduleResume(1200);
      }
    }

    _onVisibility() {
      if (document.visibilityState === "hidden") {
        this._stopAuto();
      } else {
        this._scheduleResume(800);
      }
    }
  }

  if (!customElements.get("circular-carousel")) {
    customElements.define("circular-carousel", CircularCarousel);
  }
})();
