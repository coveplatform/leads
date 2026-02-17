const form = document.getElementById("inquiry-form");
const statusEl = document.getElementById("form-status");
const demoForm = document.getElementById("demo-form");
const demoStatusEl = document.getElementById("demo-status");

function setStatus(message, type = "") {
  statusEl.textContent = message;
  statusEl.classList.remove("is-success", "is-error");
  if (type) {
    statusEl.classList.add(type === "success" ? "is-success" : "is-error");
  }
}

function setDemoStatus(message, type = "") {
  demoStatusEl.textContent = message;
  demoStatusEl.classList.remove("success", "error");
  if (type) {
    demoStatusEl.classList.add(type);
  }
}

if (form) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const submitBtn = form.querySelector('button[type="submit"]');
    const formData = new FormData(form);

    const payload = {
      name: String(formData.get("name") || "").trim(),
      email: String(formData.get("email") || "").trim(),
      phone: String(formData.get("phone") || "").trim(),
      businessName: String(formData.get("businessName") || "").trim(),
      websiteUrl: String(formData.get("websiteUrl") || "").trim(),
      message: String(formData.get("message") || "").trim(),
    };

    if (!payload.name || !payload.email || !payload.businessName) {
      setStatus("Please fill in your name, email, and business name.", "error");
      return;
    }

    try {
      submitBtn.disabled = true;
      submitBtn.textContent = "Sending...";
      setStatus("Submitting your enquiry...");

      const response = await fetch("/api/website-inquiry", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();
      if (!response.ok || !result.ok) {
        throw new Error(result?.error || "Could not send enquiry");
      }

      form.reset();
      setStatus("Thanks. Your enquiry has been sent. I will reach out shortly.", "success");
    } catch (error) {
      setStatus(error.message || "Something went wrong. Please try again.", "error");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Send enquiry";
    }
  });
}

if (demoForm) {
  demoForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const submitBtn = document.getElementById("demo-btn");
    const btnText = document.getElementById("demo-btn-text");
    const phoneInput = document.getElementById("demo-phone");
    const phone = phoneInput.value.trim();

    if (!phone) {
      setDemoStatus("Please enter your phone number.", "error");
      return;
    }

    try {
      submitBtn.disabled = true;
      btnText.textContent = "Sending...";
      setDemoStatus("Sending demo SMS...");

      const response = await fetch("/api/demo", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ phone }),
      });

      const result = await response.json();
      if (!response.ok || !result.ok) {
        throw new Error(result?.error || "Could not send demo");
      }

      phoneInput.value = "";
      setDemoStatus("✓ SMS sent! Check your phone and reply to the questions.", "success");
    } catch (error) {
      setDemoStatus(error.message || "Something went wrong. Please try again.", "error");
    } finally {
      submitBtn.disabled = false;
      btnText.textContent = "Send me the demo";
    }
  });
}
