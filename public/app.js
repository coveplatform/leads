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
        { type: "recv", text: "Hi Sam, this is Bay Plumbing. We missed your call — what can we help with?", delay: 1000 },
        { type: "sent", text: "Burst pipe under the sink, water everywhere", delay: 1800 },
        { type: "recv", text: "Understood. Is the water still running or have you been able to shut it off?", delay: 1400 },
        { type: "sent", text: "Still running, I can't find the valve", delay: 1600 },
        { type: "recv", text: "Noted. A plumber will call you within the next 5 minutes.", delay: 1300 },
        { type: "alert", text: "✅ Qualified in 38 seconds", delay: 900 },
      ],
      notif: { title: "New urgent lead", body: "Sam Thompson\nBurst pipe · Water running · Can't find valve\nCall back now" }
    },
    {
      biz: "Smile Dental", avatar: "SD",
      msgs: [
        { type: "recv", text: "Hi Lisa, this is Smile Dental. We missed your call — how can we help?", delay: 1000 },
        { type: "sent", text: "I have a bad toothache, been hurting since last night", delay: 1700 },
        { type: "recv", text: "Thank you for letting us know. Is the pain constant or does it come and go?", delay: 1300 },
        { type: "sent", text: "Constant. Kept me up all night", delay: 1400 },
        { type: "recv", text: "We'll arrange to see you today. Someone will call you shortly to confirm a time.", delay: 1200 },
        { type: "alert", text: "✅ Qualified in 42 seconds", delay: 900 },
      ],
      notif: { title: "New urgent lead", body: "Lisa Chen\nToothache · Constant pain since last night\nBook in today" }
    },
    {
      biz: "Spark Electrical", avatar: "SE",
      msgs: [
        { type: "recv", text: "Hi James, this is Spark Electrical. We missed your call — what's the issue?", delay: 1000 },
        { type: "sent", text: "Half the house has no power", delay: 1600 },
        { type: "recv", text: "Have you checked the switchboard for any tripped circuits?", delay: 1300 },
        { type: "sent", text: "Yes, nothing has tripped — it's just dead", delay: 1500 },
        { type: "recv", text: "Understood. An electrician will call you within 10 minutes.", delay: 1200 },
        { type: "alert", text: "✅ Qualified in 44 seconds", delay: 900 },
      ],
      notif: { title: "New urgent lead", body: "James Miller\nPower outage · No trips · Half house affected\nPriority call back" }
    },
    {
      biz: "Fresh Clean Co", avatar: "FC",
      msgs: [
        { type: "recv", text: "Hi Rachel, this is Fresh Clean Co. We missed your call — what do you need?", delay: 1000 },
        { type: "sent", text: "End of lease clean, needs to be done by Friday", delay: 1700 },
        { type: "recv", text: "We can accommodate that. How many bedrooms and bathrooms does the property have?", delay: 1300 },
        { type: "sent", text: "3 bedrooms, 2 bathrooms, and a garage", delay: 1400 },
        { type: "recv", text: "Thank you. We'll have a quote with you within the hour.", delay: 1200 },
        { type: "alert", text: "✅ Qualified in 35 seconds", delay: 900 },
      ],
      notif: { title: "New lead", body: "Rachel Kim\n3 bed · 2 bath · Garage · By Friday\nSend quote today" }
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
    var open = links.classList.contains("nav--open");
    links.classList.toggle("nav--open", !open);
    burger.setAttribute("aria-expanded", String(!open));
  });
  links.querySelectorAll("a").forEach(function (a) {
    a.addEventListener("click", function () {
      links.classList.remove("nav--open");
      burger.setAttribute("aria-expanded", "false");
    });
  });
  // Close on outside click
  document.addEventListener("click", function (e) {
    if (!burger.contains(e.target) && !links.contains(e.target)) {
      links.classList.remove("nav--open");
      burger.setAttribute("aria-expanded", "false");
    }
  });
})();

// ─── Sticky CTA — show only after hero button scrolls out of view ───
(function () {
  var stickyCta = document.querySelector(".sticky-cta");
  var heroCta = document.querySelector(".hero__cta-main");
  if (!stickyCta || !heroCta) return;
  var io = new IntersectionObserver(function (entries) {
    stickyCta.classList.toggle("show", !entries[0].isIntersecting);
  });
  io.observe(heroCta);
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
