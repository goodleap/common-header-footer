# common-header-footer

供独立网站复用的公共页头和页尾。原生 Web Components + Shadow DOM，零运行时依赖；一个可直接部署的 ES module，无需构建。各业务保留独立仓库与发布节奏。

## 运行与验证

需要 Node.js 20+、Python 3 和现代浏览器。

```sh
npm ci
npm run dev     # 端口 4173，演示路径 /demo/
npm run check
npm test
```

演示包含独立开关、导航换行、实时尺寸、Canvas、沉浸和真实全屏。测试使用 Playwright，优先使用 `CHROMIUM_PATH` 或 `/usr/bin/chromium`；没有本地 Chromium 时运行 `npx playwright install --with-deps chromium`。

## 静态网站发布

聊天中的 HTML 文件链接只是文件查看入口，不能保证加载旁边的 CSS、ES module 和 JSON。请通过 HTTP(S) 访问完整站点。

```sh
npm run build:demo
```

生成 `dist/` 和 `dist/common-header-footer-demo.zip`。发布目录的 `index.html` 直接展示完整演示；发布时保留包内目录结构，无需服务端应用。包内仅包含演示所需的静态文件和接入说明，不包含依赖目录或 Git 元数据。源码中的根 `index.html` 只是入口链接，实际开发演示在 `/demo/`。

如果托管平台用 iframe 展示，需要允许 Fullscreen API 才能进入浏览器全屏；沉浸开关仍可独立使用。

## 最小接入

把 `src/common-header-footer.js` 和中央配置部署到你控制的静态资源服务。以下 `/shared/` 是**部署约定**，需由服务器实际提供，可使用静态托管或反向代理。

```html
<script type="module" src="/shared/common-header-footer.js"></script>
<common-shell config-src="/shared/site.json" current="map">
  <main id="app"><!-- 业务原有内容或框架挂载节点 --></main>
</common-shell>
<style>
  /* 业务主动选择这些布局；公共组件不会修改 html/body。 */
  html, body { margin: 0; height: 100%; }
  common-shell { height: 100vh; height: 100dvh; }
  #app { height: 100%; min-height: 0; min-width: 0; overflow: auto; }
</style>
```

元素在模块加载后默认显示，无需开启或初始化函数。**仅加载模块只会注册元素，不会向页面插入头尾**；不引入元素的业务不受影响。重复模块加载、配置赋值或重新连接不会重复创建头尾；主动放置两个元素则代表两个独立实例。

头尾也能分别使用，按普通文档流布局，删除任意一侧即可：

```html
<common-header config-src="/shared/site.json"></common-header>
<main><!-- 业务内容 --></main>
<common-footer config-src="/shared/site.json"></common-footer>
```

需要计算中间剩余高度时使用 `common-shell`，或由业务自己的 Grid/Flex 布局分配。框架应用可将 shell 放在原有挂载节点外，必要时按框架配置自定义元素支持；不要让框架和接入脚本重复创建实例。

## 集中配置导航

参考 [config/site.json](config/site.json)。`example.org` 仅是占位域名，应换成部署配置：

```json
{
  "brand": { "label": "品牌名称", "href": "/" },
  "navigation": [
    { "id": "home", "label": "首页", "href": "/" },
    { "id": "map", "label": "地图", "href": "/maps/" },
    { "id": "studio", "label": "工作室", "href": "https://studio.example.org/", "newTab": true }
  ],
  "footer": {
    "text": "简短页尾文字",
    "links": [{ "label": "关于", "href": "/about/" }]
  },
  "theme": { "accent": "#176b55" }
}
```

- 集中托管一份 JSON，各站点读取它。推荐各站点固定的 `/shared/site.json` 代理到中央文件，导航更新不需要业务重新发布。
- JSON 相对 URL 按**配置响应的最终 URL**解析，包括重定向。`/maps/` 属于配置所在源；经同源代理提供时属于当前业务源。跨子域跳转在中央 JSON 使用完整 URL。
- 跨源加载 JSON 或模块需服务器正确配置 CORS。配置建议公开、无凭据；组件没有统计追踪、个人域名或用户名。
- 更换域名主要修改中央 JSON；配置与模块的入口仍需部署配置管理。稳定的同源 `/shared/` 代理路径可避免逐个修改业务源码。
- 同一页面的同 URL 请求合并、缓存。新页面会向服务器重新验证；已打开页面可调用 `reloadConfig()`，没有自动轮询。服务器/CDN 应为 JSON 配置合理的缓存再验证策略。
- 组件可按版本部署，如 `/shared/v1/common-header-footer.js`；业务独立升级，导航 JSON 保持稳定入口。演示用不同 URL 模拟项目，不会部署其他业务。

`current="map"` 按导航项 `id` 标记当前项目；未设置时按当前 URL 的 origin、pathname、search 匹配。组件使用原生链接，不接管路由；SPA 路由变化时由业务更新 `current`。

对象配置也可使用，相对链接以业务页面的 `document.baseURI` 为基准：

```js
await customElements.whenDefined('common-shell');
const shell = document.querySelector('common-shell');
shell.config = { brand: { label: '品牌名称', href: '/' }, navigation: [] };
```

赋值替换完整配置，省略项使用默认值；覆盖当前 `config-src`，直到修改来源或调用 `reloadConfig()`，重新插入 DOM 仍保留对象配置。模块升级前赋值也会保留。非法对象同步抛出 `TypeError`；文本按纯文本渲染，导航只允许 HTTP(S)，页尾还支持 `mailto:`、`tel:`。

远端错误、非法 JSON 或 10 秒超时保留上次可用配置（首次保留默认头尾），派发 `config-error`，不阻塞业务。`ready` 和 `reloadConfig()` 返回 Promise：成功为 `true`，失败或被新配置替代为 `false`。可通过事件的 `detail.error` 处理错误；成功加载派发 `config-load`。

## 显示与全屏

初始关闭：shell 使用 `hide-header` / `hide-footer` 属性；独立头尾使用 `hidden`。

```js
shell.hide('header');
shell.show('header');
shell.hide('footer');
shell.show();                         // 两侧显示，hide() 则两侧隐藏
shell.setVisibility({ footer: false }); // 另一侧保持原选择
shell.getVisibility();                // 当前有效状态 { header, footer }

const restore = shell.suspend();      // 暂时隐藏两侧，保留原选择
restore();                            // 恢复，可安全重复调用
```

`visibility-change` 事件的 `detail` 为当前有效状态。暂停支持嵌套，全部释放后才恢复；暂停期间调整的显示偏好也会保留。独立头尾同样支持 `show()`、`hide()`、`suspend()` 和标准 `hidden`。隐藏后不留占位。不要用 `shell.hidden` 只隐藏头尾，它会连业务一起隐藏。

**全屏由业务控制**：在用户点击时调用 `shell.suspend()`，由业务执行 `app.requestFullscreen()`；进入失败和 `fullscreenchange` 退出时调用恢复函数。业务需防止重复进入请求、检测 API 支持，并将退出按钮放在全屏元素内。真实示例见 [demo/demo.js](demo/demo.js)，含失败恢复、Esc/外部退出和沉浸嵌套。不支持全屏的浏览器仍可使用沉浸模式。

## 业务区域适配

shell 内部三行 Grid 分配自然高度的头、剩余内容区域、自然高度的尾。没有固定定位、覆盖层或全局 CSS，不修改业务 DOM 层级、滚动状态或路由；业务节点保留在默认 slot 中。

**已有项目不保证零修改接入：**

- 填满屏幕时给 shell 明确高度，如 `100dvh` 或父容器的剩余高度；业务根节点使用 `height: 100%`、`min-height: 0`。原有 `100vh` 不会自动扣除头尾。
- 业务自行决定滚动：文档内容通常在根节点用 `overflow: auto`，地图/游戏通常在自身视口用 `overflow: hidden`。未适配的溢出内容可能延伸到页尾区域。
- `position: fixed` 仍以浏览器视口为参照；已有固定工具栏、弹层和游戏视口需要自行调整定位参照及全屏挂载点。
- 隐藏、换行、字体和窗口变化会自动重新分配空间。`shell.getContentRect()` 返回内容区域 CSS 尺寸；`content-resize` 在布局更新后异步派发，`detail` 为 `{ width, height }`。
- Canvas/WebGL 要同步绘图缓冲尺寸；地图引擎通常还需 `resize()` / `invalidateSize()`。监听**实际业务容器**，不要只监听 `window.resize`。

```js
const observer = new ResizeObserver(([entry]) => {
  const { width, height } = entry.contentRect;
  const dpr = devicePixelRatio || 1;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  // 在此重设绘图变换并重绘，或调用业务引擎的 resize。
});
observer.observe(viewport);
// 业务卸载时 observer.disconnect();
```

## 少量外观配置

中央 JSON 的 `theme` 支持 `accent`、`background`、`foreground`、`muted`、`border` 五种颜色。也支持以下 CSS 变量，JSON 显式设置的颜色优先：

```css
common-shell, common-header, common-footer {
  --chf-accent: #176b55;
  --chf-background: #fff;
  --chf-foreground: #172c28;
  --chf-muted: #52645f;
  --chf-border: #dce6e0;
  --chf-font-family: system-ui, sans-serif;
  --chf-max-width: 1200px;
}
```

导航提供原生键盘操作、可见焦点和当前页标记，窄屏自然换行。面向支持 Custom Elements、Shadow DOM、ResizeObserver、ES module 的现代 Chromium、Firefox、Safari；自动化验证覆盖 Chromium。
