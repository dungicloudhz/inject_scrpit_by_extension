/**
 * background.js - Service Worker
 * Handles: Shop API, Batch processing (chay ngam khi popup dong)
 */

importScripts('xlsx-writer.js');

// === BATCH STATE ===
var batchRunning = false;
var batchStopRequested = false;
var processedShopIds = {};
var currentScrapePort = null;
var batchFileTimestamp = '';

function generateTimestamp() {
  var now = new Date();
  var p = function(n) { return n < 10 ? '0' + n : '' + n; };
  return now.getFullYear() + p(now.getMonth() + 1) + p(now.getDate()) + '_' + p(now.getHours()) + p(now.getMinutes()) + p(now.getSeconds());
}

function defaultState() {
  return {
    running: false,
    phase: '',
    mode: '',             // 'listing' hoac 'shopeeOffer'
    statusText: '',
    totalProducts: 0,
    currentProduct: 0,
    currentProductName: '',
    totalFiles: 0,
    totalSkipped: 0,
    totalFailed: 0,
    totalProcessed: 0,
    maxPages: 0,
    currentListingPage: 0,
    shopCurrentPage: 0,
    shopTotalPages: 0,
    shopProductsCount: 0,
    errorText: '',
    categoryName: '',
    batchTabId: 0,
    allProductLinks: [],
    resumeIndex: 0,
    savedFields: null,
    savedProcessedShopIds: {},
    totalCategories: 0,
    currentCategory: 0,
    currentCategoryName: ''
  };
}

var state = defaultState();

function updateState(updates) {
  for (var key in updates) {
    state[key] = updates[key];
  }
  chrome.storage.local.set({ batchState: state });
}

// === INJECTED FUNCTIONS (chay trong context trang web) ===

function extractFromAffiliatePage() {
  var result = { commissionPercent: 0, productUrl: '' };
  var allLinks = document.querySelectorAll('a');
  for (var i = 0; i < allLinks.length; i++) {
    var linkText = (allLinks[i].innerText || allLinks[i].textContent || '').trim();
    if (/xem\s*s[ảa]n\s*ph[ẩa]m/i.test(linkText)) {
      result.productUrl = allLinks[i].href || allLinks[i].getAttribute('href') || '';
      break;
    }
  }
  if (!result.productUrl) {
    for (var k = 0; k < allLinks.length; k++) {
      var href = allLinks[k].href || '';
      if (href.indexOf('shopee.vn') !== -1 && href.match(/-i\.\d+\.\d+/)) {
        result.productUrl = href;
        break;
      }
    }
  }
  var rowspanCells = document.querySelectorAll('td[rowspan]');
  for (var ti = 0; ti < rowspanCells.length; ti++) {
    var tdText = (rowspanCells[ti].textContent || '').trim();
    var pctMatch = tdText.match(/(\d+[.,]?\d*)\s*%/);
    if (pctMatch) {
      var pctVal = parseFloat(pctMatch[1].replace(',', '.'));
      if (pctVal > 0 && pctVal <= 50) {
        result.commissionPercent = pctVal;
        break;
      }
    }
  }
  return result;
}

function extractProductLinksFromListingPage() {
  var links = document.querySelectorAll('a[href*="/offer/product_offer/"]');
  var urls = [];
  var seen = {};
  for (var i = 0; i < links.length; i++) {
    var href = links[i].href || links[i].getAttribute('href') || '';
    var match = href.match(/\/offer\/product_offer\/(\d+)/);
    if (!match) continue;
    var pid = match[1];
    if (seen[pid]) continue;
    seen[pid] = true;
    var fullUrl = href;
    if (!fullUrl.startsWith('http')) {
      fullUrl = 'https://affiliate.shopee.vn' + (href.startsWith('/') ? '' : '/') + href;
    }
    var el = links[i];
    var name = '';
    for (var d = 0; d < 6; d++) {
      if (!el.parentElement) break;
      el = el.parentElement;
      if (!name) {
        var img = el.querySelector('img[alt]');
        if (img && img.alt && img.alt.length > 5) name = img.alt;
      }
    }
    urls.push({ detailUrl: fullUrl, productId: pid, name: name });
  }
  return urls;
}

function clickListingNextPage() {
  var buttons = document.querySelectorAll('button, a, [role="button"]');
  var allEls = document.querySelectorAll('*');

  // Cách 1: Tìm "X/Y" text → click nút next gần đó
  for (var i = 0; i < allEls.length; i++) {
    if (allEls[i].children.length > 0) continue;
    var t = allEls[i].textContent.trim();
    if (!/^\d+\s*\/\s*\d+$/.test(t)) continue;
    var container = allEls[i].parentElement;
    for (var d = 0; d < 5 && container; d++) {
      var btns = container.querySelectorAll('button, [role="button"], a');
      if (btns.length >= 2) {
        var nextBtn = btns[btns.length - 1];
        if (!nextBtn.disabled) { nextBtn.click(); return true; }
      }
      container = container.parentElement;
    }
  }

  // Cách 2: Text arrows >, ›, », →, ❯
  for (var k = buttons.length - 1; k >= 0; k--) {
    var bt = buttons[k].textContent.trim();
    if ((bt === '>' || bt === '\u203A' || bt === '\u00BB' || bt === '\u2192' || bt === '\u276F') && !buttons[k].disabled) {
      buttons[k].click();
      return true;
    }
  }

  // Cách 3: SVG arrow button (không có text, có SVG/icon, nằm bên phải)
  for (var s = buttons.length - 1; s >= 0; s--) {
    if (buttons[s].textContent.trim() !== '') continue;
    if (!buttons[s].querySelector('svg, i, span[class*="icon"]')) continue;
    if (buttons[s].disabled) continue;
    var rect = buttons[s].getBoundingClientRect();
    if (rect.width > 0 && rect.x > window.innerWidth / 2) {
      buttons[s].click();
      return true;
    }
  }

  // Cách 4: Numbered buttons → click trang kế (curPage + 1)
  var numBtns = [];
  var curPage = 0;
  for (var m = 0; m < buttons.length; m++) {
    var num = buttons[m].textContent.trim();
    if (/^\d+$/.test(num)) {
      numBtns.push(buttons[m]);
      var bg = window.getComputedStyle(buttons[m]).backgroundColor;
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

  // Cách 5: Tìm pagination container (chứa nhiều nút số) → click nút cuối cùng (next arrow)
  if (numBtns.length >= 2) {
    var pagContainer = numBtns[0].parentElement;
    for (var up = 0; up < 4 && pagContainer; up++) {
      var allInContainer = pagContainer.querySelectorAll('button, a, [role="button"]');
      if (allInContainer.length >= 5) {
        // Nút cuối cùng trong pagination container = next arrow
        var lastBtn = allInContainer[allInContainer.length - 1];
        if (!lastBtn.disabled && !/^\d+$/.test(lastBtn.textContent.trim())) {
          lastBtn.click();
          return true;
        }
        break;
      }
      pagContainer = pagContainer.parentElement;
    }
  }

  return false;
}

function scrollToLoadAll() {
  return new Promise(function (resolve) {
    var step = window.innerHeight * 0.7;
    var lastH = 0;
    var unchanged = 0;
    function doScroll() {
      window.scrollBy(0, step);
      setTimeout(function () {
        var h = document.body.scrollHeight;
        if (h === lastH) unchanged++;
        else unchanged = 0;
        lastH = h;
        if (unchanged >= 3) { window.scrollTo(0, 0); setTimeout(resolve, 300); }
        else doScroll();
      }, 600);
    }
    doScroll();
  });
}

function getActiveCategoryTab() {
  // Tim tab "Tat ca" lam moc, roi tim tab active trong cung container
  var allEls = document.querySelectorAll('*');
  for (var i = 0; i < allEls.length; i++) {
    if (allEls[i].children.length > 0) continue;
    if ((allEls[i].textContent || '').trim() !== 'Tất cả') continue;
    var container = allEls[i];
    for (var up = 0; up < 6; up++) {
      if (!container.parentElement) break;
      container = container.parentElement;
      if (container.children.length >= 4) break;
    }
    if (!container || container.children.length < 3) continue;
    var leafEls = container.querySelectorAll('*');
    for (var t = 0; t < leafEls.length; t++) {
      if (leafEls[t].children.length > 0) continue;
      var text = (leafEls[t].textContent || '').trim();
      if (text.length < 2 || text.length > 25) continue;
      if (leafEls[t].classList.contains('active') || leafEls[t].classList.contains('selected')) return text;
      var style = window.getComputedStyle(leafEls[t]);
      var color = style.color;
      var m = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      if (!m) continue;
      var r = parseInt(m[1]), g = parseInt(m[2]), b = parseInt(m[3]);
      if (r > 200 && g < 120 && b < 80) return text;
    }
  }
  return '';
}

// === INJECTED: Shopee Offer (nganh hang) ===

function extractShopeeOfferCategories() {
  var categories = [];
  var seen = {};
  var allLinks = document.querySelectorAll('a');
  for (var i = 0; i < allLinks.length; i++) {
    var text = (allLinks[i].textContent || '').trim();
    if (!/xem\s*chi\s*ti[eế]t/i.test(text)) continue;
    var href = allLinks[i].href || allLinks[i].getAttribute('href') || '';
    if (!href || href.indexOf('shopee_offer') === -1) continue;
    var match = href.match(/shopee_offer\/(\d+)/);
    if (!match) continue;
    var catId = match[1];
    if (seen[catId]) continue;
    seen[catId] = true;
    var fullUrl = href;
    if (!fullUrl.startsWith('http')) {
      fullUrl = 'https://affiliate.shopee.vn' + (href.startsWith('/') ? '' : '/') + href;
    }
    // Lay ten nganh hang tu cung dong/container
    var row = allLinks[i];
    for (var up = 0; up < 8; up++) {
      if (!row.parentElement) break;
      row = row.parentElement;
      if (row.tagName === 'TR') break;
      if (row.querySelector('img') && row.querySelectorAll('a').length >= 2) break;
    }
    var name = '';
    var walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT, null, false);
    while (walker.nextNode()) {
      var t = walker.currentNode.textContent.trim();
      if (t.length > 15 && t.indexOf('Xem chi') === -1 && t.indexOf('Lấy link') === -1 &&
          t.indexOf('Ngày') === -1 && t.indexOf('Lên đến') === -1) {
        name = t;
        break;
      }
    }
    // Lay ten ngan tu phan cuoi (VD: "... - Health" → "Health")
    if (name) {
      var parts = name.split(' - ');
      if (parts.length > 1) name = parts[parts.length - 1].trim();
    }
    if (!name) name = 'Ngành ' + catId;
    categories.push({ url: fullUrl, name: name, catId: catId });
  }
  return categories;
}

function clickBanChayTab() {
  var candidates = document.querySelectorAll('a, button, div, span');
  for (var i = 0; i < candidates.length; i++) {
    var text = (candidates[i].textContent || '').trim();
    if (text.length > 15) continue;
    if (text.toLowerCase() === 'bán chạy' || text.toLowerCase() === 'ban chay') {
      var rect = candidates[i].getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        candidates[i].click();
        return true;
      }
    }
  }
  return false;
}

function getTotalListingPages() {
  // Tim text dang "X / Y" (pagination) de biet tong so trang
  var allEls = document.querySelectorAll('*');
  for (var i = 0; i < allEls.length; i++) {
    if (allEls[i].children.length > 0) continue;
    var t = (allEls[i].textContent || '').trim();
    var m = t.match(/^(\d+)\s*\/\s*(\d+)$/);
    if (m) {
      var cur = parseInt(m[1]);
      var total = parseInt(m[2]);
      if (total >= 2 && total <= 200) {
        return { currentPage: cur, totalPages: total };
      }
    }
  }
  return { currentPage: 1, totalPages: 1 };
}

// === UTILITY ===

function waitForTabComplete(tabId) {
  return new Promise(function (resolve) {
    function listener(id, info) {
      if (id === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
    setTimeout(function () {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }, 30000);
  });
}

function sleep(ms) {
  return new Promise(function (r) { setTimeout(r, ms); });
}

// === EXCEL DOWNLOAD (trong service worker) ===

function autoDownloadExcel(products, fileShopName, fields) {
  if (!products || products.length === 0) return;
  try {
    var headers = ['STT'];
    var colMap = [];
    if (fields.name) { headers.push('Tên sản phẩm'); colMap.push('name'); }
    if (fields.shop) { headers.push('Tên cửa hàng'); colMap.push('shopName'); }
    if (fields.price) { headers.push('Giá tiền (đ)'); colMap.push('price'); }
    if (fields.commission) { headers.push('Hoa hồng Xtra (đ)'); colMap.push('commission'); }
    if (fields.percent) { headers.push('% Hoa hồng'); colMap.push('commissionPercent'); }
    if (fields.sales) { headers.push('Lượt bán/tháng'); colMap.push('monthlySales'); }
    headers.push('Link sản phẩm');
    colMap.push('url');

    var rows = products.map(function (p, i) {
      var row = [i + 1];
      for (var c = 0; c < colMap.length; c++) {
        var key = colMap[c];
        if (key === 'url') {
          var link = p.url || '';
          if (link && !link.startsWith('http')) link = 'https://shopee.vn' + link;
          row.push(link);
        } else {
          row.push(p[key] || 0);
        }
      }
      return row;
    });

    var xlsxData = XLSXWriter.generateXLSX(headers, rows, 'Sản phẩm');

    // Convert Uint8Array → base64
    var binary = '';
    for (var b = 0; b < xlsxData.length; b++) {
      binary += String.fromCharCode(xlsxData[b]);
    }
    var base64 = btoa(binary);
    var dataUrl = 'data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,' + base64;

    var date = new Date().toISOString().split('T')[0];
    var safeName = (fileShopName || 'shopee').replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, '_').substring(0, 50);
    var fileName = safeName + '_products_' + date + '.xlsx';

    chrome.downloads.download({ url: dataUrl, filename: fileName, saveAs: false });
  } catch (e) { }
}

// === SAVE TEXT FILE (tong hop tat ca shop vao 1 file) ===

async function appendAndSaveText(products, shopName, fields) {
  if (!products || products.length === 0) return;
  try {
    var data = await chrome.storage.local.get(['batchTextData', 'batchSTT']);
    var textData = (data && data.batchTextData) || '';
    var stt = (data && data.batchSTT) || 0;

    // Header neu la lan dau
    if (!textData) {
      var headers = ['STT'];
      if (fields.name) headers.push('Tên sản phẩm');
      if (fields.shop) headers.push('Tên cửa hàng');
      if (fields.price) headers.push('Giá tiền (đ)');
      if (fields.commission) headers.push('Hoa hồng Xtra (đ)');
      if (fields.percent) headers.push('% Hoa hồng');
      if (fields.sales) headers.push('Lượt bán/tháng');
      headers.push('Link sản phẩm');
      textData = headers.join(';') + '\n';
    }

    // Append tung san pham
    for (var i = 0; i < products.length; i++) {
      stt++;
      var p = products[i];
      var cols = [stt];
      if (fields.name) cols.push((p.name || '').replace(/[;\r\n]+/g, ' '));
      if (fields.shop) cols.push((p.shopName || shopName || '').replace(/[;\r\n]+/g, ' '));
      if (fields.price) cols.push(p.price || 0);
      if (fields.commission) cols.push(p.commission || 0);
      if (fields.percent) cols.push(p.commissionPercent || 0);
      if (fields.sales) cols.push(p.monthlySales || 0);
      var link = p.url || '';
      if (link && !link.startsWith('http')) link = 'https://shopee.vn' + link;
      cols.push(link);
      textData += cols.join(';') + '\n';
    }

    // Luu vao storage (de resume duoc)
    await chrome.storage.local.set({ batchTextData: textData, batchSTT: stt });

    // Download file (ghi de file cu)
    var fileName = 'shopee_affiliate_' + (batchFileTimestamp || generateTimestamp()) + '.txt';

    // UTF-8 with BOM cho Notepad++
    var bom = '\uFEFF';
    var fullText = bom + textData;
    var bytes = new TextEncoder().encode(fullText);
    var binary = '';
    for (var b = 0; b < bytes.length; b++) {
      binary += String.fromCharCode(bytes[b]);
    }
    var base64 = btoa(binary);
    var dataUrl = 'data:text/plain;charset=utf-8;base64,' + base64;

    chrome.downloads.download({
      url: dataUrl,
      filename: fileName,
      conflictAction: 'overwrite',
      saveAs: false
    });
  } catch (e) { }
}

// === SCRAPE SHOP PRODUCTS (port communication voi content.js) ===

function scrapeShopProducts(tabId, commissionPercent, fields) {
  return new Promise(async function (resolve) {
    var shopPort = null;
    var timeout = null;
    var resolved = false;
    var partialData = null;

    function finish(val) {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      currentScrapePort = null;
      resolve(val);
    }

    try {
      if (batchStopRequested) { finish(null); return; }

      try {
        await chrome.scripting.executeScript({
          target: { tabId: tabId },
          files: ['content.js']
        });
      } catch (e) { }

      await sleep(1000);
      if (batchStopRequested) { finish(null); return; }

      shopPort = chrome.tabs.connect(tabId, { name: 'shopee-scraper' });
      currentScrapePort = shopPort;

      timeout = setTimeout(function () {
        if (shopPort) {
          try { shopPort.postMessage({ action: 'stop' }); } catch (e) { }
        }
        finish(null);
      }, 300000);

      shopPort.onMessage.addListener(function (msg) {
        switch (msg.type) {
          case 'info':
            if (msg.shopName) updateState({ currentProductName: msg.shopName });
            break;
          case 'progress':
            updateState({
              shopCurrentPage: msg.currentPage,
              shopTotalPages: msg.totalPages,
              shopProductsCount: msg.productsCount
            });
            break;
          case 'partial':
            // Luu du lieu partial de phuc hoi khi gap captcha/disconnect
            partialData = {
              products: msg.products || [],
              shopName: msg.shopName || '',
              currentPage: msg.currentPage || 0,
              totalPages: msg.totalPages || 0
            };
            break;
          case 'complete':
            finish({ products: msg.products || [], shopName: msg.shopName || '' });
            break;
          case 'error':
            // Neu co partial data thi dung no thay vi mat het
            if (partialData && partialData.products.length > 0) {
              finish({ products: partialData.products, shopName: partialData.shopName, partial: true });
            } else {
              finish(null);
            }
            break;
        }
      });

      shopPort.onDisconnect.addListener(function () {
        // Port ngat (captcha redirect?) → tra ve partial data neu co
        if (partialData && partialData.products.length > 0) {
          finish({ products: partialData.products, shopName: partialData.shopName, partial: true });
        } else {
          finish(null);
        }
      });

      shopPort.postMessage({
        action: 'start',
        commissionPercent: commissionPercent,
        fields: fields
      });

    } catch (e) {
      if (partialData && partialData.products.length > 0) {
        finish({ products: partialData.products, shopName: partialData.shopName, partial: true });
      } else {
        finish(null);
      }
    }
  });
}

// === PROCESS ONE PRODUCT ===

async function processOneProduct(productInfo, tabId, fields) {
  var result = { success: false, shopId: null, shopName: '', skipped: false, error: '', productCount: 0 };

  try {
    if (batchStopRequested) return result;

    // Buoc 1: Chuyen tab den trang chi tiet affiliate
    await chrome.tabs.update(tabId, { url: productInfo.detailUrl });
    await waitForTabComplete(tabId);
    await sleep(3000);
    if (batchStopRequested) return result;

    // Buoc 2: Doc % hoa hong + link "Xem san pham" (retry 3 lan neu trang chua load)
    var detailData = null;
    for (var extractAttempt = 0; extractAttempt < 3 && !batchStopRequested; extractAttempt++) {
      try {
        var detailResults = await chrome.scripting.executeScript({
          target: { tabId: tabId },
          func: extractFromAffiliatePage
        });
        detailData = (detailResults[0] && detailResults[0].result) || null;
        if (detailData && detailData.productUrl) break;
      } catch (e) { }
      if (extractAttempt < 2) {
        await sleep(3000);
        // Lan 2: reload lai trang affiliate
        if (extractAttempt === 1) {
          try {
            await chrome.tabs.update(tabId, { url: productInfo.detailUrl });
            await waitForTabComplete(tabId);
            await sleep(3000);
          } catch (e) { }
        }
      }
    }
    if (!detailData || !detailData.productUrl) {
      result.error = 'Không tìm thấy link SP';
      return result;
    }
    var commissionPercent = detailData.commissionPercent || 0;

    // Buoc 3: Lay shopId tu URL
    var shopId = 0;
    var pUrl = detailData.productUrl;
    var urlM1 = pUrl.match(/-i\.(\d+)\.\d+/);
    if (urlM1) shopId = parseInt(urlM1[1]);
    if (!shopId) {
      var urlM2 = pUrl.match(/\/product\/(\d+)\/\d+/);
      if (urlM2) shopId = parseInt(urlM2[1]);
    }
    // Fallback: mo trang de lay shopId tu URL cuoi cung
    if (!shopId) {
      try {
        await chrome.tabs.update(tabId, { url: pUrl });
        await waitForTabComplete(tabId);
        await sleep(3000);
        var curTab = await chrome.tabs.get(tabId);
        if (curTab && curTab.url) {
          var urlM3 = curTab.url.match(/-i\.(\d+)\.\d+/);
          if (urlM3) shopId = parseInt(urlM3[1]);
          if (!shopId) {
            var urlM5 = curTab.url.match(/\/product\/(\d+)\/\d+/);
            if (urlM5) shopId = parseInt(urlM5[1]);
          }
        }
      } catch (e) { }
    }
    if (!shopId) {
      result.error = 'Không tìm thấy shopId';
      return result;
    }

    result.shopId = shopId;
    if (batchStopRequested) return result;

    // Buoc 4: Kiem tra trung shop
    if (processedShopIds[shopId]) {
      result.skipped = true;
      result.success = true;
      return result;
    }
    processedShopIds[shopId] = true;

    // Buoc 5: Lay username shop qua API (retry 3 lan — chong rate limit khi chay nhieu Chrome)
    var shopData = null;
    for (var apiAttempt = 0; apiAttempt < 3 && !batchStopRequested; apiAttempt++) {
      shopData = await new Promise(function (resolve) {
        fetch('https://shopee.vn/api/v4/shop/get_shop_detail?shopid=' + shopId)
          .then(function (r) { return r.json(); })
          .then(function (data) {
            if (data && data.data) {
              var username = (data.data.account && data.data.account.username) || null;
              var shopName = data.data.name || username || '';
              resolve({ username: username, shopName: shopName });
            } else {
              resolve({ username: null, shopName: '' });
            }
          })
          .catch(function () { resolve({ username: null, shopName: '' }); });
      });
      if (shopData && shopData.username) break;
      if (apiAttempt < 2) await sleep(3000 + Math.random() * 2000);
    }

    if (!shopData || !shopData.username) {
      result.error = 'Không lấy được thông tin shop (ID: ' + shopId + ')';
      return result;
    }

    var currentShopName = shopData.shopName || shopData.username;
    result.shopName = currentShopName;

    if (batchStopRequested) return result;

    // Buoc 6: Chuyen tab den trang shop
    var shopUrl = 'https://shopee.vn/' + shopData.username + '?sortBy=sales';
    updateState({ statusText: 'Đang mở shop: ' + currentShopName });
    await chrome.tabs.update(tabId, { url: shopUrl });
    await waitForTabComplete(tabId);
    await sleep(4000);
    if (batchStopRequested) return result;

    // Buoc 7: Quet san pham shop
    updateState({
      statusText: 'Đang quét: ' + currentShopName + ' (HH: ' + commissionPercent + '%)',
      shopCurrentPage: 0,
      shopTotalPages: 0,
      shopProductsCount: 0
    });

    var scrapeResult = await scrapeShopProducts(tabId, commissionPercent, fields);

    // Neu bi captcha (partial) → tra ve thong tin de batch loop retry SAU KHI qua shop khac
    // (reload cung trang van bi captcha, phai qua shop khac truoc roi quay lai)
    if (scrapeResult && scrapeResult.partial) {
      result.partial = true;
      result.partialProducts = scrapeResult.products;
      result.retryShopUrl = shopUrl;
      result.retryCommissionPercent = commissionPercent;
      result.shopName = currentShopName;
      result.productCount = scrapeResult.products.length;
      updateState({ statusText: 'Captcha ở ' + currentShopName + ' (' + scrapeResult.products.length + ' SP). Retry sau shop tiếp...' });
      return result;
    }

    if (scrapeResult && scrapeResult.products && scrapeResult.products.length > 0) {
      await appendAndSaveText(scrapeResult.products, scrapeResult.shopName || currentShopName, fields);
      result.success = true;
      result.shopName = scrapeResult.shopName || currentShopName;
      result.productCount = scrapeResult.products.length;
    } else {
      result.error = 'Không tìm thấy SP từ shop: ' + currentShopName;
    }

  } catch (e) {
    result.error = 'Lỗi: ' + (e.message || 'Không xác định');
  }

  return result;
}

// === RETRY PARTIAL SHOP (captcha recovery — retry sau khi da qua shop khac) ===

async function retryPartialShop(retryInfo, tabId, fields) {
  try {
    updateState({
      statusText: 'Retry captcha: ' + retryInfo.shopName,
      shopCurrentPage: 0,
      shopTotalPages: 0,
      shopProductsCount: 0
    });
    await chrome.tabs.update(tabId, { url: retryInfo.retryShopUrl });
    await waitForTabComplete(tabId);
    await sleep(4000);
    if (batchStopRequested) return retryInfo.partialProducts;

    var retryResult = await scrapeShopProducts(tabId, retryInfo.retryCommissionPercent, fields);
    if (retryResult && retryResult.products && retryResult.products.length >= retryInfo.partialProducts.length) {
      return retryResult.products;
    }
    // Retry van that bai → tra ve partial data cu (khong mat du lieu)
    return retryInfo.partialProducts;
  } catch (e) {
    return retryInfo.partialProducts;
  }
}

// === RETRY FAILED PRODUCT (retry SP that bai — goi lai processOneProduct) ===

async function retryFailedProduct(productInfo, tabId, fields) {
  try {
    updateState({ statusText: 'Retry: ' + (productInfo.name || 'SP') + '...' });
    var retryResult = await processOneProduct(productInfo, tabId, fields);

    // Neu retry bi captcha (partial) → cuu van partial data
    if (retryResult.partial) {
      var rProducts = await retryPartialShop(retryResult, tabId, fields);
      await appendAndSaveText(rProducts, retryResult.shopName, fields);
      return { success: true, shopName: retryResult.shopName, productCount: rProducts.length };
    }

    // Neu retry thanh cong binh thuong
    return retryResult;
  } catch (e) {
    return { success: false, error: 'Retry lỗi: ' + (e.message || ''), skipped: false, productCount: 0 };
  }
}

// === BATCH PROCESSING ===

async function startBatchProcessing(tabId, maxPages, fields, resumeData) {
  batchRunning = true;
  batchStopRequested = false;
  var totalFiles = 0;
  var totalSkipped = 0;
  var totalFailed = 0;
  var totalProcessed = 0;
  var allProductLinks = [];
  var startIndex = 0;

  if (resumeData) {
    allProductLinks = resumeData.allProductLinks || [];
    startIndex = resumeData.resumeIndex || 0;
    processedShopIds = resumeData.savedProcessedShopIds || {};
    fields = resumeData.savedFields || fields;
    batchFileTimestamp = state.batchFileTimestamp || generateTimestamp();
    totalFiles = state.totalFiles || 0;
    totalSkipped = state.totalSkipped || 0;
    totalFailed = state.totalFailed || 0;
    totalProcessed = state.totalProcessed || 0;
    updateState({
      running: true,
      phase: 'processing',
      batchTabId: tabId,
      statusText: 'Tiếp tục từ SP ' + (startIndex + 1) + '/' + allProductLinks.length
    });
  } else {
    processedShopIds = {};
    batchFileTimestamp = generateTimestamp();
    state = defaultState();
    state.running = true;
    state.mode = 'listing';
    state.maxPages = maxPages;
    state.phase = 'collecting';
    state.batchTabId = tabId;
    state.batchFileTimestamp = batchFileTimestamp;
    updateState(state);
    // Xoa du lieu text cu de bat dau moi
    chrome.storage.local.remove(['batchTextData', 'batchSTT']);
  }

  try {
    // ===== PHASE 1: Thu thap tat ca link san pham =====
    if (!resumeData) {

    // Lay ten tab danh muc dang active
    try {
      var catResults = await chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: getActiveCategoryTab
      });
      var categoryName = (catResults[0] && catResults[0].result) || '';
      if (categoryName) updateState({ categoryName: categoryName });
    } catch (e) { }

    for (var pageNum = 1; pageNum <= maxPages; pageNum++) {
      if (batchStopRequested) break;

      updateState({
        statusText: 'Đang đọc trang listing ' + pageNum + '/' + maxPages + '...',
        currentListingPage: pageNum
      });

      // Scroll
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tabId },
          func: scrollToLoadAll
        });
      } catch (e) { }
      await sleep(2000);

      // Lay danh sach link
      var extractResults = await chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: extractProductLinksFromListingPage
      });
      var pageLinks = (extractResults[0] && extractResults[0].result) || [];

      if (pageLinks.length === 0 && pageNum === 1) {
        updateState({
          running: false, phase: 'done',
          errorText: 'Không tìm thấy sản phẩm nào trên trang listing.',
          statusText: 'Lỗi: Không tìm thấy sản phẩm'
        });
        batchRunning = false;
        return;
      }

      for (var pl = 0; pl < pageLinks.length; pl++) {
        pageLinks[pl].pageNum = pageNum;
      }
      allProductLinks = allProductLinks.concat(pageLinks);

      updateState({
        statusText: 'Trang ' + pageNum + '/' + maxPages + ': ' + pageLinks.length + ' SP — Tổng: ' + allProductLinks.length
      });

      // Chuyen trang listing tiep theo (retry 5 lan, luon scroll truoc)
      if (pageNum < maxPages && !batchStopRequested) {
        updateState({ statusText: 'Đang chuyển trang listing ' + (pageNum + 1) + '...' });
        var clicked = false;
        for (var retryClick = 0; retryClick < 5 && !clicked; retryClick++) {
          // Luon scroll xuong cuoi trang truoc khi click (pagination o cuoi)
          try {
            await chrome.scripting.executeScript({
              target: { tabId: tabId },
              func: function() { window.scrollTo(0, document.body.scrollHeight); }
            });
          } catch (e) { }
          await sleep(retryClick === 0 ? 1500 : 2500);
          try {
            var clickResults = await chrome.scripting.executeScript({
              target: { tabId: tabId },
              func: clickListingNextPage
            });
            clicked = clickResults[0] && clickResults[0].result;
          } catch (e) { }
        }
        if (!clicked) {
          updateState({ errorText: 'Không thể chuyển trang listing ' + (pageNum + 1) + '. Tiếp tục với ' + allProductLinks.length + ' SP đã thu thập' });
          break;
        }
        await sleep(3000);
      }
    }

    if (allProductLinks.length === 0) {
      updateState({ running: false, phase: 'done', statusText: 'Không có sản phẩm' });
      batchRunning = false;
      return;
    }

    // Save for resume
    updateState({
      allProductLinks: allProductLinks,
      savedFields: fields,
      savedProcessedShopIds: processedShopIds,
      phase: 'processing',
      totalProducts: allProductLinks.length,
      statusText: 'Tìm thấy ' + allProductLinks.length + ' SP. Bắt đầu xử lý...'
    });

    } // end if (!resumeData)

    // ===== PHASE 2: Xu ly tung san pham =====
    var pendingRetryPartial = null;
    var failedQueue = [];

    for (var pIdx = startIndex; pIdx < allProductLinks.length; pIdx++) {
      if (batchStopRequested) break;

      // Retry captcha partial truoc do
      if (pendingRetryPartial && !batchStopRequested) {
        try {
          var retryProducts = await retryPartialShop(pendingRetryPartial, tabId, fields);
          await appendAndSaveText(retryProducts, pendingRetryPartial.shopName, fields);
          totalFiles++;
          updateState({ totalFiles: totalFiles, statusText: 'Retry OK: ' + pendingRetryPartial.shopName + ' — ' + retryProducts.length + ' SP' });
        } catch (re) { }
        pendingRetryPartial = null;
        await sleep(2000);
      }

      try {
        var pInfo = allProductLinks[pIdx];
        totalProcessed++;

        var spName = pInfo.name || ('SP ' + pInfo.productId);
        updateState({
          currentProduct: pIdx + 1,
          currentProductName: spName,
          currentListingPage: pInfo.pageNum || 1,
          statusText: 'SP ' + (pIdx + 1) + '/' + allProductLinks.length + ': ' + spName,
          totalProcessed: totalProcessed,
          totalFiles: totalFiles,
          totalSkipped: totalSkipped,
          totalFailed: totalFailed
        });

        var pResult;
        try {
          pResult = await processOneProduct(pInfo, tabId, fields);
        } catch (e) {
          pResult = { success: false, skipped: false, error: 'Lỗi: ' + (e.message || 'Không xác định'), productCount: 0 };
        }

        if (pResult.partial) {
          pendingRetryPartial = pResult;
          updateState({ statusText: 'Captcha: ' + pResult.shopName + '. Retry sau shop tiếp...' });
        } else if (pResult.skipped) {
          totalSkipped++;
          updateState({ totalSkipped: totalSkipped, statusText: 'Bỏ qua (trùng shop): ' + (pResult.shopName || '') });
        } else if (!pResult.success) {
          failedQueue.push(pInfo);
          updateState({ statusText: 'Lỗi: ' + (pResult.error || '') + '. Sẽ retry sau...' });
        } else {
          totalFiles++;
          updateState({ totalFiles: totalFiles, statusText: 'OK: ' + pResult.shopName + ' — ' + (pResult.productCount || 0) + ' SP' });
        }
      } catch (loopErr) {
        // Safety net — bat ky loi gi trong loop → khong dung, tiep tuc
        failedQueue.push(allProductLinks[pIdx]);
        updateState({ statusText: 'Lỗi loop: ' + (loopErr.message || '') + '. Tiếp tục...' });
        try {
          await chrome.tabs.update(tabId, { url: 'https://shopee.vn' });
          await waitForTabComplete(tabId);
          await sleep(3000);
        } catch (navErr) { }
      }

      // Save resume point
      updateState({ resumeIndex: pIdx + 1, savedProcessedShopIds: processedShopIds });

      // Delay
      if (pIdx < allProductLinks.length - 1 && !batchStopRequested) {
        await sleep(2000 + Math.random() * 2000);
      }
    }

    // Handle last pending partial from main loop
    if (pendingRetryPartial && !batchStopRequested) {
      try {
        var lastRP = await retryPartialShop(pendingRetryPartial, tabId, fields);
        await appendAndSaveText(lastRP, pendingRetryPartial.shopName, fields);
        totalFiles++;
        updateState({ totalFiles: totalFiles, statusText: 'Retry OK: ' + pendingRetryPartial.shopName + ' — ' + lastRP.length + ' SP' });
      } catch (re) { }
      pendingRetryPartial = null;
    }

    // === RETRY PASS: Retry tat ca SP that bai sau khi hoan thanh vong chinh ===
    if (failedQueue.length > 0 && !batchStopRequested) {
      updateState({ statusText: 'Retry ' + failedQueue.length + ' SP thất bại...' });

      for (var fi = 0; fi < failedQueue.length; fi++) {
        if (batchStopRequested) break;

        // Retry captcha partial tu lan retry truoc
        if (pendingRetryPartial && !batchStopRequested) {
          try {
            var rpRetry = await retryPartialShop(pendingRetryPartial, tabId, fields);
            await appendAndSaveText(rpRetry, pendingRetryPartial.shopName, fields);
            totalFiles++;
            updateState({ totalFiles: totalFiles });
          } catch (re) { }
          pendingRetryPartial = null;
          await sleep(2000);
        }

        var fInfo = failedQueue[fi];
        updateState({ statusText: 'Retry ' + (fi + 1) + '/' + failedQueue.length + ': ' + (fInfo.name || 'SP ' + fInfo.productId) });

        var fResult;
        try {
          fResult = await processOneProduct(fInfo, tabId, fields);
        } catch (e) {
          fResult = { success: false, skipped: false, error: e.message || '', productCount: 0 };
        }

        if (fResult.partial) {
          pendingRetryPartial = fResult;
        } else if (fResult.success) {
          totalFiles++;
          updateState({ totalFiles: totalFiles, statusText: 'Retry OK: ' + (fResult.shopName || '') + ' — ' + (fResult.productCount || 0) + ' SP' });
        } else if (fResult.skipped) {
          totalSkipped++;
        } else {
          totalFailed++;
          updateState({ totalFailed: totalFailed });
        }

        if (fi < failedQueue.length - 1 && !batchStopRequested) {
          await sleep(2000 + Math.random() * 2000);
        }
      }

      // Handle very last pending partial from retry pass
      if (pendingRetryPartial && !batchStopRequested) {
        try {
          var vLastRP = await retryPartialShop(pendingRetryPartial, tabId, fields);
          await appendAndSaveText(vLastRP, pendingRetryPartial.shopName, fields);
          totalFiles++;
          updateState({ totalFiles: totalFiles });
        } catch (re) { }
      }
    }

  } catch (e) {
    updateState({ errorText: 'Lỗi batch: ' + (e.message || '') });
  } finally {
    batchRunning = false;
    var finalUpdate = {
      running: false,
      phase: batchStopRequested ? 'stopped' : 'done',
      statusText: (batchStopRequested ? 'Đã dừng! ' : 'Hoàn thành! ') +
        totalFiles + ' shop' +
        (totalSkipped > 0 ? ', ' + totalSkipped + ' bỏ qua' : '') +
        (totalFailed > 0 ? ', ' + totalFailed + ' lỗi' : ''),
      totalFiles: totalFiles,
      totalSkipped: totalSkipped,
      totalFailed: totalFailed,
      totalProcessed: totalProcessed
    };
    if (!batchStopRequested) {
      finalUpdate.allProductLinks = [];
      finalUpdate.resumeIndex = 0;
      finalUpdate.savedProcessedShopIds = {};
      finalUpdate.savedFields = null;
    }
    updateState(finalUpdate);
  }
}

// === SHOPEE OFFER PROCESSING (Hoa hong Shopee - nganh hang) ===

async function startShopeeOfferProcessing(tabId, fields, preloadedCategories) {
  batchRunning = true;
  batchStopRequested = false;
  processedShopIds = {};
  batchFileTimestamp = generateTimestamp();
  state = defaultState();
  state.running = true;
  state.mode = 'shopeeOffer';
  state.phase = 'collecting';
  state.batchTabId = tabId;
  state.batchFileTimestamp = batchFileTimestamp;
  updateState(state);
  chrome.storage.local.remove(['batchTextData', 'batchSTT']);

  var totalFiles = 0, totalSkipped = 0, totalFailed = 0, totalProcessed = 0;

  try {
    var allCategories = [];
    var shopeeOfferBaseUrl = '';

    // Luu URL goc de quay lai sau
    try {
      var curTab = await chrome.tabs.get(tabId);
      shopeeOfferBaseUrl = curTab.url;
    } catch (e) { }

    // Neu popup da truyen categories (user da chon) → skip Phase 0
    if (preloadedCategories && preloadedCategories.length > 0) {
      allCategories = preloadedCategories;
      updateState({ statusText: 'Đã chọn ' + allCategories.length + ' ngành hàng. Bắt đầu xử lý...' });
    } else {
    // === PHASE 0: Thu thap tat ca nganh hang (fallback) ===
    var catPage = 1;

    while (!batchStopRequested) {
      updateState({ statusText: 'Đang đọc ngành hàng trang ' + catPage + '...' });

      try {
        await chrome.scripting.executeScript({ target: { tabId: tabId }, func: scrollToLoadAll });
      } catch (e) { }
      await sleep(2000);

      var catResults = await chrome.scripting.executeScript({
        target: { tabId: tabId }, func: extractShopeeOfferCategories
      });
      var pageCats = (catResults[0] && catResults[0].result) || [];

      if (pageCats.length === 0 && catPage === 1) {
        updateState({ running: false, phase: 'done', errorText: 'Không tìm thấy ngành hàng.', statusText: 'Lỗi' });
        batchRunning = false;
        return;
      }

      // Deduplicate
      for (var ci = 0; ci < pageCats.length; ci++) {
        var exists = false;
        for (var ei = 0; ei < allCategories.length; ei++) {
          if (allCategories[ei].catId === pageCats[ci].catId) { exists = true; break; }
        }
        if (!exists) allCategories.push(pageCats[ci]);
      }

      updateState({ statusText: 'Trang ' + catPage + ': ' + pageCats.length + ' ngành — Tổng: ' + allCategories.length });

      // Chuyen trang nganh hang
      var nextClicked = false;
      for (var rc = 0; rc < 5 && !nextClicked; rc++) {
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: function() { window.scrollTo(0, document.body.scrollHeight); }
          });
        } catch (e) { }
        await sleep(rc === 0 ? 1500 : 2500);
        try {
          var clickRes = await chrome.scripting.executeScript({ target: { tabId: tabId }, func: clickListingNextPage });
          nextClicked = clickRes[0] && clickRes[0].result;
        } catch (e) { }
      }
      if (!nextClicked) break;
      await sleep(3000);
      catPage++;
    }
    } // end else (Phase 0 fallback)

    if (allCategories.length === 0) {
      updateState({ running: false, phase: 'done', statusText: 'Không có ngành hàng' });
      batchRunning = false;
      return;
    }

    updateState({
      totalCategories: allCategories.length,
      statusText: 'Tìm thấy ' + allCategories.length + ' ngành hàng. Bắt đầu xử lý...'
    });

    // === LOOP: Xu ly tung nganh hang ===
    for (var catIdx = 0; catIdx < allCategories.length; catIdx++) {
      if (batchStopRequested) break;

      var cat = allCategories[catIdx];
      updateState({
        currentCategory: catIdx + 1,
        currentCategoryName: cat.name,
        phase: 'collecting',
        statusText: 'Ngành ' + (catIdx + 1) + '/' + allCategories.length + ': ' + cat.name
      });

      // Mo trang chi tiet nganh hang
      await chrome.tabs.update(tabId, { url: cat.url });
      await waitForTabComplete(tabId);
      await sleep(4000);
      if (batchStopRequested) break;

      // Click "Ban chay" tab
      try {
        await chrome.scripting.executeScript({ target: { tabId: tabId }, func: clickBanChayTab });
      } catch (e) { }
      await sleep(3000);
      if (batchStopRequested) break;

      // Phase 1: Thu thap product links tu nganh hang nay
      var catProductLinks = [];
      var listingPage = 1;
      var totalListingPages = 1;

      // Lay tong so trang truoc
      await sleep(1000);
      try {
        var pgInfoRes = await chrome.scripting.executeScript({ target: { tabId: tabId }, func: getTotalListingPages });
        var pgInfo = (pgInfoRes[0] && pgInfoRes[0].result) || {};
        if (pgInfo.totalPages && pgInfo.totalPages > 1) totalListingPages = pgInfo.totalPages;
      } catch (e) { }

      while (!batchStopRequested) {
        updateState({
          statusText: 'Ngành ' + (catIdx + 1) + '/' + allCategories.length + ' (' + cat.name + ') — Trang ' + listingPage + '/' + totalListingPages + '...',
          currentListingPage: listingPage
        });

        try {
          await chrome.scripting.executeScript({ target: { tabId: tabId }, func: scrollToLoadAll });
        } catch (e) { }
        await sleep(2000);

        // Extract product links (retry 3 lan neu chua load xong)
        var pageLinks = [];
        for (var extractRetry = 0; extractRetry < 3; extractRetry++) {
          try {
            var extResults = await chrome.scripting.executeScript({
              target: { tabId: tabId }, func: extractProductLinksFromListingPage
            });
            pageLinks = (extResults[0] && extResults[0].result) || [];
          } catch (e) { pageLinks = []; }
          if (pageLinks.length > 0) break;
          await sleep(3000);
        }

        if (pageLinks.length === 0 && listingPage === 1) break;
        if (pageLinks.length === 0 && listingPage > 1) {
          // Trang nay khong co SP nhung van co the con trang tiep → thu next
          if (listingPage < totalListingPages) {
            // skip trang nay, thu trang tiep
          } else {
            break;
          }
        }

        if (pageLinks.length > 0) {
          for (var pl = 0; pl < pageLinks.length; pl++) {
            pageLinks[pl].pageNum = listingPage;
          }
          catProductLinks = catProductLinks.concat(pageLinks);
        }

        updateState({
          statusText: 'Ngành ' + (catIdx + 1) + ' — Trang ' + listingPage + '/' + totalListingPages + ': ' + pageLinks.length + ' SP — Tổng: ' + catProductLinks.length
        });

        // Da het trang?
        if (listingPage >= totalListingPages) break;

        // Next page (retry 10 lan voi wait lau hon)
        var listClicked = false;
        for (var rl = 0; rl < 10 && !listClicked; rl++) {
          try {
            await chrome.scripting.executeScript({
              target: { tabId: tabId },
              func: function() { window.scrollTo(0, document.body.scrollHeight); }
            });
          } catch (e) { }
          await sleep(rl < 3 ? 1500 : 3000);
          try {
            var lClickRes = await chrome.scripting.executeScript({ target: { tabId: tabId }, func: clickListingNextPage });
            listClicked = lClickRes[0] && lClickRes[0].result;
          } catch (e) { }
        }
        if (!listClicked) {
          updateState({ statusText: 'Ngành ' + (catIdx + 1) + ': Không chuyển được trang ' + (listingPage + 1) + '/' + totalListingPages + '. Đã lấy ' + catProductLinks.length + ' SP' });
          break;
        }
        await sleep(3000);
        listingPage++;

        // Cap nhat lai totalPages (co the thay doi sau khi chuyen trang)
        try {
          var pgInfoRes2 = await chrome.scripting.executeScript({ target: { tabId: tabId }, func: getTotalListingPages });
          var pgInfo2 = (pgInfoRes2[0] && pgInfoRes2[0].result) || {};
          if (pgInfo2.totalPages && pgInfo2.totalPages > totalListingPages) totalListingPages = pgInfo2.totalPages;
        } catch (e) { }
      }

      if (catProductLinks.length === 0) {
        updateState({ statusText: 'Ngành ' + cat.name + ': 0 SP. Bỏ qua.' });
        continue;
      }

      updateState({
        totalProducts: catProductLinks.length,
        maxPages: totalListingPages,
        phase: 'processing',
        statusText: 'Ngành ' + (catIdx + 1) + ' (' + cat.name + '): ' + catProductLinks.length + ' SP (' + totalListingPages + ' trang). Đang xử lý...'
      });

      // Pre-compute: dem SP moi trang
      var pageCounters = {};
      var pageTotals = {};
      for (var pm = 0; pm < catProductLinks.length; pm++) {
        var pgn = catProductLinks[pm].pageNum || 1;
        pageTotals[pgn] = (pageTotals[pgn] || 0) + 1;
      }

      // Phase 2: Xu ly tung SP trong nganh hang nay
      var pendingRetryPartial = null;
      var failedQueue = [];

      for (var pIdx = 0; pIdx < catProductLinks.length; pIdx++) {
        if (batchStopRequested) break;

        // Retry captcha partial truoc do
        if (pendingRetryPartial && !batchStopRequested) {
          try {
            var retryProducts = await retryPartialShop(pendingRetryPartial, tabId, fields);
            await appendAndSaveText(retryProducts, pendingRetryPartial.shopName, fields);
            totalFiles++;
            updateState({ totalFiles: totalFiles, statusText: 'Retry OK: ' + pendingRetryPartial.shopName + ' — ' + retryProducts.length + ' SP' });
          } catch (re) { }
          pendingRetryPartial = null;
          await sleep(2000);
        }

        try {
          var pInfo = catProductLinks[pIdx];
          totalProcessed++;

          // Tinh vi tri trong trang: VD "10/20 — 02/25"
          var curPageNum = pInfo.pageNum || 1;
          pageCounters[curPageNum] = (pageCounters[curPageNum] || 0) + 1;
          var posOnPage = pageCounters[curPageNum];
          var totalOnPage = pageTotals[curPageNum] || 20;
          var pageLabel = posOnPage + '/' + totalOnPage + ' — ' + (curPageNum < 10 ? '0' : '') + curPageNum + '/' + (totalListingPages < 10 ? '0' : '') + totalListingPages;

          var spName = pInfo.name || ('SP ' + pInfo.productId);
          updateState({
            currentProduct: pIdx + 1,
            currentProductName: spName,
            currentListingPage: curPageNum,
            statusText: 'Ngành ' + (catIdx + 1) + ' — ' + pageLabel + ': ' + spName,
            totalProcessed: totalProcessed,
            totalFiles: totalFiles,
            totalSkipped: totalSkipped,
            totalFailed: totalFailed
          });

          var pResult;
          try {
            pResult = await processOneProduct(pInfo, tabId, fields);
          } catch (e) {
            pResult = { success: false, skipped: false, error: 'Lỗi: ' + (e.message || ''), productCount: 0 };
          }

          if (pResult.partial) {
            pendingRetryPartial = pResult;
            updateState({ statusText: 'Captcha: ' + pResult.shopName + '. Retry sau shop tiếp...' });
          } else if (pResult.skipped) {
            totalSkipped++;
            updateState({ totalSkipped: totalSkipped, statusText: 'Bỏ qua (trùng shop): ' + (pResult.shopName || '') });
          } else if (!pResult.success) {
            failedQueue.push(pInfo);
            updateState({ statusText: 'Lỗi: ' + (pResult.error || '') + '. Sẽ retry sau...' });
          } else {
            totalFiles++;
            updateState({ totalFiles: totalFiles, statusText: 'OK: ' + pResult.shopName + ' — ' + (pResult.productCount || 0) + ' SP' });
          }
        } catch (loopErr) {
          failedQueue.push(catProductLinks[pIdx]);
          updateState({ statusText: 'Lỗi loop: ' + (loopErr.message || '') + '. Tiếp tục...' });
          try {
            await chrome.tabs.update(tabId, { url: 'https://shopee.vn' });
            await waitForTabComplete(tabId);
            await sleep(3000);
          } catch (navErr) { }
        }

        if (pIdx < catProductLinks.length - 1 && !batchStopRequested) {
          await sleep(2000 + Math.random() * 2000);
        }
      }

      // Handle last pending partial from main loop
      if (pendingRetryPartial && !batchStopRequested) {
        try {
          var lastRP = await retryPartialShop(pendingRetryPartial, tabId, fields);
          await appendAndSaveText(lastRP, pendingRetryPartial.shopName, fields);
          totalFiles++;
          updateState({ totalFiles: totalFiles, statusText: 'Retry OK: ' + pendingRetryPartial.shopName + ' — ' + lastRP.length + ' SP' });
        } catch (re) { }
        pendingRetryPartial = null;
      }

      // === RETRY PASS: Retry tat ca SP that bai cua nganh nay ===
      if (failedQueue.length > 0 && !batchStopRequested) {
        updateState({ statusText: 'Ngành ' + (catIdx + 1) + ': Retry ' + failedQueue.length + ' SP thất bại...' });

        for (var fi = 0; fi < failedQueue.length; fi++) {
          if (batchStopRequested) break;

          if (pendingRetryPartial && !batchStopRequested) {
            try {
              var rpRetry = await retryPartialShop(pendingRetryPartial, tabId, fields);
              await appendAndSaveText(rpRetry, pendingRetryPartial.shopName, fields);
              totalFiles++;
              updateState({ totalFiles: totalFiles });
            } catch (re) { }
            pendingRetryPartial = null;
            await sleep(2000);
          }

          var fInfo = failedQueue[fi];
          updateState({ statusText: 'Ngành ' + (catIdx + 1) + ' — Retry ' + (fi + 1) + '/' + failedQueue.length + ': ' + (fInfo.name || 'SP ' + fInfo.productId) });

          var fResult;
          try {
            fResult = await processOneProduct(fInfo, tabId, fields);
          } catch (e) {
            fResult = { success: false, skipped: false, error: e.message || '', productCount: 0 };
          }

          if (fResult.partial) {
            pendingRetryPartial = fResult;
          } else if (fResult.success) {
            totalFiles++;
            updateState({ totalFiles: totalFiles, statusText: 'Retry OK: ' + (fResult.shopName || '') + ' — ' + (fResult.productCount || 0) + ' SP' });
          } else if (fResult.skipped) {
            totalSkipped++;
          } else {
            totalFailed++;
            updateState({ totalFailed: totalFailed });
          }

          if (fi < failedQueue.length - 1 && !batchStopRequested) {
            await sleep(2000 + Math.random() * 2000);
          }
        }

        if (pendingRetryPartial && !batchStopRequested) {
          try {
            var vLastRP = await retryPartialShop(pendingRetryPartial, tabId, fields);
            await appendAndSaveText(vLastRP, pendingRetryPartial.shopName, fields);
            totalFiles++;
            updateState({ totalFiles: totalFiles });
          } catch (re) { }
        }
      }
    }

  } catch (e) {
    updateState({ errorText: 'Lỗi: ' + (e.message || '') });
  } finally {
    batchRunning = false;
    updateState({
      running: false,
      phase: batchStopRequested ? 'stopped' : 'done',
      statusText: (batchStopRequested ? 'Đã dừng! ' : 'Hoàn thành! ') +
        totalFiles + ' shop' +
        (totalSkipped > 0 ? ', ' + totalSkipped + ' bỏ qua' : '') +
        (totalFailed > 0 ? ', ' + totalFailed + ' lỗi' : ''),
      totalFiles: totalFiles,
      totalSkipped: totalSkipped,
      totalFailed: totalFailed,
      totalProcessed: totalProcessed
    });
  }
}

// === MESSAGE HANDLER ===

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {

  // Lay username shop tu shopId (giu nguyen)
  if (request.action === 'getShopUsername') {
    fetch('https://shopee.vn/api/v4/shop/get_shop_detail?shopid=' + request.shopId)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data && data.data) {
          var username = (data.data.account && data.data.account.username) || null;
          var shopName = data.data.name || username || '';
          sendResponse({ username: username, shopName: shopName });
        } else {
          sendResponse({ username: null, shopName: '' });
        }
      })
      .catch(function () {
        sendResponse({ username: null, shopName: '' });
      });
    return true;
  }

  // Bat dau batch processing (Hoa hong San pham)
  if (request.action === 'startBatch') {
    if (batchRunning) {
      sendResponse({ error: 'Đang chạy rồi' });
      return;
    }
    startBatchProcessing(request.tabId, request.maxPages, request.fields);
    sendResponse({ started: true });
    return true;
  }

  // Fetch tat ca nganh hang tu trang shopee_offer (cho popup hien checkbox)
  if (request.action === 'fetchAllCategories') {
    (async function () {
      try {
        var tabId = request.tabId;
        var allCategories = [];
        var catPage = 1;

        while (true) {
          try {
            await chrome.scripting.executeScript({ target: { tabId: tabId }, func: scrollToLoadAll });
          } catch (e) { }
          await sleep(2000);

          var catResults = await chrome.scripting.executeScript({
            target: { tabId: tabId }, func: extractShopeeOfferCategories
          });
          var pageCats = (catResults[0] && catResults[0].result) || [];

          for (var ci = 0; ci < pageCats.length; ci++) {
            var exists = false;
            for (var ei = 0; ei < allCategories.length; ei++) {
              if (allCategories[ei].catId === pageCats[ci].catId) { exists = true; break; }
            }
            if (!exists) allCategories.push(pageCats[ci]);
          }

          // Thu chuyen trang tiep
          var nextClicked = false;
          try {
            await chrome.scripting.executeScript({
              target: { tabId: tabId },
              func: function() { window.scrollTo(0, document.body.scrollHeight); }
            });
          } catch (e) { }
          await sleep(1500);
          try {
            var clickRes = await chrome.scripting.executeScript({ target: { tabId: tabId }, func: clickListingNextPage });
            nextClicked = clickRes[0] && clickRes[0].result;
          } catch (e) { }

          if (!nextClicked) break;
          catPage++;
          await sleep(3000);
        }

        // Quay lai trang 1 (neu co nhieu trang)
        if (catPage > 1) {
          try {
            var curTab = await chrome.tabs.get(tabId);
            var baseUrl = (curTab.url || '').split('?')[0];
            await chrome.tabs.update(tabId, { url: baseUrl });
            await waitForTabComplete(tabId);
            await sleep(2000);
          } catch (e) { }
        }

        sendResponse({ categories: allCategories });
      } catch (e) {
        sendResponse({ categories: [] });
      }
    })();
    return true;
  }

  // Bat dau Shopee Offer processing (Hoa hong Shopee - nganh hang)
  if (request.action === 'startShopeeOffer') {
    if (batchRunning) {
      sendResponse({ error: 'Đang chạy rồi' });
      return;
    }
    startShopeeOfferProcessing(request.tabId, request.fields, request.categories);
    sendResponse({ started: true });
    return true;
  }

  // Tiep tuc batch (resume)
  if (request.action === 'resumeBatch') {
    if (batchRunning) {
      sendResponse({ error: 'Đang chạy rồi' });
      return;
    }
    startBatchProcessing(request.tabId, 0, null, {
      allProductLinks: state.allProductLinks || [],
      resumeIndex: state.resumeIndex || 0,
      savedProcessedShopIds: state.savedProcessedShopIds || {},
      savedFields: state.savedFields
    });
    sendResponse({ started: true });
    return true;
  }

  // Dung batch
  if (request.action === 'stopBatch') {
    batchStopRequested = true;
    // Ngat port content.js ngay lap tuc de dung quet shop
    if (currentScrapePort) {
      try { currentScrapePort.postMessage({ action: 'stop' }); } catch (e) { }
      try { currentScrapePort.disconnect(); } catch (e) { }
      currentScrapePort = null;
    }
    sendResponse({ stopped: true });
  }

  // Lay trang thai hien tai
  if (request.action === 'getBatchState') {
    sendResponse({ state: state });
  }
});

// === RESTORE STATE + CLEAR ON TAB RELOAD ===

// Khoi phuc state tu storage khi service worker khoi dong lai
chrome.storage.local.get('batchState', function (data) {
  if (data && data.batchState) {
    state = data.batchState;
    if (state.running) {
      // Service worker restart → batch khong con chay
      state.running = false;
      state.phase = 'stopped';
      state.statusText = 'Đã dừng (mất kết nối)';
      chrome.storage.local.set({ batchState: state });
    }
  }
});

// Khi tab duoc reload/navigate → xoa trang thai cu (stopped, processing, collecting)
// Doc tu storage thay vi in-memory state (tranh race condition khi service worker restart)
chrome.tabs.onUpdated.addListener(function (tabId, changeInfo) {
  if (changeInfo.status === 'loading' && !batchRunning) {
    chrome.storage.local.get('batchState', function (data) {
      if (data && data.batchState && data.batchState.batchTabId &&
          tabId === data.batchState.batchTabId &&
          data.batchState.phase && data.batchState.phase !== 'done') {
        state = defaultState();
        chrome.storage.local.set({ batchState: state });
      }
    });
  }
});
