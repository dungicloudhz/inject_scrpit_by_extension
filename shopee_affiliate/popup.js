/**
 * popup.js v6 - Shopee Affiliate Scraper
 *
 * Flow 1 (Single): Chi tiet affiliate → Start → quet 1 shop → Excel
 * Flow 2 (Batch):  Gui lenh cho background.js → chay ngam → popup chi hien progress
 */

(function () {
  'use strict';

  // === DOM REFERENCES ===
  var startBtn = document.getElementById('startBtn');
  var stopBtn = document.getElementById('stopBtn');
  var downloadBtn = document.getElementById('downloadBtn');
  var statusEl = document.getElementById('status');
  var shopInfoEl = document.getElementById('shopInfo');
  var shopNameEl = document.getElementById('shopName');
  var progressSection = document.getElementById('progressSection');
  var progressFill = document.getElementById('progressFill');
  var progressText = document.getElementById('progressText');
  var errorEl = document.getElementById('error');
  var resultSummary = document.getElementById('resultSummary');
  var resultCount = document.getElementById('resultCount');
  var resultPages = document.getElementById('resultPages');

  var optName = document.getElementById('opt_name');
  var optShop = document.getElementById('opt_shop');
  var optPrice = document.getElementById('opt_price');
  var optCommission = document.getElementById('opt_commission');
  var optPercent = document.getElementById('opt_percent');
  var optSales = document.getElementById('opt_sales');

  var listingControlsEl = document.getElementById('listingControls');
  var listingPagesInput = document.getElementById('listingPages');
  var batchProgressEl = document.getElementById('batchProgress');
  var batchLabelEl = document.getElementById('batchLabel');
  var productLabelEl = document.getElementById('productLabel');
  var batchProgressFill = document.getElementById('batchProgressFill');
  var batchTextEl = document.getElementById('batchText');

  var categoryControlsEl = document.getElementById('categoryControls');
  var categoryLoadingEl = document.getElementById('categoryLoading');
  var categoryListEl = document.getElementById('categoryList');
  var categorySelectAllEl = document.getElementById('categorySelectAll');
  var categoryCheckboxesEl = document.getElementById('categoryCheckboxes');

  // === STATE ===
  var port = null;
  var scrapedData = null;
  var shopName = '';
  var storedCommissionPercent = 0;
  var isListingMode = false;
  var isShopeeOfferMode = false;
  var isBatchStopped = false;
  var fetchedCategories = []; // danh sach nganh hang da load tu trang

  // === UI HELPERS ===

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.classList.remove('hidden');
  }

  function hideError() {
    errorEl.classList.add('hidden');
  }

  function setStatus(msg, stateClass) {
    statusEl.textContent = msg;
    statusEl.classList.remove('active', 'stopped');
    if (stateClass === true || stateClass === 'active') statusEl.classList.add('active');
    else if (stateClass === 'stopped') statusEl.classList.add('stopped');
  }

  function updateProgress(current, total, products) {
    progressSection.classList.remove('hidden');
    var pct = total > 0 ? Math.min((current / total) * 100, 100) : 0;
    progressFill.style.width = pct + '%';
    progressText.textContent = 'Trang ' + current + '/' + total + ' — ' + products + ' sản phẩm';
  }

  function getSelectedFields() {
    return {
      name: optName.checked,
      shop: optShop.checked,
      price: optPrice.checked,
      commission: optCommission.checked,
      percent: optPercent.checked,
      sales: optSales.checked
    };
  }

  function resetUI() {
    stopBtn.classList.add('hidden');
    startBtn.classList.remove('hidden');
    startBtn.innerHTML = '&#9654; Bắt đầu thu thập';
    isBatchStopped = false;
  }

  // === CATEGORY UI HELPERS ===

  function buildCategoryCheckboxes(categories) {
    fetchedCategories = categories;
    categoryCheckboxesEl.innerHTML = '';
    for (var i = 0; i < categories.length; i++) {
      var cat = categories[i];
      var label = document.createElement('label');
      label.className = 'cb-item';
      label.innerHTML =
        '<input type="checkbox" class="cat-cb" data-catid="' + cat.catId + '" checked>' +
        '<span class="cb-check"></span>' +
        '<span class="cat-number">' + (i + 1) + '</span>' +
        '<span class="cb-text">' + (cat.name || 'Ngành ' + cat.catId) + '</span>';
      categoryCheckboxesEl.appendChild(label);
    }
    categoryLoadingEl.classList.add('hidden');
    categoryListEl.classList.remove('hidden');
    // Bind su kien cho tung checkbox con
    var cbs = categoryCheckboxesEl.querySelectorAll('.cat-cb');
    for (var j = 0; j < cbs.length; j++) {
      cbs[j].addEventListener('change', syncSelectAll);
    }
  }

  function syncSelectAll() {
    var cbs = categoryCheckboxesEl.querySelectorAll('.cat-cb');
    var allChecked = true;
    for (var i = 0; i < cbs.length; i++) {
      if (!cbs[i].checked) { allChecked = false; break; }
    }
    categorySelectAllEl.checked = allChecked;
  }

  function getSelectedCategories() {
    var selected = [];
    var cbs = categoryCheckboxesEl.querySelectorAll('.cat-cb');
    for (var i = 0; i < cbs.length; i++) {
      if (cbs[i].checked) {
        var catId = cbs[i].getAttribute('data-catid');
        // Tim category tuong ung trong fetchedCategories
        for (var j = 0; j < fetchedCategories.length; j++) {
          if (fetchedCategories[j].catId === catId) {
            selected.push(fetchedCategories[j]);
            break;
          }
        }
      }
    }
    return selected;
  }

  function loadCategoriesFromPage(tabId) {
    categoryControlsEl.classList.remove('hidden');
    categoryLoadingEl.classList.remove('hidden');
    categoryListEl.classList.add('hidden');

    chrome.runtime.sendMessage({
      action: 'fetchAllCategories',
      tabId: tabId
    }, function (response) {
      if (response && response.categories && response.categories.length > 0) {
        buildCategoryCheckboxes(response.categories);
        setStatus('Tìm thấy ' + response.categories.length + ' ngành hàng — Chọn và bấm Bắt đầu', false);
      } else {
        categoryLoadingEl.textContent = 'Không tìm thấy ngành hàng. Kiểm tra lại trang.';
        setStatus('Lỗi tải ngành hàng', false);
      }
    });
  }

  // === RENDER BATCH STATE (tu background.js qua storage) ===

  function renderBatchState(s) {
    if (!s) return;

    if (s.running) {
      isBatchStopped = false;
      startBtn.classList.add('hidden');
      stopBtn.classList.remove('hidden');
      downloadBtn.classList.add('hidden');

      setStatus(s.statusText || 'Đang xử lý...', true);

      // Show batch progress
      if (s.phase === 'processing' && s.totalProducts > 0) {
        progressSection.classList.remove('hidden');
        batchProgressEl.classList.remove('hidden');

        if (s.mode === 'shopeeOffer') {
          batchLabelEl.textContent = 'Ngành ' + (s.currentCategory || 0) + '/' + (s.totalCategories || 0) + (s.currentCategoryName ? ' — ' + s.currentCategoryName : '');
        } else {
          batchLabelEl.textContent = (s.categoryName ? s.categoryName + ' — ' : '') + 'Trang ' + (s.currentListingPage || 1) + '/' + (s.maxPages || 1);
        }
        productLabelEl.textContent = 'SP ' + (s.currentProduct || 0) + '/' + (s.totalProducts || 0);

        var pct = s.totalProducts > 0 ? Math.min((s.currentProduct / s.totalProducts) * 100, 100) : 0;
        batchProgressFill.style.width = pct + '%';
        batchTextEl.textContent = s.currentProductName || 'Đang xử lý...';

        // Shop scraping progress
        if (s.shopTotalPages > 0) {
          var shopPct = Math.min((s.shopCurrentPage / s.shopTotalPages) * 100, 100);
          progressFill.style.width = shopPct + '%';
          progressText.textContent = 'Shop trang ' + s.shopCurrentPage + '/' + s.shopTotalPages + ' — ' + (s.shopProductsCount || 0) + ' SP';
        }
      } else if (s.phase === 'collecting') {
        progressSection.classList.remove('hidden');
        batchProgressEl.classList.add('hidden');
        progressFill.style.width = '0%';
        progressText.textContent = 'Đang thu thập danh sách...';
      }
    } else {
      if (s.phase === 'stopped') {
        // Dung: do, nut tiep tuc
        isBatchStopped = true;
        stopBtn.classList.add('hidden');
        downloadBtn.classList.add('hidden');
        startBtn.classList.remove('hidden');
        if (s.mode === 'shopeeOffer') {
          startBtn.innerHTML = '&#9654; Bắt đầu lại';
        } else {
          startBtn.innerHTML = '&#9654; Tiếp tục quét';
        }

        setStatus(s.statusText || 'Đã dừng', 'stopped');

        // Hien progress cho den dau
        if (s.totalProducts > 0) {
          progressSection.classList.remove('hidden');
          batchProgressEl.classList.remove('hidden');
          if (s.mode === 'shopeeOffer') {
            batchLabelEl.textContent = 'Ngành ' + (s.currentCategory || 0) + '/' + (s.totalCategories || 0) + (s.currentCategoryName ? ' — ' + s.currentCategoryName : '');
          } else {
            batchLabelEl.textContent = (s.categoryName ? s.categoryName + ' — ' : '') + 'Trang ' + (s.currentListingPage || 1) + '/' + (s.maxPages || 1);
          }
          productLabelEl.textContent = 'SP ' + (s.currentProduct || 0) + '/' + (s.totalProducts || 0);
          var pct = s.totalProducts > 0 ? Math.min((s.currentProduct / s.totalProducts) * 100, 100) : 0;
          batchProgressFill.style.width = pct + '%';
          batchTextEl.textContent = (s.totalFiles || 0) + ' file, ' + (s.totalSkipped || 0) + ' bỏ qua';
        }
      } else if (s.phase === 'done') {
        // Hoan thanh
        isBatchStopped = false;
        resetUI();
        setStatus(s.statusText || 'Hoàn thành', false);

        if (s.totalProcessed > 0) {
          resultSummary.classList.remove('hidden');
          resultCount.textContent = s.totalProcessed;
          resultPages.textContent = s.totalFiles || 0;

          var resultFilesSection = document.getElementById('resultFilesSection');
          var resultDivider2 = document.getElementById('resultDivider2');
          var resultFiles = document.getElementById('resultFiles');
          if (resultFilesSection && resultDivider2 && resultFiles) {
            resultFilesSection.classList.remove('hidden');
            resultDivider2.classList.remove('hidden');
            resultFiles.textContent = s.totalFiles || 0;
          }
        }

        if (s.errorText) {
          showError(s.errorText);
        }
      }
    }
  }

  // === LOAD BATCH STATE ON POPUP OPEN ===

  async function loadBatchState() {
    try {
      var data = await chrome.storage.local.get('batchState');
      if (data && data.batchState) {
        var s = data.batchState;
        if (s.running || s.phase === 'stopped') {
          // Batch dang chay hoac da dung → hien progress
          if (s.mode === 'shopeeOffer') {
            isShopeeOfferMode = true;
            // Khong hien listing controls cho shopee offer
          } else {
            isListingMode = true;
            listingControlsEl.classList.remove('hidden');
          }
          renderBatchState(s);
          return true;
        }
      }
    } catch (e) { }
    return false;
  }

  // === LISTEN FOR STATE CHANGES (real-time) ===

  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area === 'local' && changes.batchState) {
      renderBatchState(changes.batchState.newValue);
    }
  });

  // === DETECT PAGE MODE ===

  async function detectPageMode() {
    // Kiem tra batch dang chay khong
    var batchActive = await loadBatchState();
    if (batchActive) return;

    try {
      var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      var tab = tabs[0];
      if (!tab || !tab.url) return;

      var url = tab.url;
      var isListing = url.indexOf('affiliate.shopee.vn/offer/product_offer') !== -1 &&
                      !url.match(/product_offer\/\d+/);
      var isShopeeOffer = url.indexOf('affiliate.shopee.vn/offer/shopee_offer') !== -1 &&
                          !url.match(/shopee_offer\/\d+/);

      if (isShopeeOffer) {
        isShopeeOfferMode = true;
        isListingMode = false;
        setStatus('Đang tải danh sách ngành hàng...', true);
        loadCategoriesFromPage(tab.id);
      } else if (isListing) {
        isListingMode = true;
        isShopeeOfferMode = false;
        listingControlsEl.classList.remove('hidden');
        setStatus('Trang danh sách sản phẩm — Nhập số trang và bấm Bắt đầu', false);
      } else if (url.indexOf('affiliate.shopee.vn') !== -1) {
        isListingMode = false;
        isShopeeOfferMode = false;
        setStatus('Sẵn sàng — Bấm Bắt đầu để thu thập', false);
      } else if (url.indexOf('shopee.vn') !== -1) {
        isListingMode = false;
        isShopeeOfferMode = false;
        setStatus('Trang Shopee — Bấm Bắt đầu để thu thập', false);
      }
    } catch (e) { }
  }

  // === INJECTED FUNCTIONS (cho single mode) ===

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

  function extractShopIdFromProductPage() {
    var result = { shopId: 0 };
    var urlMatch = window.location.href.match(/-i\.(\d+)\.\d+/);
    if (urlMatch) result.shopId = parseInt(urlMatch[1]);
    if (!result.shopId) {
      var canonical = document.querySelector('link[rel="canonical"]');
      if (canonical) {
        var m = (canonical.href || '').match(/-i\.(\d+)\.\d+/);
        if (m) result.shopId = parseInt(m[1]);
      }
    }
    if (!result.shopId) {
      var html = document.body.innerHTML || '';
      var m3 = html.match(/"shop_?id"\s*:\s*(\d{5,})/i);
      if (m3) result.shopId = parseInt(m3[1]);
    }
    return result;
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

  // === AUTO DOWNLOAD EXCEL (cho single mode) ===

  function autoDownloadExcel(products, fileShopName) {
    if (!products || products.length === 0) return false;
    try {
      var fields = getSelectedFields();
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
      var date = new Date().toISOString().split('T')[0];
      var safeName = (fileShopName || 'shopee').replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, '_').substring(0, 50);
      var fileName = safeName + '_products_' + date + '.xlsx';

      var blob = new Blob([xlsxData], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return true;
    } catch (e) {
      return false;
    }
  }

  // === SINGLE PRODUCT FLOW (giu nguyen, chay trong popup) ===

  async function startSingleProductFlow(tab) {
    var isAffiliatePage = tab.url.indexOf('affiliate.shopee.vn') !== -1;

    if (isAffiliatePage) {
      try {
        setStatus('Đang đọc thông tin hoa hồng...', true);

        var results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: extractFromAffiliatePage
        });
        var data = results[0].result;

        if (!data || !data.productUrl) {
          showError('Không tìm thấy link "Xem sản phẩm".');
          resetUI();
          return;
        }

        storedCommissionPercent = data.commissionPercent || 0;

        if (storedCommissionPercent > 0) {
          setStatus('Hoa hồng Xtra: ' + storedCommissionPercent + '% — Đang mở trang sản phẩm...', true);
        } else {
          setStatus('Đang mở trang sản phẩm...', true);
        }

        await chrome.tabs.update(tab.id, { url: data.productUrl });
        await waitForTabComplete(tab.id);
        await new Promise(function (r) { setTimeout(r, 4000); });

        setStatus('Đang lấy thông tin shop...', true);

        var productResults = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: extractShopIdFromProductPage
        });

        var productData = productResults[0].result;
        var shopId = productData ? productData.shopId : 0;

        if (!shopId) {
          var currentTab = await chrome.tabs.get(tab.id);
          if (currentTab && currentTab.url) {
            var urlM = currentTab.url.match(/-i\.(\d+)\.\d+/);
            if (urlM) shopId = parseInt(urlM[1]);
          }
        }

        if (!shopId) {
          showError('Không tìm thấy thông tin shop.');
          resetUI();
          return;
        }

        setStatus('Đang lấy thông tin cửa hàng...', true);
        var shopData = await new Promise(function (resolve) {
          chrome.runtime.sendMessage({ action: 'getShopUsername', shopId: shopId }, function (response) {
            resolve(response || {});
          });
        });

        if (!shopData.username) {
          showError('Không thể lấy thông tin shop (ID: ' + shopId + ')');
          resetUI();
          return;
        }

        shopName = shopData.shopName || shopData.username;
        shopNameEl.textContent = shopName;
        shopInfoEl.classList.remove('hidden');

        setStatus('Đang mở trang shop: ' + shopName + '...', true);
        var shopUrl = 'https://shopee.vn/' + shopData.username + '?sortBy=sales';

        await chrome.tabs.update(tab.id, { url: shopUrl });
        await waitForTabComplete(tab.id);
        await new Promise(function (r) { setTimeout(r, 4000); });

      } catch (e) {
        showError('Lỗi: ' + e.message);
        resetUI();
        return;
      }
    }

    setStatus('Đang kết nối với trang shop...', true);
    await connectAndScrape(tab.id);
  }

  // === KET NOI VA SCRAPE (cho single mode) ===

  async function connectAndScrape(tabId) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['content.js']
      });
    } catch (e) { }

    await new Promise(function (r) { setTimeout(r, 1000); });

    try {
      port = chrome.tabs.connect(tabId, { name: 'shopee-scraper' });
    } catch (e) {
      showError('Không thể kết nối với trang.');
      resetUI();
      return;
    }

    port.onMessage.addListener(function (msg) {
      switch (msg.type) {
        case 'info':
          if (msg.shopName) {
            shopName = msg.shopName;
            shopNameEl.textContent = shopName;
            shopInfoEl.classList.remove('hidden');
          }
          break;
        case 'status':
          setStatus(msg.message, true);
          break;
        case 'progress':
          updateProgress(msg.currentPage, msg.totalPages, msg.productsCount);
          break;
        case 'complete':
          scrapedData = msg.products;
          shopName = msg.shopName || shopName;
          setStatus('Hoàn thành! ' + msg.totalProducts + ' sản phẩm', false);
          stopBtn.classList.add('hidden');
          downloadBtn.classList.remove('hidden');
          resultSummary.classList.remove('hidden');
          resultCount.textContent = msg.totalProducts;
          resultPages.textContent = msg.totalPages;
          progressFill.style.width = '100%';
          break;
        case 'error':
          showError(msg.message);
          resetUI();
          setStatus('Lỗi', false);
          break;
      }
    });

    port.onDisconnect.addListener(function () {
      if (!scrapedData) {
        setStatus('Mất kết nối', false);
        resetUI();
      }
      port = null;
    });

    port.postMessage({
      action: 'start',
      commissionPercent: storedCommissionPercent,
      fields: getSelectedFields()
    });
  }

  // === EVENT HANDLERS ===

  startBtn.addEventListener('click', async function () {
    hideError();
    scrapedData = null;
    storedCommissionPercent = 0;

    var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    var tab = tabs[0];

    if (!tab || !tab.url) {
      showError('Không thể đọc thông tin tab.');
      return;
    }

    var isAffiliatePage = tab.url.indexOf('affiliate.shopee.vn') !== -1;
    var isShopeePage = tab.url.indexOf('shopee.vn') !== -1 && !isAffiliatePage;

    if (!isAffiliatePage && !isShopeePage) {
      showError('Vui lòng mở trang affiliate.shopee.vn hoặc shopee.vn');
      return;
    }

    startBtn.classList.add('hidden');
    stopBtn.classList.remove('hidden');
    downloadBtn.classList.add('hidden');
    resultSummary.classList.add('hidden');

    // Re-check mode tu URL (phong truong hop detectPageMode chua chay xong)
    if (!isShopeeOfferMode && isAffiliatePage &&
        tab.url.indexOf('affiliate.shopee.vn/offer/shopee_offer') !== -1 &&
        !tab.url.match(/shopee_offer\/\d+/)) {
      isShopeeOfferMode = true;
    }
    if (!isListingMode && !isShopeeOfferMode && isAffiliatePage &&
        tab.url.indexOf('affiliate.shopee.vn/offer/product_offer') !== -1 &&
        !tab.url.match(/product_offer\/\d+/)) {
      isListingMode = true;
      listingControlsEl.classList.remove('hidden');
    }

    if (isShopeeOfferMode) {
      // === SHOPEE OFFER MODE: quet cac nganh hang da chon ===
      var selectedCats = getSelectedCategories();
      if (selectedCats.length === 0) {
        showError('Vui lòng chọn ít nhất 1 ngành hàng.');
        resetUI();
        return;
      }
      var fields = getSelectedFields();
      setStatus('Đang khởi động quét ' + selectedCats.length + ' ngành hàng...', true);

      chrome.runtime.sendMessage({
        action: 'startShopeeOffer',
        tabId: tab.id,
        fields: fields,
        categories: selectedCats
      }, function (response) {
        if (response && response.error) {
          showError(response.error);
          resetUI();
        }
      });
    } else if (isListingMode) {
      if (isBatchStopped) {
        // === RESUME MODE ===
        setStatus('Đang tiếp tục...', true);
        isBatchStopped = false;
        chrome.runtime.sendMessage({
          action: 'resumeBatch',
          tabId: tab.id
        }, function (response) {
          if (response && response.error) {
            showError(response.error);
            resetUI();
          }
        });
      } else {
        // === BATCH MODE: gui lenh cho background.js ===
        var maxPages = parseInt(listingPagesInput.value) || 1;
        var fields = getSelectedFields();

        setStatus('Đang khởi động batch...', true);

        chrome.runtime.sendMessage({
          action: 'startBatch',
          tabId: tab.id,
          maxPages: maxPages,
          fields: fields
        }, function (response) {
          if (response && response.error) {
            showError(response.error);
            resetUI();
          }
        });
      }
    } else {
      // === SINGLE MODE: chay trong popup ===
      await startSingleProductFlow(tab);
    }
  });

  stopBtn.addEventListener('click', function () {
    if (isListingMode || isShopeeOfferMode) {
      // Gui stop cho background.js
      chrome.runtime.sendMessage({ action: 'stopBatch' });
      setStatus('Đang dừng...', true);
    } else {
      if (port) port.postMessage({ action: 'stop' });
      stopBtn.classList.add('hidden');
      startBtn.classList.remove('hidden');
      setStatus('Đã dừng', false);
    }
  });

  downloadBtn.addEventListener('click', function () {
    if (!scrapedData || scrapedData.length === 0) {
      showError('Không có dữ liệu');
      return;
    }
    if (autoDownloadExcel(scrapedData, shopName)) {
      setStatus('Đã tải file Excel', false);
    } else {
      showError('Lỗi tạo Excel');
    }
  });

  // === SELECT ALL TOGGLE ===
  categorySelectAllEl.addEventListener('change', function () {
    var checked = categorySelectAllEl.checked;
    var cbs = categoryCheckboxesEl.querySelectorAll('.cat-cb');
    for (var i = 0; i < cbs.length; i++) {
      cbs[i].checked = checked;
    }
  });

  // === KHOI TAO ===
  detectPageMode();

})();
