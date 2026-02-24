/**
 * Cove embed script — cove.js
 * Include on your website to connect your contact form to Cove.
 * Usage: <script src="https://leads-rho-six.vercel.app/cove.js" data-business="YOUR_BIZ_ID"></script>
 */
(function () {
  const script = document.currentScript || (function () {
    const scripts = document.getElementsByTagName('script');
    return scripts[scripts.length - 1];
  })();

  const businessId = script.getAttribute('data-business');
  const base = script.src.replace('/cove.js', '');

  window.Cove = {
    send: function (params) {
      if (!businessId) { console.warn('[Cove] No data-business ID set on the script tag.'); return; }
      if (!params || !params.phone) { console.warn('[Cove] phone is required.'); return; }

      return fetch(base + '/api/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId: businessId,
          phone:  params.phone  || null,
          name:   params.name   || null,
          email:  params.email  || null,
          message: params.message || null,
        }),
      })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (!data.ok) console.warn('[Cove] Error:', data.error);
          return data;
        })
        .catch(function (err) { console.warn('[Cove] Network error:', err); });
    },
  };
})();
