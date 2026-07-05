// 更新页脚年份
document.getElementById("year").textContent = new Date().getFullYear();

// 简单的点击计数器
let count = 0;
const counterBtn = document.getElementById("counter");
counterBtn.addEventListener("click", () => {
  count += 1;
  counterBtn.textContent = `点击次数：${count}`;
});
