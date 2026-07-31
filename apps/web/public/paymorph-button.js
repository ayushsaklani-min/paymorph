(function () {
  function mount(node) {
    var url = node.getAttribute('data-checkout-url');
    if (!url) return;
    var label = node.getAttribute('data-label') || 'Pay with PayMorph';
    var link = document.createElement('a');
    link.href = url;
    link.textContent = label;
    link.style.cssText =
      'display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 20px;border-radius:999px;background:#8af0c7;color:#082018;font:600 14px system-ui,sans-serif;text-decoration:none';
    link.addEventListener('click', function (event) {
      if (node.getAttribute('data-mode') !== 'modal') return;
      event.preventDefault();
      var frame = document.createElement('iframe');
      frame.src = url;
      frame.title = 'PayMorph checkout';
      frame.style.cssText =
        'width:min(540px,100%);height:min(760px,90vh);border:0;border-radius:20px;background:#081018';
      var overlay = document.createElement('div');
      overlay.style.cssText =
        'position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;padding:20px;background:rgba(0,0,0,.7)';
      overlay.appendChild(frame);
      overlay.addEventListener('click', function (close) {
        if (close.target === overlay) overlay.remove();
      });
      document.body.appendChild(overlay);
    });
    node.replaceChildren(link);
  }
  document.querySelectorAll('[data-paymorph-button]').forEach(mount);
})();
