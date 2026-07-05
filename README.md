# website

一个简单的静态网站，通过 **GitHub Actions** 自动部署到 **GitHub Pages**。

## 🌐 在线访问

部署成功后，访问地址为：

**https://rtl8710.github.io/website/**

## 📁 项目结构

```
.
├── index.html                 # 页面结构
├── style.css                  # 样式
├── script.js                  # 交互脚本
├── .nojekyll                  # 告诉 Pages 不要用 Jekyll 处理
└── .github/workflows/deploy.yml   # 自动部署工作流
```

## 🚀 如何工作

每当有代码推送到 `main` 分支，`.github/workflows/deploy.yml` 会自动运行：

1. 检出仓库代码
2. 启用并配置 GitHub Pages（source 设为 GitHub Actions）
3. 将整个站点打包上传
4. 部署到 GitHub Pages

无需任何手动操作，几分钟后网站即更新上线。

## ✏️ 如何修改内容

直接编辑 `index.html` / `style.css` / `script.js`，提交并推送即可。
GitHub Actions 会自动重新部署。
