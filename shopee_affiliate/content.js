/**
 * content.js v4 - Shopee Product Scraper (DOM-based)
 *
 * Chạy trên shopee.vn shop page.
 * Nhận commissionPercent từ popup (đã đọc từ affiliate page).
 * Flow: Click "Tất cả sản phẩm" → "Bán chạy" → Quét DOM tất cả trang.
 */

(function () {
  'use strict';

  var port = null;
  var isScraping = false;

  // ========== COMMUNICATION ==========

  chrome.runtime.onConnect.addListener(function (p) {
    if (p.name !== 'shopee-scraper') return;
    port = p;
    port.onMessage.addListener(function (msg) {
      if (msg.action === 'start' && !isScraping) {
        startScraping(msg.commissionPercent || 0);
      }
      if (msg.action === 'stop') isScraping = false;
    });
    port.onDisconnect.addListener(function () {
      port = null;
      isScraping = false;
    });
  });

  function send(data) {
    try { if (port) port.postMessage(data); } catch (e) { }
  }

  // ========== UTILITIES ==========

  function delay(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function randomDelay(min, max) {
    return delay((min || 2000) + Math.random() * ((max || 4000) - (min || 2000)));
  }

  // ========== SHOP NAME ==========

  function getShopName() {
    var m = window.location.pathname.match(/^\/([^/?#]+)/);
    if (m) {
      var name = m[1];
      var excluded = ['shop', 'product', 'search', 'daily_discover', 'mall', 'flash_sale', 'buyer', 'cart', 'user'];
      if (excluded.indexOf(name) === -1 && name.length >= 2) return decodeURIComponent(name);
    }
    var h1s = document.querySelectorAll('h1');
    for (var i = 0; i < h1s.length; i++) {
      var t = h1s[i].textContent.trim();
      if (t.length > 0 && t.length < 80) return t;
    }
    return 'Shopee_Shop';
  }

  // ========== CLICK TAB / SORT ==========

  /**
   * Tìm và click element có text khớp (text ngắn, visible)
   */
  async function clickByText(targets) {
    var candidates = document.querySelectorAll('a, button, div, span');
    for (var i = 0; i < candidates.length; i++) {
      var el = candidates[i];
      var text = (el.textContent || '').trim().toLowerCase();
      if (text.length > 40) continue;

      for (var t = 0; t < targets.length; t++) {
        if (text === targets[t].toLowerCase()) {
          var rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            el.click();
            await delay(2000);
            await waitForContentChange(5000);
            await delay(1000);
            return true;
          }
        }
      }
    }

    // Fallback: partial match
    for (var j = 0; j < candidates.length; j++) {
      var el2 = candidates[j];
      var text2 = (el2.textContent || '').trim().toLowerCase();
      if (text2.length > 40) continue;

      for (var t2 = 0; t2 < targets.length; t2++) {
        if (text2.indexOf(targets[t2].toLowerCase()) !== -1 && text2.length < 25) {
          var rect2 = el2.getBoundingClientRect();
          if (rect2.width > 0 && rect2.height > 0) {
            el2.click();
            await delay(2000);
            await waitForContentChange(5000);
            await delay(1000);
            return true;
          }
        }
      }
    }

    return false;
  }

  // ========== PRICE PARSING ==========

  function parsePrice(text) {
    if (!text) return 0;
    // Lấy phần trước dấu '-' (tránh giá range)
    var s = text.split('-')[0].replace(/[₫đ\s]/gi, '').trim();
    // "175k" → 175000
    if (/[\d,.]+k/i.test(s)) {
      return Math.round(parseFloat(s.replace(/k/i, '').replace(/\./g, '').replace(/,/g, '.')) * 1000);
    }
    // "175.420" → 175420 (dấu chấm = phân cách hàng nghìn VN)
    return parseInt(s.replace(/\./g, '').replace(/,/g, '')) || 0;
  }

  // ========== FIND PRODUCT CARDS ==========

  function findProductCards() {
    var links = document.querySelectorAll('a[href*="-i."]');
    var cards = new Map();

    for (var i = 0; i < links.length; i++) {
      var href = links[i].getAttribute('href') || '';
      if (href.length < 10 || cards.has(href)) continue;

      // Walk up DOM để tìm card container
      var card = links[i];
      for (var d = 0; d < 8; d++) {
        if (!card.parentElement) break;
        var parent = card.parentElement;
        if (parent.querySelectorAll('a[href*="-i."]').length > 1) break;
        card = parent;
      }

      cards.set(href, { element: card, link: links[i], href: href });
    }

    return Array.from(cards.values());
  }

  // ========== EXTRACT PRODUCT FROM DOM CARD ==========

  function extractProduct(cardInfo, shopName, commissionPercent) {
    var card = cardInfo.element;
    var fullText = card.textContent || '';

    var product = {
      name: '',
      shopName: shopName,
      price: 0,
      commission: 0,
      commissionPercent: commissionPercent,
      monthlySales: 0,
      url: cardInfo.href,
      itemId: 0,
      shopId: 0
    };

    // IDs từ URL
    var idMatch = (cardInfo.href || '').match(/-i\.(\d+)\.(\d+)/);
    if (idMatch) {
      product.shopId = parseInt(idMatch[1]);
      product.itemId = parseInt(idMatch[2]);
    }

    // === TÊN SẢN PHẨM ===
    var mainLink = cardInfo.link;
    if (mainLink) {
      product.name = mainLink.getAttribute('aria-label') || mainLink.getAttribute('title') || '';
    }
    if (!product.name) {
      var img = card.querySelector('img[alt]');
      if (img && img.alt && img.alt.length > 5 && !/avatar|logo/i.test(img.alt)) {
        product.name = img.alt;
      }
    }
    if (!product.name) {
      var walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT, null, false);
      var longest = '';
      while (walker.nextNode()) {
        var t = walker.currentNode.textContent.trim();
        if (t.length > longest.length && t.length > 5 && t.length < 300 &&
          !t.includes('₫') && !/đã bán/i.test(t) && !/hoa hồng/i.test(t) &&
          !/^(Mall|mall|MALL)$/.test(t) && !/^\d+[,.k%]/.test(t)) {
          longest = t;
        }
      }
      product.name = longest;
    }
    product.name = product.name.replace(/\s+/g, ' ').trim();

    // === GIÁ TIỀN ===
    // Duyệt từng element CON trong card, tìm element ngắn chứa ₫/đ → lấy số trước chữ đ.
    // Cách này tránh lỗi nối text (ví dụ "139.00099.000₫" khi 2 giá nằm sát nhau).
    // Lấy giá thấp nhất = giá sau giảm (discount price).
    var prices = [];
    var priceEls = card.querySelectorAll('*');
    for (var e = 0; e < priceEls.length; e++) {
      var elText = (priceEls[e].textContent || '').trim();
      if (elText.length < 3 || elText.length > 40) continue;
      if (!/[₫đ]/.test(elText)) continue;
      var nums = elText.match(/\d{1,3}(?:\.\d{3})+/g);
      if (nums) {
        for (var n = 0; n < nums.length; n++) {
          var pv = parseInt(nums[n].replace(/\./g, '')) || 0;
          if (pv >= 1000) prices.push(pv);
        }
      }
      // Giá không có dấu chấm (ví dụ "₫99000")
      if (!nums) {
        var plainNums = elText.match(/\d{4,9}/g);
        if (plainNums) {
          for (var pn = 0; pn < plainNums.length; pn++) {
            var ppv = parseInt(plainNums[pn]) || 0;
            if (ppv >= 1000) prices.push(ppv);
          }
        }
      }
    }
    // Fallback: fullText scan với lookbehind (tránh dính số từ tên SP)
    if (prices.length === 0) {
      var pm;
      var rx1 = /(?<!\d)(\d{1,3}(?:\.\d{3})+)\s*[₫đ]/g;
      while ((pm = rx1.exec(fullText)) !== null) {
        var v1 = parseInt(pm[1].replace(/\./g, '')) || 0;
        if (v1 >= 1000) prices.push(v1);
      }
      var rx2 = /[₫đ]\s*(\d{1,3}(?:\.\d{3})+)/g;
      while ((pm = rx2.exec(fullText)) !== null) {
        var v2 = parseInt(pm[1].replace(/\./g, '')) || 0;
        if (v2 >= 1000) prices.push(v2);
      }
    }
    if (prices.length > 0) {
      product.price = Math.min.apply(null, prices);
    }

    // === HOA HỒNG ===
    if (commissionPercent > 0 && product.price > 0) {
      product.commission = Math.round(product.price * commissionPercent / 100);
    }

    // === LƯỢT BÁN / THÁNG ===
    // Duyệt từng element CON trong card (tránh lấy nhầm lượt bán cấp shop/trang).
    // Chỉ xét element ngắn chứa "tháng" hoặc "bán" → đúng context lượt bán sản phẩm.
    // Chuyển thành số: "5k+" → 5000, "1,2k+" → 1200, "808" → 808
    var rawSales = '';
    var salesEls = card.querySelectorAll('*');
    for (var se = 0; se < salesEls.length; se++) {
      var sText = (salesEls[se].textContent || '').trim();
      if (sText.length < 3 || sText.length > 60) continue;
      if (!/th[áa]ng/i.test(sText) && !/b[áaà]n/i.test(sText)) continue;

      // Pattern 1: "X/tháng" hoặc "Đã bán X/tháng"
      var sm = sText.match(/([\d,.]+\s*(?:k\+?|tr\+?|K\+?|TR\+?)?)\s*\/\s*th[áa]ng/i);
      if (sm) { rawSales = sm[1].trim(); break; }
      // Pattern 2: "Đã bán X" (không có /tháng)
      var sm2 = sText.match(/[Đđ][ãạa]\s*b[áaà]n\s+([\d,.]+\s*(?:k\+?|tr\+?|K\+?|TR\+?)?)/i);
      if (sm2) { rawSales = sm2[1].trim(); break; }
    }
    // Chuyển raw text → số
    if (rawSales) {
      var s = rawSales.replace(/\+/g, '').replace(/\s/g, '').toLowerCase();
      var kM = s.match(/([\d.,]+)k/);
      if (kM) {
        product.monthlySales = Math.round(parseFloat(kM[1].replace(',', '.')) * 1000);
      } else {
        var trM = s.match(/([\d.,]+)tr/);
        if (trM) {
          product.monthlySales = Math.round(parseFloat(trM[1].replace(',', '.')) * 1000000);
        } else {
          product.monthlySales = parseInt(s.replace(/[^\d]/g, '')) || 0;
        }
      }
    }

    return product;
  }

  // ========== SCROLL TO LOAD ==========

  async function scrollToLoadAll() {
    var step = window.innerHeight * 0.7;
    var lastH = 0, unchanged = 0;
    while (unchanged < 5) {
      window.scrollBy(0, step);
      await delay(1000);
      var h = document.body.scrollHeight;
      if (h === lastH) unchanged++; else unchanged = 0;
      lastH = h;
    }
    window.scrollTo(0, 0);
    await delay(500);
  }

  // ========== WAIT FOR CONTENT CHANGE ==========

  function waitForContentChange(timeout) {
    return new Promise(function (resolve) {
      var target = document.querySelector('a[href*="-i."]');
      var el = target || document.body;
      for (var i = 0; i < 10 && el.parentElement; i++) {
        el = el.parentElement;
        if (el.querySelectorAll('a[href*="-i."]').length >= 3) break;
      }
      var obs = new MutationObserver(function () { obs.disconnect(); resolve(true); });
      obs.observe(el, { childList: true, subtree: true });
      setTimeout(function () { obs.disconnect(); resolve(false); }, timeout || 8000);
    });
  }

  // ========== WAIT FOR PRODUCTS TO APPEAR ==========

  async function waitForProducts(timeout) {
    var start = Date.now();
    while (Date.now() - start < (timeout || 15000)) {
      var links = document.querySelectorAll('a[href*="-i."]');
      if (links.length >= 3) return true;
      await delay(500);
    }
    return document.querySelectorAll('a[href*="-i."]').length > 0;
  }

  // ========== PAGINATION ==========

  /** Đếm tổng trang từ "X/Y", element textContent, numbered buttons, hoặc href */
  function getTotalPages() {
    // Cách 1a: Tìm text node thuần "X/Y" (ví dụ "1/17")
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
    while (walker.nextNode()) {
      var t = walker.currentNode.textContent.trim();
      var m = t.match(/^(\d+)\s*\/\s*(\d+)$/);
      if (m) {
        var total = parseInt(m[2]);
        if (total >= 1 && total <= 500) return total;
      }
    }

    // Cách 1b: Tìm element có textContent "X/Y" (trường hợp số nằm trong child spans)
    // Ví dụ: <span><span>1</span>/<span>17</span></span> → textContent = "1/17"
    var smallEls = document.querySelectorAll('span, div, p, li');
    for (var se = 0; se < smallEls.length; se++) {
      var elText = (smallEls[se].textContent || '').replace(/\s+/g, '').trim();
      if (elText.length < 3 || elText.length > 10) continue;
      var m2 = elText.match(/^(\d+)\/(\d+)$/);
      if (m2) {
        var total2 = parseInt(m2[2]);
        if (total2 >= 1 && total2 <= 500) return total2;
      }
    }

    // Cách 2: Numbered buttons (lấy max)
    var max = 1;
    var btns = document.querySelectorAll('button, a');
    for (var i = 0; i < btns.length; i++) {
      var bt = btns[i].textContent.trim();
      if (!/^\d+$/.test(bt)) continue;
      var n = parseInt(bt);
      if (n < 1 || n > 500) continue;
      var par = btns[i].parentElement;
      if (!par) continue;
      var sibs = par.querySelectorAll('button, a');
      var numCount = 0;
      for (var j = 0; j < sibs.length; j++) {
        if (/^\d+$/.test(sibs[j].textContent.trim())) numCount++;
      }
      if (numCount >= 2 && n > max) max = n;
    }

    // Cách 3: Tìm page links từ href (page=N, Shopee dùng 0-indexed)
    var pageAs = document.querySelectorAll('a[href*="page="]');
    for (var pl = 0; pl < pageAs.length; pl++) {
      var href = pageAs[pl].getAttribute('href') || '';
      var pm = href.match(/[?&]page=(\d+)/);
      if (pm) {
        var pn = parseInt(pm[1]) + 1; // URL 0-indexed → display 1-indexed
        if (pn > max && pn <= 500) max = pn;
      }
    }

    return max;
  }

  /** Click nút trang tiếp theo */
  function clickNextPage() {
    // Cách 1: Tìm "X/Y" text, rồi tìm nút next (>) gần đó
    var allEls = document.querySelectorAll('*');
    for (var i = 0; i < allEls.length; i++) {
      if (allEls[i].children.length > 0) continue;
      var t = allEls[i].textContent.trim();
      if (!/^\d+\s*\/\s*\d+$/.test(t)) continue;

      // Tìm container chứa pagination
      var container = allEls[i].parentElement;
      for (var d = 0; d < 5 && container; d++) {
        var btns = container.querySelectorAll('button, [role="button"], a');
        if (btns.length >= 2) {
          // Click nút cuối cùng (next >)
          var nextBtn = btns[btns.length - 1];
          if (!nextBtn.disabled && !nextBtn.classList.contains('disabled')) {
            nextBtn.click();
            return true;
          }
        }
        container = container.parentElement;
      }
    }

    // Cách 2: Tìm nút > hoặc › hoặc SVG arrow
    var buttons = document.querySelectorAll('button, a, [role="button"]');
    for (var k = buttons.length - 1; k >= 0; k--) {
      var bt = buttons[k].textContent.trim();
      if ((bt === '>' || bt === '›' || bt === '→' || bt === '»') && !buttons[k].disabled) {
        buttons[k].click();
        return true;
      }
      // SVG arrow button (no text)
      if (bt === '' && buttons[k].querySelector('svg') && !buttons[k].disabled) {
        var rect = buttons[k].getBoundingClientRect();
        // Chỉ click nếu button ở bên phải (next, không phải prev)
        if (rect.x > window.innerWidth / 2) {
          buttons[k].click();
          return true;
        }
      }
    }

    // Cách 3: Tìm numbered buttons và click trang kế
    var numBtns = [];
    var curPage = 0;
    for (var m = 0; m < buttons.length; m++) {
      var num = buttons[m].textContent.trim();
      if (/^\d+$/.test(num)) {
        numBtns.push(buttons[m]);
        var style = window.getComputedStyle(buttons[m]);
        var bg = style.backgroundColor;
        if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent' && bg !== 'rgb(255, 255, 255)') {
          curPage = parseInt(num);
        }
      }
    }
    if (curPage > 0) {
      for (var n = 0; n < numBtns.length; n++) {
        if (numBtns[n].textContent.trim() === String(curPage + 1)) {
          numBtns[n].click();
          return true;
        }
      }
    }

    // Cách 4: Click <a> có href chứa page=nextPage (Shopee URL 0-indexed)
    var curUrlMatch = window.location.search.match(/[?&]page=(\d+)/);
    var curUrlPage = curUrlMatch ? parseInt(curUrlMatch[1]) : 0;
    var wantUrlPage = curUrlPage + 1;
    var pageAnchors = document.querySelectorAll('a[href*="page="]');
    for (var pa = 0; pa < pageAnchors.length; pa++) {
      var paHref = pageAnchors[pa].getAttribute('href') || '';
      var paMatch = paHref.match(/[?&]page=(\d+)/);
      if (paMatch && parseInt(paMatch[1]) === wantUrlPage) {
        pageAnchors[pa].click();
        return true;
      }
    }

    return false;
  }

  // ========== MAIN SCRAPING ==========

  async function startScraping(commissionPercent) {
    if (isScraping) return;
    isScraping = true;

    try {
      var shopName = getShopName();
      send({ type: 'info', shopName: shopName });

      // Doi san pham xuat hien
      send({ type: 'status', message: 'Đang đợi trang tải...' });
      await waitForProducts(15000);

      // Click "Tat ca san pham" (CHI nhan chinh xac, khong nhan "Tat ca" chung chung)
      send({ type: 'status', message: 'Đang chọn Tất cả sản phẩm...' });
      var tabClicked = await clickByText(['tất cả sản phẩm', 'all products']);
      if (tabClicked) {
        send({ type: 'status', message: 'Đã chọn Tất cả sản phẩm' });
        await waitForProducts(10000);
      }

      // URL da co ?sortBy=sales → khong can click "Ban chay"
      // Chi click neu URL khong co sortBy=sales
      if (window.location.search.indexOf('sortBy=sales') === -1) {
        send({ type: 'status', message: 'Đang chọn Bán chạy...' });
        var sortClicked = await clickByText(['bán chạy', 'top sales']);
        if (sortClicked) {
          await waitForProducts(10000);
        }
      }

      // Quet tung trang
      var allProducts = [];
      var seenUrls = new Set();
      var curPage = 1;
      var totalPages = 1;

      while (isScraping) {
        // Try-catch mỗi trang: lỗi thì bỏ qua, tiếp tục trang sau
        try {
          send({ type: 'status', message: 'Đang thu thập trang ' + curPage + '/' + totalPages + '...' });

          // SCROLL TRUOC de load het SP + hien thi pagination
          await scrollToLoadAll();
          await delay(1000);

          // Doc totalPages SAU KHI scroll (pagination o cuoi trang da hien)
          var newTotal = getTotalPages();
          if (newTotal > totalPages) totalPages = newTotal;

          // Thu thap san pham
          var cards = findProductCards();
          var newCount = 0;
          for (var i = 0; i < cards.length; i++) {
            var p = extractProduct(cards[i], shopName, commissionPercent);
            if (p.name && p.name.length > 2 && !seenUrls.has(p.url)) {
              seenUrls.add(p.url);
              allProducts.push(p);
              newCount++;
            }
          }

          send({
            type: 'progress',
            currentPage: curPage,
            totalPages: totalPages,
            productsCount: allProducts.length
          });

          // Gui partial data de background.js phuc hoi khi gap captcha/disconnect
          if (allProducts.length > 0) {
            send({
              type: 'partial',
              products: allProducts,
              shopName: shopName,
              currentPage: curPage,
              totalPages: totalPages
            });
          }
        } catch (pageErr) {
          send({ type: 'status', message: 'Lỗi trang ' + curPage + ': ' + (pageErr.message || '') + '. Bỏ qua.' });
        }

        if (curPage >= totalPages) break;
        if (!isScraping) break;

        // Chuyen trang (retry 3 lan, scroll xuong truoc moi lan retry)
        send({ type: 'status', message: 'Đang chuyển sang trang ' + (curPage + 1) + '...' });
        await randomDelay(2000, 4000);

        var nextClicked = false;
        for (var retryNext = 0; retryNext < 3 && !nextClicked; retryNext++) {
          if (retryNext > 0) {
            window.scrollTo(0, document.body.scrollHeight);
            await delay(2000);
          }
          nextClicked = clickNextPage();
        }

        // Fallback: scroll len dau trang roi thu lai (pagination mini o tren)
        if (!nextClicked) {
          window.scrollTo(0, 0);
          await delay(1000);
          nextClicked = clickNextPage();
        }

        if (!nextClicked) {
          send({ type: 'status', message: 'Không thể chuyển trang ' + (curPage + 1) + '. Dừng ở trang ' + curPage });
          break;
        }

        await waitForContentChange(10000);
        await delay(2000);
        curPage++;
      }

      if (allProducts.length === 0) {
        send({ type: 'error', message: 'Không tìm thấy sản phẩm nào.' });
        return;
      }

      // Hoan thanh
      send({
        type: 'complete',
        products: allProducts,
        shopName: shopName,
        totalProducts: allProducts.length,
        totalPages: curPage
      });

    } catch (error) {
      // Neu da co du lieu thi gui complete (khong mat du lieu khi gap captcha/loi)
      if (allProducts && allProducts.length > 0) {
        send({
          type: 'complete',
          products: allProducts,
          shopName: shopName || 'Unknown',
          totalProducts: allProducts.length,
          totalPages: curPage || 1
        });
      } else {
        send({ type: 'error', message: 'Lỗi: ' + (error.message || 'Không xác định') });
      }
    } finally {
      isScraping = false;
    }
  }

})();
