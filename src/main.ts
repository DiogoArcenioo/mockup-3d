import '@fontsource-variable/dm-sans';
if (window.parent !== window) document.documentElement.classList.add('system-embedded');

if (new URLSearchParams(location.search).get('module') === 'mockup') {
  void import('./studio').then(() => import('./system-bridge.css'));
} else {
  void import('./finance').then(() => import('./system-bridge.css'));
}
