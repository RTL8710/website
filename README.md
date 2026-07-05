# 云边端 AI 视觉 · 解决方案网站

一个「设备端 AI 视觉解决方案」的展示网站，通过 **GitHub Actions** 自动部署到 **GitHub Pages**。

## 🌐 在线访问

**https://rtl8710.github.io/website/**

## 📄 页面结构

| 页面 | 说明 |
|------|------|
| `index.html` | 门户首页：品牌总览 + 四份资料导航 + 场景视频 + 联系方式 |
| `solution-overview.html` | 解决方案总览（统领页：架构 / 差异化 / 证据 / 白标 / 合作）|
| `cases.html` | 实战案例（记录仪 / 机器人 / 摄像头 / 眼镜 四个真实客户）|
| `product-manual.html` | 产品操作说明书（Web 控制台 22 页逐页讲解）|
| `cooperation-invite.html` | 合作邀约（面向品牌商 / 工厂）|
| `app-manual.html` / `product-onepager.html` | 占位页（原始素材待补齐）|
| `scenario-stories.mp4` | 场景演示视频 |
| `fallback.js` | 图片兜底脚本（截图素材缺失时显示同色系占位图）|

## 🖼️ 关于图片素材

首页与占位页不依赖任何外部图片，可独立显示。
`solution-overview.html` / `product-manual.html` 等页面引用了真机截图，目录为：

```
app-shots/     # App 截图
manual-shots/  # Web 控制台逐页截图
footage/       # VLM 对话等画面
wechat-qr.jpeg # 微信二维码
```

这些素材文件**尚未上传**，页面会自动显示同色系占位图（见 `fallback.js`）。
把真实图片按上述目录放进仓库并推送，即可自动替换为真图，无需改动页面。

## 🚀 自动部署

推送到 `main` 分支后，`.github/workflows/deploy.yml` 会自动构建并部署到 GitHub Pages。

> ⚠️ **首次需手动开启一次 Pages**：仓库 Settings → Pages → Source 选择 **GitHub Actions**，之后全自动。
