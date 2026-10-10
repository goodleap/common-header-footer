import '../src/common-header-footer.js';

const shell = document.querySelector('#shell');
const app = document.querySelector('#app');
const headerToggle = document.querySelector('#header-toggle');
const footerToggle = document.querySelector('#footer-toggle');
const immersionButton = document.querySelector('#immerse');
const fullscreenButton = document.querySelector('#fullscreen');
const message = document.querySelector('#message');
const project = new URLSearchParams(location.search).get('project');
shell.setAttribute('current', ['map', 'studio'].includes(project) ? project : 'overview');

// The business owns these preferences, immersion controls and Fullscreen API calls.
headerToggle.addEventListener('change', () => shell.setVisibility({ header: headerToggle.checked }));
footerToggle.addEventListener('change', () => shell.setVisibility({ footer: footerToggle.checked }));
shell.addEventListener('visibility-change', ({ detail }) => {
  document.querySelector('#visibility-status').textContent = `页头${detail.header ? '显示' : '隐藏'} · 页尾${detail.footer ? '显示' : '隐藏'}`;
});
shell.addEventListener('content-resize', ({ detail }) => {
  document.querySelector('#content-size').textContent = `内容区域 ${Math.round(detail.width)} × ${Math.round(detail.height)} px`;
});
shell.addEventListener('config-error', ({ detail }) => {
  message.textContent = `导航配置读取失败：${detail.error.message}`;
});

let releaseImmersion;
immersionButton.addEventListener('click', () => {
  if (releaseImmersion) {
    releaseImmersion();
    releaseImmersion = undefined;
  } else releaseImmersion = shell.suspend();
  immersionButton.setAttribute('aria-pressed', String(Boolean(releaseImmersion)));
  immersionButton.textContent = releaseImmersion ? '退出沉浸' : '进入沉浸';
  message.textContent = releaseImmersion ? '沉浸中：显示选择会保留，可继续调整。' : '已恢复当前显示选择。';
});

let releaseFullscreen;
if (!document.fullscreenEnabled || !app.requestFullscreen) {
  fullscreenButton.disabled = true;
  message.textContent = '此浏览器不支持全屏，可使用沉浸模式。';
}
fullscreenButton.addEventListener('click', async () => {
  fullscreenButton.disabled = true;
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else {
      releaseFullscreen = shell.suspend();
      await app.requestFullscreen();
    }
  } catch (error) {
    if (!document.fullscreenElement) {
      releaseFullscreen?.();
      releaseFullscreen = undefined;
    }
    message.textContent = `全屏未完成，显示状态已保留：${error.message}`;
  } finally {
    fullscreenButton.disabled = false;
  }
});
document.addEventListener('fullscreenchange', () => {
  const active = document.fullscreenElement === app;
  fullscreenButton.textContent = active ? '退出全屏 ↙' : '进入全屏 ↗';
  if (!active) {
    releaseFullscreen?.();
    releaseFullscreen = undefined;
  }
});

const wrapToggle = document.querySelector('#wrap-toggle');
wrapToggle.disabled = true;
// Optional demo controls can wait for shared config; business rendering does not.
void shell.ready.then(() => {
  wrapToggle.disabled = false;
  const baseConfig = shell.config;
  wrapToggle.addEventListener('click', () => {
    const expanded = wrapToggle.getAttribute('aria-pressed') !== 'true';
    wrapToggle.setAttribute('aria-pressed', String(expanded));
    wrapToggle.textContent = expanded ? '还原导航' : '加长导航';
    shell.config = {
      ...baseConfig,
      navigation: baseConfig.navigation.map((item, index) => ({ ...item, label: expanded ? `${item.label} · 独立站点与公共导航示例 ${index + 1}` : item.label })),
    };
  });
});

const stage = document.querySelector('#canvas-stage');
const canvas = document.querySelector('#canvas');
const context = canvas.getContext('2d');
function draw() {
  const { width, height } = stage.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.fillStyle = '#e9efe4';
  context.fillRect(0, 0, width, height);
  context.strokeStyle = '#d7e2d0';
  context.lineWidth = 1;
  for (let x = 0; x < width; x += 44) {
    context.beginPath(); context.moveTo(x, 0); context.lineTo(x, height); context.stroke();
  }
  for (let y = 0; y < height; y += 44) {
    context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke();
  }
  // Static vector paths make the resize behavior visible without a map service.
  for (let i = 0; i < 10; i++) {
    context.beginPath();
    context.moveTo(width * .5 + i * 30, -30);
    context.bezierCurveTo(width * .15 + i * 37, height * .6, width * .85 + i * 35, height * .15, width * .62 + i * 35, height + 30);
    context.strokeStyle = i === 4 ? '#8ea98a' : '#c2d3b9';
    context.lineWidth = i === 4 ? 2 : 1;
    context.stroke();
  }
  const x = width * .72, y = height * .56;
  context.beginPath(); context.arc(x, y, 15, 0, Math.PI * 2); context.fillStyle = '#ffffffb0'; context.fill();
  context.beginPath(); context.arc(x, y, 5, 0, Math.PI * 2); context.fillStyle = '#48754e'; context.fill();
  document.querySelector('#canvas-size').textContent = `${Math.round(width)} × ${Math.round(height)}`;
}
new ResizeObserver(draw).observe(stage);
window.addEventListener('resize', draw);
