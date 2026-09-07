const form = document.getElementById("app-form");
const list = document.getElementById("apps");
const empty = document.getElementById("empty");
const appId = document.getElementById("app-id");
const nameInput = document.getElementById("name");
const urlInput = document.getElementById("url");
const categoryInput = document.getElementById("category");
const descriptionInput = document.getElementById("description");
const imageInput = document.getElementById("image");
const imagePreview = document.getElementById("image-preview");
const previewImg = document.getElementById("preview-img");
const removePreviewBtn = document.getElementById("remove-preview");
const cancelBtn = document.getElementById("cancel-btn");
const formTitle = document.getElementById("form-title");
const saveBtn = document.getElementById("save-btn");
const template = document.getElementById("app-item-template");
const logoutBtn = document.getElementById("logout-btn");
const formError = document.getElementById("form-error");
const searchInput = document.getElementById("search");
const categoryFilter = document.getElementById("category-filter");
const categorySuggestions = document.getElementById("category-suggestions");
const countLabel = document.getElementById("count");
const pagination = document.getElementById("pagination");
const loadingState = document.getElementById("loading-state");
const loadError = document.getElementById("load-error");
const retryLoadBtn = document.getElementById("retry-load-btn");
const prevPageBtn = document.getElementById("prev-page");
const nextPageBtn = document.getElementById("next-page");
const pageInfo = document.getElementById("page-info");
const addAppBtn = document.getElementById("add-app-btn");
const formSection = document.getElementById("form-section");
const emptyIcon = document.getElementById("empty-icon");
const emptyMessage = document.getElementById("empty-message");
const emptyHint = document.getElementById("empty-hint");
const themeToggleBtn = document.getElementById("theme-toggle-btn");
const viewToggleBtn = document.getElementById("view-toggle-btn");
const listTemplate = document.getElementById("app-list-item-template");
const exportBtn = document.getElementById("export-btn");
const importBtn = document.getElementById("import-btn");
const importZipInput = document.getElementById("import-zip-input");
const toast = document.getElementById("toast");
const closeFormBtn = document.getElementById("close-form-btn");
const formBackdrop = document.getElementById("form-backdrop");
const clearSearchBtn = document.getElementById("clear-search-btn");
const searchShortcut = document.querySelector(".search-shortcut");
const emptyAddBtn = document.getElementById("empty-add-btn");
const appLibrary = document.getElementById("app-library");

const maxImageBytes = 1 * 1024 * 1024;
const maxImageSize = 1024;
const pageSize = 6;

let allApps = [];
let currentPage = 1;
let lastImageError = "";
let lastTotalPages = 1;
let toastTimeout = null;
let lastFormTrigger = addAppBtn;

function showToast(message, type = "success") {
  if (!toast) return;
  if (toastTimeout) {
    clearTimeout(toastTimeout);
  }
  toast.textContent = message;
  toast.classList.remove("toast-success", "toast-error");
  toast.classList.add(type === "error" ? "toast-error" : "toast-success");
  toast.hidden = false;
  toastTimeout = setTimeout(() => {
    toast.hidden = true;
  }, 3200);
}

function normalizeUrl(url) {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  return `http://${trimmed}`;
}

async function fetchApps() {
  const response = await fetch("/api/apps");
  if (response.status === 401) {
    window.location.href = "/login.html";
    return [];
  }
  if (!response.ok) {
    throw new Error("Failed to fetch apps");
  }
  return response.json();
}

async function fetchCategories() {
  try {
    const response = await fetch("/api/apps/categories");
    if (response.ok) {
      return response.json();
    }
  } catch (err) {
    console.error("Failed to fetch categories:", err);
  }
  return [];
}

function getDownloadFileName(contentDisposition, fallback) {
  if (!contentDisposition) return fallback;
  const match = contentDisposition.match(/filename="?([^";]+)"?/i);
  if (!match || !match[1]) return fallback;
  return match[1];
}

async function exportBackup() {
  const response = await fetch("/api/apps/export");
  if (response.status === 401) {
    window.location.href = "/login.html";
    return;
  }
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "Failed to export backup");
  }

  const blob = await response.blob();
  const fallback = `homelinks-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.zip`;
  const filename = getDownloadFileName(response.headers.get("content-disposition"), fallback);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function importBackup(file) {
  const payload = new FormData();
  payload.append("backup", file);

  const response = await fetch("/api/apps/import", {
    method: "POST",
    body: payload,
  });

  if (response.status === 401) {
    window.location.href = "/login.html";
    return;
  }

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "Failed to import backup");
  }
}

function updateCategorySuggestions(categories) {
  categorySuggestions.innerHTML = "";
  categories.forEach((cat) => {
    const option = document.createElement("option");
    option.value = cat;
    categorySuggestions.appendChild(option);
  });
}

function updateCategoryFilter(categories) {
  const currentValue = categoryFilter.value;
  categoryFilter.innerHTML = '<option value="">All categories</option>';
  categories.forEach((cat) => {
    const option = document.createElement("option");
    option.value = cat;
    option.textContent = cat;
    categoryFilter.appendChild(option);
  });
  if (categories.includes(currentValue)) {
    categoryFilter.value = currentValue;
  }
}

function setFormError(message) {
  formError.textContent = message;
  formError.hidden = !message;
}

function paginate(items) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  if (currentPage > totalPages) currentPage = totalPages;
  const start = (currentPage - 1) * pageSize;
  const end = start + pageSize;
  return {
    pageItems: items.slice(start, end),
    totalPages,
  };
}

function renderPagination(totalItems, totalPages) {
  if (totalItems <= pageSize) {
    pagination.hidden = true;
    return;
  }
  pagination.hidden = false;
  lastTotalPages = totalPages;
  const isNarrow = window.matchMedia("(max-width: 480px)").matches;
  pageInfo.textContent = isNarrow
    ? `${currentPage} of ${totalPages}`
    : `Page ${currentPage} of ${totalPages}`;
  prevPageBtn.disabled = currentPage === 1;
  nextPageBtn.disabled = currentPage === totalPages;
}

function getFilteredApps() {
  const query = searchInput.value.trim().toLowerCase();
  const selectedCategory = categoryFilter.value.trim();

  let filtered = allApps;

  // Filter by category
  if (selectedCategory) {
    filtered = filtered.filter((app) => app.category === selectedCategory);
  }

  // Filter by search query (name, url, or description)
  if (query) {
    filtered = filtered.filter((app) =>
      app.name.toLowerCase().includes(query) ||
      app.url.toLowerCase().includes(query) ||
      (app.category && app.category.toLowerCase().includes(query)) ||
      (app.description && app.description.toLowerCase().includes(query))
    );
  }

  return filtered;
}

function closeForm(restoreFocus = true) {
  formSection.hidden = true;
  document.body.classList.remove("editor-open");

  if (restoreFocus && lastFormTrigger && document.contains(lastFormTrigger)) {
    lastFormTrigger.focus();
  }
}

function resetForm(restoreFocus = true) {
  appId.value = "";
  formTitle.textContent = "New app";
  saveBtn.textContent = "Save app";
  form.reset();
  imageInput.value = "";
  categoryInput.value = "";
  descriptionInput.value = "";
  imagePreview.hidden = true;
  previewImg.src = "";
  lastImageError = "";
  setFormError("");
  closeForm(restoreFocus);
}

function showForm() {
  if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) {
    lastFormTrigger = document.activeElement;
  }
  formSection.hidden = false;
  document.body.classList.add("editor-open");
  nameInput.focus();
}

function getDisplayUrl(url) {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/$/, "");
    return `${parsed.host}${path}`;
  } catch {
    return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
  }
}

function setOptionalField(element, value) {
  if (value) {
    element.textContent = value;
    element.hidden = false;
  } else {
    element.hidden = true;
  }
}

function renderApps(apps) {
  list.innerHTML = "";

  const isSearching = searchInput.value.trim().length > 0;
  const isFiltering = categoryFilter.value.trim().length > 0;
  const hasApps = apps.length > 0;

  empty.hidden = hasApps;

  if (!hasApps) {
    if (isSearching) {
      emptyIcon.setAttribute("data-lucide", "search-x");
      emptyMessage.textContent = "Nothing matches your search";
      emptyHint.textContent = "Try another name, URL, category or description.";
      emptyAddBtn.hidden = true;
    } else if (isFiltering) {
      emptyIcon.setAttribute("data-lucide", "list-filter");
      emptyMessage.textContent = "No apps in this category";
      emptyHint.textContent = "Choose another category to see more services.";
      emptyAddBtn.hidden = true;
    } else if (allApps.length === 0) {
      emptyIcon.setAttribute("data-lucide", "inbox");
      emptyMessage.textContent = "No apps here yet";
      emptyHint.textContent = "Add your first service to start building your home dashboard.";
      emptyAddBtn.hidden = false;
    }
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  }

  // Determinar vista actual
  const currentView = getStoredView();
  const currentTemplate = currentView === "list" ? listTemplate : template;
  const isListView = currentView === "list";
  function appendSectionTitle(text) {
    const title = document.createElement("li");
    title.className = "apps-section-title";
    title.textContent = text;
    list.appendChild(title);
  }

  function renderApp(app) {
    const node = currentTemplate.content.cloneNode(true);

    // Selectors depending on view
    const item = node.querySelector(isListView ? ".app-list-item" : ".app-card");
    const thumb = node.querySelector(isListView ? ".list-item-thumbnail" : ".app-thumbnail");
    const name = node.querySelector(isListView ? ".list-item-name" : ".app-name");
    const link = node.querySelector(isListView ? ".list-item-url" : ".app-url");
    const category = node.querySelector(isListView ? ".list-item-category" : ".app-category");
    const description = node.querySelector(isListView ? ".list-item-description" : ".app-description");
    const openBtn = node.querySelector(".open");
    const editBtn = node.querySelector(".edit");
    const deleteBtn = node.querySelector(".delete");
    const favoriteBtn = node.querySelector(".btn-favorite");
    const starIcon = node.querySelector(".star-icon");

    name.textContent = app.name;
    link.textContent = getDisplayUrl(app.url);
    link.href = app.url;
    link.title = app.url;

    // Display category and description if they exist
    setOptionalField(category, app.category);
    setOptionalField(description, app.description);

    if (app.image_url) {
      thumb.src = app.image_url;
      thumb.loading = "lazy";
      thumb.decoding = "async";
      thumb.hidden = false;
    } else {
      thumb.hidden = true;
    }

    // Configurar estado de favorito
    if (app.favorite) {
      item.classList.add("is-favorite");
      starIcon.setAttribute("data-lucide", "star");
      starIcon.classList.add("star-filled");
    } else {
      starIcon.setAttribute("data-lucide", "star");
      starIcon.classList.remove("star-filled");
    }

    favoriteBtn.setAttribute("aria-pressed", app.favorite ? "true" : "false");
    favoriteBtn.setAttribute(
      "aria-label",
      app.favorite ? `Remove ${app.name} from favorites` : `Add ${app.name} to favorites`
    );
    favoriteBtn.title = app.favorite ? "Remove from favorites" : "Add to favorites";
    openBtn.setAttribute("aria-label", `Open ${app.name} in a new tab`);
    editBtn.setAttribute("aria-label", `Edit ${app.name}`);
    deleteBtn.setAttribute("aria-label", `Delete ${app.name}`);

    favoriteBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      favoriteBtn.disabled = true;
      try {
        const response = await fetch(`/api/apps/${app.id}/favorite`, { method: "PATCH" });
        if (response.status === 401) {
          window.location.href = "/login.html";
          return;
        }
        if (response.ok) {
          await load();
        } else {
          showToast("Could not update favorite", "error");
        }
      } catch (err) {
        console.error("Error toggling favorite:", err);
        showToast("Could not update favorite", "error");
      } finally {
        favoriteBtn.disabled = false;
      }
    });

    openBtn.addEventListener("click", () => {
      link.click();
    });

    editBtn.addEventListener("click", () => {
      appId.value = app.id;
      nameInput.value = app.name;
      urlInput.value = app.url;
      categoryInput.value = app.category || "";
      descriptionInput.value = app.description || "";
      formTitle.textContent = "Edit app";
      saveBtn.textContent = "Save changes";

      // Mostrar imagen actual en el preview si existe
      if (app.image_url) {
        previewImg.src = app.image_url;
        imagePreview.hidden = false;
        if (typeof lucide !== 'undefined') {
          lucide.createIcons();
        }
      } else {
        imagePreview.hidden = true;
        previewImg.src = "";
      }

      showForm();
    });

    deleteBtn.addEventListener("click", async () => {
      if (!confirm(`Delete "${app.name}"?`)) return;

      deleteBtn.disabled = true;
      const originalMarkup = deleteBtn.innerHTML;
      deleteBtn.innerHTML = '<i data-lucide="loader-circle" class="spin"></i>';
      if (typeof lucide !== "undefined") {
        lucide.createIcons();
      }

      try {
        const response = await fetch(`/api/apps/${app.id}`, { method: "DELETE" });
        if (response.status === 401) {
          window.location.href = "/login.html";
          return;
        }
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          showToast(data.error || "Failed to delete app", "error");
          return;
        }
        await load();
        showToast("App deleted successfully", "success");
      } catch (err) {
        console.error("Error deleting app:", err);
        showToast("Network error, please try again", "error");
      } finally {
        deleteBtn.disabled = false;
        deleteBtn.innerHTML = originalMarkup;
        if (typeof lucide !== "undefined") {
          lucide.createIcons();
        }
      }
    });

    list.appendChild(item);
  }

  const favorites = apps.filter((app) => app.favorite);
  const others = apps.filter((app) => !app.favorite);

  if (favorites.length > 0) {
    appendSectionTitle("Favorites");
    favorites.forEach(renderApp);
    if (others.length > 0) {
      appendSectionTitle("Apps");
    }
    others.forEach(renderApp);
  } else {
    apps.forEach(renderApp);
  }

  // Renderizar iconos de Lucide en los elementos dinámicos
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}

async function load() {
  const showLoading = allApps.length === 0;
  loadError.hidden = true;
  if (showLoading) {
    loadingState.hidden = false;
    list.hidden = true;
    empty.hidden = true;
  }

  try {
    allApps = await fetchApps();
    const categories = await fetchCategories();
    updateCategorySuggestions(categories);
    updateCategoryFilter(categories);
    renderAndPaginate();
  } catch (err) {
    console.error("Failed to load apps:", err);
    allApps = [];
    renderAndPaginate();
    empty.hidden = true;
    loadError.hidden = false;
    if (typeof lucide !== "undefined") {
      lucide.createIcons();
    }
    showToast("Unable to load apps. Please try again.", "error");
  } finally {
    if (showLoading) {
      loadingState.hidden = true;
      list.hidden = false;
    }
  }
}

retryLoadBtn.addEventListener("click", () => {
  load();
});

function renderAndPaginate() {
  const filtered = getFilteredApps();
  const favorites = filtered.filter((app) => app.favorite);
  const nonFavorites = filtered.filter((app) => !app.favorite);
  const { pageItems: nonFavoritePageItems, totalPages } = paginate(nonFavorites);
  const visibleApps = favorites.length > 0
    ? [...favorites, ...nonFavoritePageItems]
    : nonFavoritePageItems;

  renderApps(visibleApps);
  renderPagination(nonFavorites.length, totalPages);
  countLabel.textContent = `${filtered.length} app${filtered.length === 1 ? "" : "s"}`;
}

async function validateImageFile(file) {
  if (file.size > maxImageBytes) {
    return "Image must be <= 1MB";
  }

  const image = new Image();
  const objectUrl = URL.createObjectURL(file);

  try {
    const dimensions = await new Promise((resolve, reject) => {
      image.onload = () => resolve({ width: image.width, height: image.height });
      image.onerror = () => reject(new Error("Invalid image"));
      image.src = objectUrl;
    });

    if (dimensions.width > maxImageSize || dimensions.height > maxImageSize) {
      return "Image must be max 1024x1024";
    }
  } catch (err) {
    return "Invalid image file";
  } finally {
    URL.revokeObjectURL(objectUrl);
  }

  return "";
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = nameInput.value.trim();
  const url = normalizeUrl(urlInput.value);
  const category = categoryInput.value.trim();
  const description = descriptionInput.value.trim();
  if (!name || !url) return;
  if (lastImageError) return;

  // Deshabilitar botón y mostrar loading state
  saveBtn.disabled = true;
  const originalText = saveBtn.textContent;
  saveBtn.textContent = "Saving...";
  setFormError("");

  const payload = new FormData();
  payload.append("name", name);
  payload.append("url", url);
  if (category) {
    payload.append("category", category);
  }
  if (description) {
    payload.append("description", description);
  }
  if (imageInput.files[0]) {
    payload.append("image", imageInput.files[0]);
  }

  const id = appId.value;
  try {
    let response;
    if (id) {
      response = await fetch(`/api/apps/${id}`, {
        method: "PUT",
        body: payload,
      });
    } else {
      response = await fetch("/api/apps", {
        method: "POST",
        body: payload,
      });
    }

    if (response.status === 401) {
      window.location.href = "/login.html";
      return;
    }

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setFormError(data.error || "Failed to save app");
      return;
    }

    resetForm(false);
    await load();
    showToast(id ? "App updated successfully" : "App added successfully", "success");
    addAppBtn.focus();
  } catch (err) {
    console.error("Error saving app:", err);
    setFormError("Network error, please try again");
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = formSection.hidden ? "Save app" : originalText;
  }
});

cancelBtn.addEventListener("click", () => {
  resetForm();
});

imageInput.addEventListener("change", async () => {
  const file = imageInput.files[0];
  if (!file) {
    lastImageError = "";
    setFormError("");
    imagePreview.hidden = true;
    return;
  }

  const message = await validateImageFile(file);
  if (message) {
    lastImageError = message;
    setFormError(message);
    imageInput.value = "";
    imagePreview.hidden = true;
  } else {
    lastImageError = "";
    setFormError("");
    // Mostrar preview
    const reader = new FileReader();
    reader.onload = (e) => {
      previewImg.src = e.target.result;
      imagePreview.hidden = false;
      if (typeof lucide !== 'undefined') {
        lucide.createIcons();
      }
    };
    reader.readAsDataURL(file);
  }
});

removePreviewBtn.addEventListener("click", () => {
  imageInput.value = "";
  imagePreview.hidden = true;
  previewImg.src = "";
  lastImageError = "";
  setFormError("");
});

searchInput.addEventListener("input", () => {
  currentPage = 1;
  const hasQuery = searchInput.value.length > 0;
  clearSearchBtn.hidden = !hasQuery;
  searchShortcut.hidden = hasQuery;
  renderAndPaginate();
});

clearSearchBtn.addEventListener("click", () => {
  searchInput.value = "";
  clearSearchBtn.hidden = true;
  searchShortcut.hidden = false;
  currentPage = 1;
  renderAndPaginate();
  searchInput.focus();
});

categoryFilter.addEventListener("change", () => {
  currentPage = 1;
  renderAndPaginate();
});

prevPageBtn.addEventListener("click", () => {
  currentPage = Math.max(1, currentPage - 1);
  renderAndPaginate();
  appLibrary.scrollIntoView({ behavior: "smooth", block: "start" });
});

nextPageBtn.addEventListener("click", () => {
  currentPage += 1;
  renderAndPaginate();
  appLibrary.scrollIntoView({ behavior: "smooth", block: "start" });
});

if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/login.html";
  });
}

addAppBtn.addEventListener("click", () => {
  resetForm(false);
  showForm();
});

emptyAddBtn.addEventListener("click", () => {
  resetForm(false);
  showForm();
});

closeFormBtn.addEventListener("click", () => {
  resetForm();
});

formBackdrop.addEventListener("click", () => {
  resetForm();
});

if (exportBtn) {
  exportBtn.addEventListener("click", async () => {
    exportBtn.disabled = true;
    exportBtn.setAttribute("aria-busy", "true");
    const originalMarkup = exportBtn.innerHTML;
    exportBtn.innerHTML = '<i data-lucide="loader-circle" class="spin"></i><span class="action-label">Exporting</span>';
    if (typeof lucide !== "undefined") {
      lucide.createIcons();
    }
    try {
      await exportBackup();
      showToast("Backup exported successfully", "success");
    } catch (err) {
      showToast(err.message || "Failed to export backup", "error");
    } finally {
      exportBtn.disabled = false;
      exportBtn.removeAttribute("aria-busy");
      exportBtn.innerHTML = originalMarkup;
      if (typeof lucide !== 'undefined') {
        lucide.createIcons();
      }
    }
  });
}

if (importBtn && importZipInput) {
  importBtn.addEventListener("click", () => {
    importZipInput.value = "";
    importZipInput.click();
  });

  importZipInput.addEventListener("change", async () => {
    const file = importZipInput.files[0];
    if (!file) return;

    const confirmed = confirm(
      "This will replace all current apps and images with the ZIP backup. Continue?"
    );
    if (!confirmed) {
      importZipInput.value = "";
      return;
    }

    importBtn.disabled = true;
    importBtn.setAttribute("aria-busy", "true");
    const originalMarkup = importBtn.innerHTML;
    importBtn.innerHTML = '<i data-lucide="loader-circle" class="spin"></i><span class="action-label">Importing</span>';
    if (typeof lucide !== "undefined") {
      lucide.createIcons();
    }

    try {
      await importBackup(file);
      resetForm(false);
      currentPage = 1;
      await load();
      showToast("Backup imported successfully", "success");
    } catch (err) {
      showToast(err.message || "Failed to import backup", "error");
    } finally {
      importBtn.disabled = false;
      importBtn.removeAttribute("aria-busy");
      importBtn.innerHTML = originalMarkup;
      importZipInput.value = "";
      if (typeof lucide !== 'undefined') {
        lucide.createIcons();
      }
    }
  });
}

// Theme management
const THEMES = ["auto", "light", "dark"];
const THEME_ICONS = {
  auto: "monitor",
  light: "sun",
  dark: "moon"
};

const THEME_LABELS = {
  auto: "System",
  light: "Light",
  dark: "Dark"
};

function getStoredTheme() {
  return localStorage.getItem("theme") || "auto";
}

function setTheme(theme) {
  localStorage.setItem("theme", theme);

  // Remove all theme classes
  document.body.classList.remove("theme-light", "theme-dark");

  // Apply theme
  if (theme === "light") {
    document.body.classList.add("theme-light");
  } else if (theme === "dark") {
    document.body.classList.add("theme-dark");
  }
  // auto = no class, uses prefers-color-scheme

  // Update icon - clear and recreate
  const iconName = THEME_ICONS[theme];
  const currentIcon = document.getElementById("theme-icon");
  if (currentIcon) {
    currentIcon.innerHTML = "";
    currentIcon.setAttribute("data-lucide", iconName);

    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  }

  const nextTheme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
  const themeLabel = themeToggleBtn.querySelector(".action-label");
  if (themeLabel) {
    themeLabel.textContent = THEME_LABELS[theme];
  }
  themeToggleBtn.title = `Theme: ${THEME_LABELS[theme]}. Switch to ${THEME_LABELS[nextTheme]}`;
  themeToggleBtn.setAttribute(
    "aria-label",
    `Current theme: ${THEME_LABELS[theme]}. Switch to ${THEME_LABELS[nextTheme]}`
  );
}

function cycleTheme() {
  const current = getStoredTheme();
  const currentIndex = THEMES.indexOf(current);
  const nextIndex = (currentIndex + 1) % THEMES.length;
  const nextTheme = THEMES[nextIndex];
  setTheme(nextTheme);
}

// View management
const VIEW_MODES = ["grid", "list"];
const VIEW_ICONS = {
  grid: "grid-3x3",
  list: "list"
};

function getStoredView() {
  return localStorage.getItem("view") || "grid";
}

function setView(view, shouldRender = true) {
  localStorage.setItem("view", view);

  // Update list class
  if (view === "list") {
    list.classList.add("list-view");
  } else {
    list.classList.remove("list-view");
  }

  // Update icon
  const iconName = VIEW_ICONS[view];
  const currentIcon = document.getElementById("view-icon");
  if (currentIcon) {
    currentIcon.innerHTML = "";
    currentIcon.setAttribute("data-lucide", iconName);

    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  }

  const nextView = view === "grid" ? "list" : "grid";
  viewToggleBtn.title = `Switch to ${nextView} view`;
  viewToggleBtn.setAttribute("aria-label", `Current layout: ${view}. Switch to ${nextView} view`);

  if (shouldRender) {
    renderAndPaginate();
  }
}

function cycleView() {
  const current = getStoredView();
  const currentIndex = VIEW_MODES.indexOf(current);
  const nextIndex = (currentIndex + 1) % VIEW_MODES.length;
  const nextView = VIEW_MODES[nextIndex];
  setView(nextView);
}

// Initialize theme
setTheme(getStoredTheme());

themeToggleBtn.addEventListener("click", () => {
  cycleTheme();
});

// Initialize view
setView(getStoredView(), false);

viewToggleBtn.addEventListener("click", () => {
  cycleView();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !formSection.hidden) {
    resetForm();
    return;
  }

  if (
    event.key === "/" &&
    formSection.hidden &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)
  ) {
    event.preventDefault();
    searchInput.focus();
  }

  if (event.key === "Tab" && !formSection.hidden) {
    const focusable = Array.from(
      formSection.querySelectorAll(
        'button:not([disabled]):not([tabindex="-1"]), input:not([disabled]), textarea:not([disabled]), select:not([disabled])'
      )
    ).filter((element) => !element.hidden);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
});

load();

window.addEventListener("resize", () => {
  if (!pagination.hidden) {
    const isNarrow = window.matchMedia("(max-width: 480px)").matches;
    pageInfo.textContent = isNarrow
      ? `${currentPage} of ${lastTotalPages}`
      : `Page ${currentPage} of ${lastTotalPages}`;
  }
});
