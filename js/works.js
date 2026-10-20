(function () {
  "use strict";

  var items = [
    {
      src: "assets/works/study-01.svg",
      alt: "概念习作 COLUMN：墨黑底上的一列列暖白方块，中央被一道缺口切开",
      title: "COLUMN",
      subtitle: "柱状失序"
    },
    {
      src: "assets/works/study-02.svg",
      alt: "概念习作 CHECK：橙色底上的黑白棋盘方块，中心缺一格",
      title: "CHECK",
      subtitle: "棋盘缺口"
    },
    {
      src: "assets/works/study-03.svg",
      alt: "概念习作 ORBIT：暖白底上由墨黑方块组成的环，顶部有两个橙色方块",
      title: "ORBIT",
      subtitle: "轨道"
    },
    {
      src: "assets/works/study-04.svg",
      alt: "概念习作 GLYPH：橙色底上的黑色方块字母 P，内部留一个橙色方块",
      title: "GLYPH",
      subtitle: "字形"
    },
    {
      src: "assets/works/study-05.svg",
      alt: "概念习作 TARGET：墨黑底上的三层暖白方块方框，中心是橙色方块",
      title: "TARGET",
      subtitle: "靶场"
    },
    {
      src: "assets/works/study-06.svg",
      alt: "概念习作 SIGNAL：暖白底上由长短不一的墨黑方块条组成的信号场",
      title: "SIGNAL",
      subtitle: "信号场"
    }
  ];

  var carousel = document.getElementById("works-carousel");
  var fallback = document.getElementById("works-fallback");
  var section = document.getElementById("works");
  if (!carousel || !fallback || !section) return;

  function mount() {
    try {
      carousel.hidden = false;
      carousel.items = items;
      fallback.hidden = true;
      section.classList.add("is-enhanced");
      window.__WORKS_CAROUSEL__ = carousel;
    } catch (error) {
      carousel.hidden = true;
      fallback.hidden = false;
      section.classList.remove("is-enhanced");
      if (window.console && console.error) console.error("Works carousel failed:", error);
    }
  }

  if (customElements.get("circular-carousel")) {
    mount();
  } else {
    customElements.whenDefined("circular-carousel").then(mount).catch(function (error) {
      if (window.console && console.error) console.error("Works carousel failed to define:", error);
    });
  }
})();
