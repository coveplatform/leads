const form = document.getElementById("inquiry-form");
const statusEl = document.getElementById("form-status");

function setStatus(message, type = "") {
  statusEl.textContent = message;
  statusEl.classList.remove("is-success", "is-error");
  if (type) {
    statusEl.classList.add(type === "success" ? "is-success" : "is-error");
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
