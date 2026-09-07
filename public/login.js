const form = document.getElementById("login-form");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const errorBox = document.getElementById("login-error");
const togglePasswordBtn = document.getElementById("toggle-password-btn");

function setError(message) {
  errorBox.textContent = message;
  errorBox.hidden = !message;
}

async function checkSession() {
  try {
    const response = await fetch("/api/session");
    if (!response.ok) return;
    const data = await response.json();
    if (data.authenticated) {
      window.location.href = "/";
    }
  } catch (err) {
    console.error("Session check failed:", err);
  }
}

togglePasswordBtn.addEventListener("click", () => {
  const showPassword = passwordInput.type === "password";
  passwordInput.type = showPassword ? "text" : "password";
  togglePasswordBtn.title = showPassword ? "Hide password" : "Show password";
  togglePasswordBtn.setAttribute("aria-label", togglePasswordBtn.title);
  togglePasswordBtn.innerHTML = `<i data-lucide="${showPassword ? "eye-off" : "eye"}"></i>`;
  if (typeof lucide !== "undefined") {
    lucide.createIcons();
  }
  passwordInput.focus();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setError("");

  const submitBtn = event.target.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.setAttribute("aria-busy", "true");
  const originalMarkup = submitBtn.innerHTML;
  submitBtn.innerHTML = '<span>Signing in...</span><i data-lucide="loader-circle" class="spin"></i>';
  if (typeof lucide !== "undefined") {
    lucide.createIcons();
  }

  const payload = {
    email: emailInput.value.trim(),
    password: passwordInput.value,
  };

  try {
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      window.location.href = "/";
      return;
    }

    const data = await response.json().catch(() => ({}));
    setError(data.error || "Login failed");
  } catch (err) {
    console.error("Login error:", err);
    setError("Network error, please try again");
  } finally {
    submitBtn.disabled = false;
    submitBtn.removeAttribute("aria-busy");
    submitBtn.innerHTML = originalMarkup;
    if (typeof lucide !== "undefined") {
      lucide.createIcons();
    }
  }
});

checkSession();
