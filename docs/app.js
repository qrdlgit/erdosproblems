/**
 * Main Application Logic for Erdos Problems Interactive Table
 * Coordinates data loading, rendering, sorting, and filtering
 */

// Global state
let allProblems = [];
let filteredProblems = [];
let currentSort = { column: 'number', direction: 'asc' };

/**
 * Load problems from YAML file
 * @returns {Promise<Array<Object>>} Array of problem objects
 */
async function loadProblems() {
    try {
        const rawYamlUrl = 'https://raw.githubusercontent.com/teorth/erdosproblems/main/data/problems.yaml';
        const response = await fetch(rawYamlUrl);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const yamlText = await response.text();
        const problems = jsyaml.load(yamlText);

        if (!Array.isArray(problems)) {
            throw new Error('Invalid YAML format: expected array of problems');
        }

        return problems;
    } catch (error) {
        console.error('Error loading problems:', error);
        showError('Failed to load problems data. Please try refreshing the page.');
        return [];
    }
}

/**
 * Display error message to user
 * @param {string} message - Error message to display
 */
function showError(message) {
    const tableBody = document.getElementById('table-body');
    if (tableBody) {
        tableBody.innerHTML = `<tr><td colspan="7" class="loading-cell" style="color: red;">${escapeHtml(message)}</td></tr>`;
    }
}

/**
 * Sort problems by column
 * @param {Array<Object>} problems - Array of problems to sort
 * @param {string} column - Column name to sort by
 * @param {string} direction - Sort direction ('asc' or 'desc')
 * @returns {Array<Object>} Sorted array of problems
 */
function sortProblems(problems, column, direction) {
    return [...problems].sort((a, b) => {
        let valA = getColumnValue(a, column);
        let valB = getColumnValue(b, column);

        // Handle numeric sorting for 'number' column
        if (column === 'number') {
            valA = parseInt(valA, 10) || 0;
            valB = parseInt(valB, 10) || 0;
        }

        // Handle prize amount sorting
        if (column === 'prize') {
            valA = parsePrize(valA);
            valB = parsePrize(valB);
        }

        // String comparison for other columns
        if (typeof valA === 'string') {
            valA = valA.toLowerCase();
        }
        if (typeof valB === 'string') {
            valB = valB.toLowerCase();
        }

        // Compare values
        let comparison = 0;
        if (valA > valB) {
            comparison = 1;
        } else if (valA < valB) {
            comparison = -1;
        }

        return direction === 'asc' ? comparison : -comparison;
    });
}

/**
 * Render table with problems data
 * @param {Array<Object>} problems - Array of problems to render
 */
function renderTable(problems) {
    const tableBody = document.getElementById('table-body');
    if (!tableBody) return;

    if (problems.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="7" class="loading-cell">No problems match the current filters.</td></tr>';
        updateStats(0, allProblems.length);
        return;
    }

    // Build table rows
    const rows = problems.map(problem => {
        const number = problem.number || '';
        const prize = problem.prize || 'no';
        const status = problem.status || {};
        const formalized = problem.formalized || {};
        const oeis = problem.oeis || [];
        const tags = problem.tags || [];
        const comments = problem.comments || '';

        return `
            <tr>
                <td>${renderProblemLink(number)}</td>
                <td>${renderPrize(prize)}</td>
                <td>${renderStatus(status)}</td>
                <td>${renderFormalizedLink(number, formalized.state)}</td>
                <td>${renderOEISLinks(oeis)}</td>
                <td>${renderTags(tags)}</td>
                <td>${renderComments(comments)}</td>
            </tr>
        `;
    }).join('');

    tableBody.innerHTML = rows;

    // Update stats
    updateStats(problems.length, allProblems.length);
}

/**
 * Update statistics display
 * @param {number} showing - Number of problems currently shown
 * @param {number} total - Total number of problems
 */
function updateStats(showing, total) {
    const showingCount = document.getElementById('showing-count');
    if (showingCount) {
        showingCount.textContent = `Showing ${showing.toLocaleString()} of ${total.toLocaleString()} problems`;
    }
}

/**
 * Handle sort header click
 * @param {Event} event - Click event
 */
function handleSortClick(event) {
    const header = event.currentTarget;
    const column = header.getAttribute('data-sort');

    if (!column) return;

    // Toggle direction if clicking same column, otherwise default to asc
    if (currentSort.column === column) {
        currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        currentSort.column = column;
        currentSort.direction = 'asc';
    }

    // Update visual indicators
    updateSortIndicators(currentSort.column, currentSort.direction);

    // Re-render table
    updateTable();

    // Save state to URL
    saveStateToURL(getCurrentState());
}

function export_problems(problems, opts = {}) {
  const {
    format = (document.getElementById("export-format")?.value || "json"),
    filenamePrefix = "erdosproblems_filtered",
    prettyJson = true,
    includeTimestamp = true
  } = opts;

  if (!Array.isArray(problems) || problems.length === 0) {
    alert("No problems to export (current filter result is empty).");
    return;
  }

  const timestamp = includeTimestamp
    ? new Date().toISOString().replace(/[:.]/g, "-")
    : "";

  const baseName = timestamp ? `${filenamePrefix}_${timestamp}` : filenamePrefix;

  if (format === "csv") {
    const csv = problemsToCSV(problems);
    downloadTextFile(`${baseName}.csv`, csv, "text/csv;charset=utf-8");
    return;
  }

  // default: JSON
  const json = prettyJson ? JSON.stringify(problems, null, 2) : JSON.stringify(problems);
  downloadTextFile(`${baseName}.json`, json, "application/json;charset=utf-8");
}

function downloadTextFile(filename, text, mimeType) {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();

  a.remove();
  URL.revokeObjectURL(url);
}

function problemsToCSV(problems) {
  // Pick stable, human-usable columns for a flat export
  const headers = ["number", "prize", "status", "formalized", "oeis", "tags", "comments"];

  const rows = problems.map(p => {
    const number = p?.number ?? "";
    const prize = p?.prize ?? "";
    const status = normalizeStatus(p?.status);
    const formalized = normalizeFormalized(p?.formalized);
    const oeis = Array.isArray(p?.oeis) ? p.oeis.join(" ") : (p?.oeis ?? "");
    const tags = Array.isArray(p?.tags) ? p.tags.join(" ") : (p?.tags ?? "");
    const comments = p?.comments ?? "";

    return [number, prize, status, formalized, oeis, tags, comments].map(csvCell);
  });

  return [headers.map(csvCell).join(","), ...rows.map(r => r.join(","))].join("\n");
}

function normalizeStatus(status) {
  if (status == null) return "";
  if (typeof status === "string") return status;
  // Your data uses objects in some places (e.g. status/state fields)
  if (typeof status === "object") {
    return status.state ?? status.status ?? JSON.stringify(status);
  }
  return String(status);
}

function normalizeFormalized(formalized) {
  if (formalized == null) return "";
  if (typeof formalized === "string") return formalized;
  if (typeof formalized === "object") {
    return formalized.state ?? formalized.formalized ?? JSON.stringify(formalized);
  }
  return String(formalized);
}

function csvCell(value) {
  const s = value == null ? "" : String(value);
  // Escape for CSV: wrap in quotes if it contains commas/quotes/newlines
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}






/**
 * Update table with current filters and sort
 */
function updateTable() {
    const searchBox = document.getElementById('search-box');
    const searchQuery = searchBox ? searchBox.value : '';

    // Apply search
    let results = searchProblems(allProblems, searchQuery);

    // Apply filters
    const filters = getCurrentFilters();
    results = applyFilters(results, filters);

    // Apply sort
    results = sortProblems(results, currentSort.column, currentSort.direction);

    // Store filtered results
    filteredProblems = results;

    // Update tag and dropdown displays with filtered counts
    const nonTagFiltersActive = hasNonTagFilters();

    // Update tag display (excludes tag filters from count calculation)
    if (nonTagFiltersActive) {
        window._filteredTagCounts = extractTagCounts(filteredProblems);
        window._hasActiveFilters = true;
    } else {
        window._filteredTagCounts = null;
        window._hasActiveFilters = false;
    }

    // Trigger tag re-sort with current sort preference to apply two-tier sorting
    const tagSortAlpha = document.getElementById('tag-sort-alpha');
    const currentTagSort = tagSortAlpha && tagSortAlpha.checked ? 'alpha' : 'count';
    resortTagFilters(currentTagSort);

    // Update dropdown displays (each dropdown excludes its own filter from count calculation)
    const hasAnyFilters = nonTagFiltersActive || (filters.tags && filters.tags.length > 0);
    updateAllDropdownDisplays(allProblems, hasAnyFilters);

    // Render
    renderTable(results);

    // Save state to URL
    saveStateToURL(getCurrentState());
}

/**
 * Initialize sort event listeners
 */
function initializeSortListeners() {
    document.querySelectorAll('th.sortable').forEach(header => {
        header.addEventListener('click', handleSortClick);
    });
}

/**
 * Initialize the application
 */
async function initialize() {
    // Show loading indicator
    const loadingIndicator = document.getElementById('loading-indicator');
    if (loadingIndicator) {
        loadingIndicator.style.display = 'inline';
    }

    // Load problems data
    allProblems = await loadProblems();

    if (allProblems.length === 0) {
        if (loadingIndicator) {
            loadingIndicator.style.display = 'none';
        }
        return;
    }

    // Update header and meta description with actual problem count
    const problemCount = allProblems.length.toLocaleString();
    const headerSubtitle = document.getElementById('header-subtitle');
    if (headerSubtitle) {
        headerSubtitle.textContent = `Interactive table of ${problemCount} mathematical problems`;
    }
    const metaDescription = document.getElementById('meta-description');
    if (metaDescription) {
        metaDescription.setAttribute('content', `Interactive table of ${problemCount} mathematical problems from the Erdős problem database`);
    }

    // Set filter change handler FIRST (before creating any event listeners)
    setFilterChangeHandler(updateTable);

    // Extract tag counts and tags
    const tagCounts = extractTagCounts(allProblems);

    // Store globally for tag sort functionality
    window._allProblems = allProblems;
    window._tagCounts = tagCounts;
    window._filteredTagCounts = null;
    window._hasActiveFilters = false;

    // Store original dropdown option text
    ['filter-status', 'filter-prize', 'filter-formalized', 'filter-oeis'].forEach(selectId => {
        const select = document.getElementById(selectId);
        if (select) {
            const options = select.querySelectorAll('option:not([value=""])');
            options.forEach(option => {
                option.setAttribute('data-original', option.textContent);
            });
        }
    });

    // Load state from URL
    const urlState = loadStateFromURL();
    currentSort.column = urlState.sortColumn;
    currentSort.direction = urlState.sortDirection;

    // Get initial tag sort preference from URL
    const initialTagSort = urlState.tagSort || 'count';

    // Extract and populate tags with initial sort
    const allTags = extractAllTags(allProblems, initialTagSort, tagCounts);
    populateTagFilters(allTags, tagCounts);

    // Restore UI state
    restoreUIState(urlState);

    // Initialize event listeners
    initializeSortListeners();
    initializeFilterListeners();

    // Initial render
    updateTable();

    // Hide loading indicator
    if (loadingIndicator) {
        loadingIndicator.style.display = 'none';
    }

   
    const btn = document.getElementById("export-problems");
    if (!btn) return;
    
    btn.addEventListener("click", () => {
    // filteredProblems is updated every time updateTable() runs :contentReference[oaicite:1]{index=1}
    export_problems(filteredProblems);
    });
    
    console.log(`Loaded ${allProblems.length} problems successfully`);
}

// Start the application when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
}
