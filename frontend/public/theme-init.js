// Mirrors currentTheme() in src/theme.ts: an explicit choice wins, else match the device.
try {
  var p = localStorage.getItem('fq-appearance');
  if (p !== 'light' && p !== 'dark') p = localStorage.getItem('fq-theme') === 'dark' ? 'dark' : null;
  if (p === 'dark' || (!p && matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark');
  }
} catch (e) {}
