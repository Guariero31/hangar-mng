// Aplica o tema salvo antes de a página aparecer (evita o "piscar"). Padrão: escuro.
(function () {
  try {
    var t = localStorage.getItem('theme');
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.setAttribute('data-theme', 'dark');
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', t === 'light' ? '#f4f1e8' : '#0a0a08');
  } catch (e) { document.documentElement.setAttribute('data-theme', 'dark'); }
})();
