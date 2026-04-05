const DATA_URL = "./data.json";
const PAGE_SIZE = 20;
const CONFIDENCE_ORDER = { high: 0, medium: 1, low: 2, "": 3 };

const state = {
  records: [],
  filtered: [],
  selectedId: null,
  currentPage: 1,
};

const refs = {
  searchInput: document.querySelector("#searchInput"),
  titleStatusFilter: document.querySelector("#titleStatusFilter"),
  bodyStatusFilter: document.querySelector("#bodyStatusFilter"),
  dynastyFilter: document.querySelector("#dynastyFilter"),
  sortOrder: document.querySelector("#sortOrder"),
  resetFiltersButton: document.querySelector("#resetFiltersButton"),
  fileInput: document.querySelector("#fileInput"),
  totalRows: document.querySelector("#totalRows"),
  visibleRows: document.querySelector("#visibleRows"),
  resultMeta: document.querySelector("#resultMeta"),
  resultList: document.querySelector("#resultList"),
  prevPageButton: document.querySelector("#prevPageButton"),
  nextPageButton: document.querySelector("#nextPageButton"),
  pageMeta: document.querySelector("#pageMeta"),
  recordModal: document.querySelector("#recordModal"),
  modalBackdrop: document.querySelector("#modalBackdrop"),
  closeModalButton: document.querySelector("#closeModalButton"),
  modalTitle: document.querySelector("#modalTitle"),
  detailMeta: document.querySelector("#detailMeta"),
  detailView: document.querySelector("#detailView"),
};

boot();

async function boot() {
  bindEvents();

  try {
    const response = await fetch(DATA_URL);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const text = await response.text();
    hydrateRecords(parseJsonLines(text), "scaffold_v1");
  } catch (error) {
    refs.detailView.classList.add("empty-state");
    refs.detailView.textContent =
      "未能自動讀取 scaffold 檔案。請用靜態伺服器開啟本頁，或點擊「載入本地 JSONL」。";
    refs.detailMeta.textContent = `自動載入失敗: ${error.message}`;
    refs.resultList.classList.add("empty-state");
    refs.resultList.textContent = "暫無資料";
  }
}

function bindEvents() {
  [
    refs.searchInput,
    refs.titleStatusFilter,
    refs.bodyStatusFilter,
    refs.dynastyFilter,
    refs.sortOrder,
  ].forEach((element) => {
    element.addEventListener("input", renderFromFilters);
    element.addEventListener("change", renderFromFilters);
  });

  refs.resetFiltersButton.addEventListener("click", () => {
    refs.searchInput.value = "";
    refs.titleStatusFilter.value = "";
    refs.bodyStatusFilter.value = "";
    refs.dynastyFilter.value = "";
    refs.sortOrder.value = "id-asc";
    state.currentPage = 1;
    renderFromFilters();
  });

  refs.prevPageButton.addEventListener("click", () => {
    if (state.currentPage > 1) {
      state.currentPage -= 1;
      renderFromFilters();
    }
  });

  refs.nextPageButton.addEventListener("click", () => {
    const totalPages = Math.max(1, Math.ceil(state.filtered.length / PAGE_SIZE));
    if (state.currentPage < totalPages) {
      state.currentPage += 1;
      renderFromFilters();
    }
  });

  refs.fileInput.addEventListener("change", async (event) => {
    const [file] = event.target.files || [];
    if (!file) {
      return;
    }

    const text = await file.text();
    hydrateRecords(parseJsonLines(text), file.name);
    event.target.value = "";
  });

  refs.closeModalButton.addEventListener("click", closeModal);
  refs.modalBackdrop.addEventListener("click", closeModal);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeModal();
    }
  });
}

function hydrateRecords(records, sourceLabel) {
  state.records = records.map(enrichRecord);
  state.selectedId = null;
  state.currentPage = 1;

  refs.totalRows.textContent = formatNumber(state.records.length);

  populateFilterOptions("titleStatusFilter", uniqueValues(state.records, "title_status"));
  populateFilterOptions("bodyStatusFilter", uniqueValues(state.records, "body_status"));
  populateFilterOptions("dynastyFilter", uniqueDynasties(state.records));

  renderFromFilters();
}

function populateFilterOptions(selectKey, values) {
  const select = refs[selectKey];
  const current = select.value;

  select.innerHTML = '<option value="">全部</option>';
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.append(option);
  });

  select.value = values.includes(current) ? current : "";
}

function renderFromFilters() {
  const query = refs.searchInput.value.trim().toLowerCase();
  const titleStatus = refs.titleStatusFilter.value;
  const bodyStatus = refs.bodyStatusFilter.value;
  const dynasty = refs.dynastyFilter.value;
  const sortOrder = refs.sortOrder.value;

  const filtered = state.records
    .filter((record) => {
      if (titleStatus && record.title_status !== titleStatus) {
        return false;
      }
      if (bodyStatus && record.body_status !== bodyStatus) {
        return false;
      }
      if (dynasty && !record.dynasties_best.includes(dynasty)) {
        return false;
      }
      if (!query) {
        return true;
      }
      return record.searchBlob.includes(query);
    })
    .sort((left, right) => compareRecords(left, right, sortOrder));

  state.filtered = filtered;

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  if (state.currentPage > totalPages) {
    state.currentPage = totalPages;
  }
  if (state.currentPage < 1) {
    state.currentPage = 1;
  }

  const pageStart = (state.currentPage - 1) * PAGE_SIZE;
  const pageRecords = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  if (!filtered.some((record) => record.id === state.selectedId)) {
    closeModal();
  }

  refs.visibleRows.textContent = formatNumber(filtered.length);
  refs.resultMeta.textContent =
    filtered.length
      ? `第 ${formatNumber(pageStart + 1)}-${formatNumber(
          Math.min(pageStart + PAGE_SIZE, filtered.length)
        )} 条，共 ${formatNumber(filtered.length)} 条`
      : "共 0 条";

  refs.pageMeta.textContent = `第 ${state.currentPage} / ${totalPages} 页`;
  refs.prevPageButton.disabled = state.currentPage <= 1;
  refs.nextPageButton.disabled = state.currentPage >= totalPages;

  renderResults(pageRecords);
}

function renderResults(records) {
  refs.resultList.classList.remove("empty-state");
  refs.resultList.innerHTML = "";

  if (!records.length) {
    refs.resultList.classList.add("empty-state");
    refs.resultList.textContent = "沒有符合條件的結果";
    return;
  }

  const table = document.createElement("table");
  table.className = "results-table";
  table.innerHTML = `
    <thead>
      <tr>
        <th class="col-id">ID</th>
        <th class="col-title">標題</th>
        <th class="col-dynasty">朝代</th>
        <th class="col-gloss">釋義</th>
        <th class="col-status">狀態</th>
      </tr>
    </thead>
  `;
  const tbody = document.createElement("tbody");

  records.forEach((record) => {
    const row = document.createElement("tr");
    row.dataset.id = String(record.id);
    row.classList.toggle("is-active", record.id === state.selectedId);
    row.innerHTML = `
      <td><span class="result-id">#${record.id}</span></td>
      <td>
        <h3 class="result-title">${escapeHtml(displayTitle(record))}</h3>
        <p class="result-subtitle">${escapeHtml(
          [
            record.headword_wadegiles_best ? `WG: ${record.headword_wadegiles_best}` : "",
            record.headword_pinyin_best ? `拼音: ${record.headword_pinyin_best}` : "",
          ]
            .filter(Boolean)
            .join(" • ")
        )}</p>
      </td>
      <td>${escapeHtml((record.dynasties_best || []).join(", ") || "—")}</td>
      <td>${escapeHtml(record.gloss_en_best || "—")}</td>
      <td></td>
    `;

    const statusCell = row.children[4];
    [
      { label: record.title_status || "unknown", status: record.title_status || "" },
      record.llm_confidence ? { label: `confidence:${record.llm_confidence}`, status: "" } : null,
    ]
      .filter(Boolean)
      .forEach((item) => statusCell.append(renderBadge(item.label, item.status)));

    row.addEventListener("click", () => {
      openModal(record.id);
      renderResults(records);
    });

    tbody.append(row);
  });

  table.append(tbody);
  refs.resultList.append(table);
}

function openModal(id) {
  state.selectedId = id;
  renderDetail(id);
  refs.recordModal.classList.remove("hidden");
  refs.recordModal.setAttribute("aria-hidden", "false");
}

function closeModal() {
  state.selectedId = null;
  refs.recordModal.classList.add("hidden");
  refs.recordModal.setAttribute("aria-hidden", "true");
  refs.detailMeta.textContent = "選擇一筆記錄查看";
  refs.modalTitle.textContent = "記錄詳情";
  refs.detailView.classList.add("empty-state");
  refs.detailView.textContent = "點擊表格列查看詳情";
  renderResults(currentPageRecords());
}

function currentPageRecords() {
  const pageStart = (state.currentPage - 1) * PAGE_SIZE;
  return state.filtered.slice(pageStart, pageStart + PAGE_SIZE);
}

function renderDetail(id) {
  const record = state.filtered.find((item) => item.id === id) || null;

  refs.detailView.classList.remove("empty-state");
  refs.detailView.innerHTML = "";

  if (!record) {
    refs.detailView.classList.add("empty-state");
    refs.detailView.textContent = "選擇左側結果查看詳情";
    refs.detailMeta.textContent = "未選取記錄";
    return;
  }

  refs.detailMeta.textContent = `ID ${record.id}`;
  refs.modalTitle.textContent = displayTitle(record);

  const wrapper = document.createElement("article");
  wrapper.innerHTML = `
    <section class="detail-header">
      <div class="detail-id">#${record.id}</div>
      <h1 class="detail-headword">${escapeHtml(displayTitle(record))}</h1>
      <p class="detail-secondary">${escapeHtml(
        [record.headword_chinese_best, record.headword_pinyin_best, record.gloss_en_best]
          .filter(Boolean)
          .join(" • ")
      )}</p>
      <div class="detail-badges"></div>
    </section>
    <section class="detail-sections">
      <div class="detail-section">
        <h3>標題層</h3>
        <div class="detail-meta-grid"></div>
      </div>
      <div class="detail-section">
        <h3>正文</h3>
        <pre>${escapeHtml(record.body_best || "暫無內容")}</pre>
      </div>
      <div class="detail-section">
        <h3>問題標記</h3>
        <div class="detail-issues"></div>
      </div>
      <div class="detail-section">
        <h3>備註</h3>
        <p>${escapeHtml(record.notes || "無")}</p>
      </div>
      <div class="detail-section">
        <details class="raw-json-panel">
          <summary>原始 JSON</summary>
          <pre>${escapeHtml(JSON.stringify(record.raw, null, 2))}</pre>
        </details>
      </div>
    </section>
  `;

  const badges = wrapper.querySelector(".detail-badges");
  [
    { label: `title:${record.title_status}`, status: record.title_status },
    { label: `body:${record.body_status}`, status: record.body_status },
    ...(record.dynasties_best || []).map((item) => ({ label: item, status: "" })),
    record.llm_confidence
      ? { label: `confidence:${record.llm_confidence}`, status: "" }
      : null,
  ]
    .filter(Boolean)
    .forEach((item) => badges.append(renderBadge(item.label, item.status)));

  const metaGrid = wrapper.querySelector(".detail-meta-grid");
  [
    ["羅馬字", record.headword_romanized_best],
    ["中文", record.headword_chinese_best],
    ["Wade-Giles", record.headword_wadegiles_best],
    ["拼音", record.headword_pinyin_best],
    ["釋義", record.gloss_en_best],
    ["來源條目 ID", joinArray(record.source_entry_ids)],
    ["起始頁", record.start_page],
    ["起始欄", record.start_column],
    ["標題模型", record.title_model_last_used],
    ["正文模型", record.body_model_last_used],
  ].forEach(([label, value]) => metaGrid.append(renderKeyValue(label, value)));

  const issuesContainer = wrapper.querySelector(".detail-issues");
  if (record.issues.length) {
    record.issues.forEach((issue) => issuesContainer.append(renderBadge(issue)));
  } else {
    issuesContainer.append(renderBadge("無"));
  }

  refs.detailView.append(wrapper);
}

function compareRecords(left, right, sortOrder) {
  switch (sortOrder) {
    case "id-desc":
      return right.id - left.id;
    case "confidence":
      return (
        (CONFIDENCE_ORDER[left.llm_confidence] ?? 99) -
          (CONFIDENCE_ORDER[right.llm_confidence] ?? 99) || left.id - right.id
      );
    case "title":
      return displayTitle(left).localeCompare(displayTitle(right));
    case "id-asc":
    default:
      return left.id - right.id;
  }
}

function enrichRecord(record) {
  const safeRecord = {
    dynasties_best: [],
    source_entry_ids: [],
    issues: [],
    ...record,
  };

  return {
    ...safeRecord,
    searchBlob: [
      safeRecord.id,
      safeRecord.title_status,
      safeRecord.body_status,
      safeRecord.headword_raw_best,
      safeRecord.headword_romanized_best,
      safeRecord.headword_chinese_best,
      safeRecord.headword_wadegiles_best,
      safeRecord.headword_pinyin_best,
      safeRecord.gloss_en_best,
      safeRecord.body_best,
      ...(safeRecord.dynasties_best || []),
      ...(safeRecord.issues || []),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase(),
    raw: safeRecord,
  };
}

function parseJsonLines(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`JSONL parse error on line ${index + 1}: ${error.message}`);
      }
    });
}

function uniqueValues(records, key) {
  return [...new Set(records.map((record) => record[key]).filter(Boolean))].sort();
}

function uniqueDynasties(records) {
  return [...new Set(records.flatMap((record) => record.dynasties_best || []).filter(Boolean))].sort();
}

function renderBadge(label, status = "") {
  const span = document.createElement("span");
  span.className = "badge";
  span.textContent = label;
  if (status) {
    span.dataset.status = status;
  }
  return span;
}

function renderKeyValue(label, value) {
  const div = document.createElement("div");
  div.className = "kv";
  div.innerHTML = `<strong>${escapeHtml(label)}</strong><span>${escapeHtml(
    value === undefined || value === null || value === "" ? "—" : String(value)
  )}</span>`;
  return div;
}

function primaryTitle(record) {
  return (
    record.headword_raw_best ||
    record.headword_romanized_best ||
    record.headword_chinese_best ||
    record.gloss_en_best ||
    `Untitled #${record.id}`
  );
}

function displayTitle(record) {
  const preferred = [
    record.headword_wadegiles_best,
    record.headword_pinyin_best,
    record.headword_chinese_best,
  ].filter(Boolean);

  if (preferred.length) {
    return preferred.join(" / ");
  }

  return primaryTitle(record);
}

function joinArray(values) {
  return Array.isArray(values) && values.length ? values.join(", ") : "—";
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(value);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
