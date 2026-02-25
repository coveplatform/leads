// ─── Hero Phone Animation ───
(function () {
  var container = document.getElementById("hero-messages");
  var typing = document.getElementById("hero-typing");
  var notifCard = document.getElementById("hero-notif");
  var phoneCol = document.querySelector(".hero__phone-wrap");
  var avatarEl = document.getElementById("hero-avatar");
  var bizNameEl = document.getElementById("hero-biz-name");
  var notifTitle = document.getElementById("notif-title");
  var notifBody = document.getElementById("notif-body");
  if (!container || !typing) return;

  var scenarios = [
    {
      biz: "Bay Plumbing", avatar: "BP",
      msgs: [
        { type: "recv", text: "Hi Sam! Thanks for contacting Bay Plumbing 👋\n\nWhat do you need help with?\nA) Blocked drain\nB) Leak\nC) Hot water\nD) General", delay: 1000 },
        { type: "sent", text: "B", delay: 1600 },
        { type: "recv", text: "A leak — got it. How urgent?\nA) Emergency — leaking now\nB) This week\nC) Just quoting", delay: 1200 },
        { type: "sent", text: "A", delay: 1400 },
        { type: "recv", text: "Flagged as urgent 🚨\nBay Plumbing will call you within minutes.", delay: 1200 },
        { type: "alert", text: "✅ Qualified in 45 seconds", delay: 800 },
      ],
      notif: { title: "🚨 New Urgent Lead", body: "Sam Thompson — Leaking pipe\nUrgency: Emergency · Call back ASAP" }
    },
    {
      biz: "Smile Dental", avatar: "SD",
      msgs: [
        { type: "recv", text: "Hi Lisa! Thanks for contacting Smile Dental 😊\n\nWhat's the visit for?\nA) Toothache / pain\nB) Check-up & clean\nC) Cosmetic\nD) Other", delay: 1000 },
        { type: "sent", text: "A", delay: 1400 },
        { type: "recv", text: "Sorry to hear that. How soon do you need to be seen?\nA) Today if possible\nB) Next few days\nC) Just booking ahead", delay: 1200 },
        { type: "sent", text: "A", delay: 1300 },
        { type: "recv", text: "Marked as urgent 🦷\nSmile Dental will call you shortly to book you in.", delay: 1200 },
        { type: "alert", text: "✅ Qualified in 40 seconds", delay: 800 },
      ],
      notif: { title: "🦷 New Urgent Lead", body: "Lisa Chen — Toothache / pain\nUrgency: Today · Call to book in" }
    },
    {
      biz: "Spark Electrical", avatar: "SE",
      msgs: [
        { type: "recv", text: "Hi James! Thanks for reaching out to Spark Electrical ⚡\n\nWhat do you need help with?\nA) Power outage\nB) New install\nC) Safety inspection\nD) General", delay: 1000 },
        { type: "sent", text: "A", delay: 1500 },
        { type: "recv", text: "A power issue — understood. How urgent?\nA) No power right now\nB) Intermittent issue\nC) Just quoting", delay: 1200 },
        { type: "sent", text: "B", delay: 1300 },
        { type: "recv", text: "Got it — we'll follow up soon.\nSpark Electrical will be in touch to arrange a time.", delay: 1200 },
        { type: "alert", text: "✅ Qualified in 50 seconds", delay: 800 },
      ],
      notif: { title: "⚡ New Lead", body: "James Miller — Power outage\nUrgency: This week · Follow up today" }
    },
    {
      biz: "Fresh Clean Co", avatar: "FC",
      msgs: [
        { type: "recv", text: "Hi Rachel! Thanks for contacting Fresh Clean Co ✨\n\nWhat type of clean do you need?\nA) End of lease\nB) Regular / weekly\nC) Deep clean\nD) Commercial", delay: 1000 },
        { type: "sent", text: "A", delay: 1500 },
        { type: "recv", text: "End of lease — great. When do you need it done?\nA) Within 3 days\nB) Within 2 weeks\nC) Just getting quotes", delay: 1200 },
        { type: "sent", text: "B", delay: 1200 },
        { type: "recv", text: "Perfect, we'll get a quote to you.\nFresh Clean Co will be in touch shortly!", delay: 1200 },
        { type: "alert", text: "✅ Qualified in 42 seconds", delay: 800 },
      ],
      notif: { title: "✨ New Lead", body: "Rachel Kim — End of lease clean\nTimeline: Within 2 weeks · Send quote" }
    }
  ];

  var currentScenario = 0;

  function scrollDown() {
    container.scrollTop = container.scrollHeight;
  }

  function runHeroAnim() {
    var s = scenarios[currentScenario];
    currentScenario = (currentScenario + 1) % scenarios.length;

    // Update phone header
    if (avatarEl) avatarEl.textContent = s.avatar;
    if (bizNameEl) bizNameEl.textContent = s.biz;

    // Update notification content
    if (notifTitle) notifTitle.textContent = s.notif.title;
    if (notifBody) notifBody.innerHTML = s.notif.body.replace(/\n/g, "<br>");

    // Clear previous messages (keep timestamp + typing)
    container.querySelectorAll(".imsg").forEach(function (m) { m.remove(); });
    var ts = container.querySelector(".iphone__time");
    if (!ts) {
      ts = document.createElement("div");
      ts.className = "iphone__time";
      ts.textContent = "Today 9:41 AM";
      container.insertBefore(ts, container.firstChild);
    }
    container.scrollTop = 0;
    if (notifCard) {
      notifCard.style.opacity = "0";
      notifCard.style.transform = "translateY(12px)";
    }
    if (phoneCol) phoneCol.classList.remove("shifted");

    var totalDelay = 400;

    s.msgs.forEach(function (msg) {
      totalDelay += msg.delay;
      var isRecv = msg.type === "recv";

      if (isRecv) {
        setTimeout(function () {
          typing.classList.add("show");
          scrollDown();
        }, totalDelay - 600);
      }

      setTimeout(function () {
        typing.classList.remove("show");
        var el = document.createElement("div");
        el.className = "imsg imsg--" + msg.type;
        el.innerHTML = msg.text.replace(/\n/g, "<br>");
        container.insertBefore(el, typing);
        requestAnimationFrame(function () {
          el.classList.add("show");
          scrollDown();
        });
        if (msg.type === "sent") {
          setTimeout(function () {
            var d = document.createElement("div");
            d.className = "imsg imsg--delivered";
            d.textContent = "Delivered";
            d.style.opacity = "1";
            d.style.transform = "none";
            container.insertBefore(d, typing);
          }, 250);
        }
      }, totalDelay);
    });

    // Show notification card + push phone up
    totalDelay += 1600;
    setTimeout(function () {
      if (phoneCol) phoneCol.classList.add("shifted");
      if (notifCard) {
        notifCard.style.opacity = "1";
        notifCard.style.transform = "translateY(0)";
      }
    }, totalDelay);

    // Fade out and restart with next scenario
    totalDelay += 4000;
    setTimeout(function () {
      container.querySelectorAll(".imsg").forEach(function (m) {
        m.style.transition = "opacity .4s";
        m.style.opacity = "0";
      });
      if (notifCard) {
        notifCard.style.opacity = "0";
        notifCard.style.transform = "translateY(12px)";
      }
      if (phoneCol) phoneCol.classList.remove("shifted");
      setTimeout(runHeroAnim, 800);
    }, totalDelay);
  }

  runHeroAnim();
})();

// ─── Mobile Nav Burger ───
(function () {
  var burger = document.getElementById("nav-burger");
  var links = document.querySelector(".nav__links");
  if (!burger || !links) return;
  burger.addEventListener("click", function () {
    var open = links.style.display === "flex";
    links.style.display = open ? "" : "flex";
    links.style.flexDirection = "column";
    links.style.position = "absolute";
    links.style.top = "68px";
    links.style.left = "0";
    links.style.right = "0";
    links.style.background = "rgba(255,255,255,.97)";
    links.style.padding = "1rem 1.5rem 1.5rem";
    links.style.borderBottom = "1px solid #e2e8f0";
    links.style.zIndex = "99";
    links.style.gap = "1rem";
    if (open) { links.removeAttribute("style"); }
  });
  links.querySelectorAll("a").forEach(function (a) {
    a.addEventListener("click", function () { links.removeAttribute("style"); });
  });
})();

// ─── Scroll Reveal ───
(function () {
  var els = document.querySelectorAll(".reveal, .reveal-left, .reveal-right, .reveal-scale");
  if (!els.length) return;
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) {
        e.target.classList.add("visible");
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
  els.forEach(function (el) { io.observe(el); });
})();

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
      submitBtn.textContent = "Book a call →";
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
