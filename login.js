(function () {
  const loginPanel = document.getElementById("login-panel");
  const welcomePanel = document.getElementById("welcome-panel");
  const submitButton = document.querySelector(".login-submit");
  const form = document.querySelector(".login-form");
  const emailInput = form.querySelector('input[name="email"]');
  const passwordInput = form.querySelector('input[name="password"]');
  const errorMessage = document.getElementById("login-error");

  function isFieldFilled(value) {
    return value.trim().length > 0;
  }

  function showError(text) {
    errorMessage.textContent = text;
    errorMessage.hidden = false;
  }

  function hideError() {
    errorMessage.textContent = "";
    errorMessage.hidden = true;
  }

  function showWelcome() {
    loginPanel.hidden = true;
    welcomePanel.hidden = false;
  }

  submitButton.addEventListener("click", function () {
    hideError();

    const email = emailInput.value;
    const password = passwordInput.value;

    if (!isFieldFilled(email) || !isFieldFilled(password)) {
      showError("Užpildykite el. paštą ir slaptažodį.");
      return;
    }

    showWelcome();
  });
})();
