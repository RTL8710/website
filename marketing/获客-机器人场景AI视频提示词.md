# 机器人场景 · AI 视频生成提示词(文生视频)

> 用途:喂给 可灵/即梦/Vidu(中文友好)或 Sora/Veo/Runway(英文),生成户外机器人**氛围/概念镜头**,剪进视频更生动。
> ⚠️ 定性:AI 生成 = 氛围镜头,**不等于产品实拍**,对外勿宣称"我司机器人实拍";真功能证据仍用真机截图/检测录屏。
> UI 元素(REC 红点/检测框/云图标/数据流)AI 生成不稳 → 用已做的 SVG 动画(scene-anims)叠加或后期加。

## 🔑 三段共用:机器人外观(每条都带上,保证是同一台)
> 银白色人形服务机器人,圆润头部,胸前一块发光显示屏,关节流畅,身高约 1.6m,科技感但亲和。
> **一致性技巧**:三段用**同一张参考图/首帧垫图**生成;或把上面这句外观描述原样粘进每条提示词。

---

## ① 户外对话 + 远程对讲
**细节**:户外,机器人与人直接对话,也能远程操作着和人对话。

**中文提示词**
```
黄昏的户外科技园区广场,暖金色逆光。一台银白色人形服务机器人(圆润头部、胸前发光屏)缓步走向坐在长椅上休息的年轻工人,停下、微微点头,胸前屏幕浮现淡青色声波纹,与对方自然交谈,工人微笑回应。镜头平稳轨道缓推,随后平移揭示:远处室内,一名运维人员手持平板,屏幕里是机器人第一视角画面,他对着平板说话,机器人同步转头回应。浅景深,电影质感,真实皮肤与金属反光,4K,稳定运镜。
负面:文字水印、畸形手指、多余肢体、卡通风、低清、闪烁。
```
**English**
```
Golden-hour outdoor tech-park plaza, warm backlight. A sleek white humanoid service robot (rounded head, glowing chest display) walks up to a young worker resting on a bench, stops, nods slightly; soft cyan sound-wave ripples appear on its chest screen as they chat naturally; the worker smiles. Smooth dolly-in, then a pan reveals an operator indoors holding a tablet showing the robot's POV, speaking into it as the robot turns its head in sync. Shallow depth of field, cinematic, photoreal skin and metal reflections, 4K, stable camera.
```
镜头:缓推 + 平移 · 时长 6–8s · 光线:黄金时刻逆光

---

## ② 突发事件 · 自动记录
**细节**:机器人录像,可在突发事件时记录。

**中文提示词**
```
傍晚的户外园区人行道,冷暖交织的天光。一台银白色人形巡检机器人沿道巡逻,镜头跟随。突然前方一位行人脚下打滑、踉跄摔倒——机器人立即停步,头部摄像头快速转向并聚焦摔倒者,机身一侧亮起一颗红色指示灯,姿态警觉。紧张但克制的氛围,真实光线与轻微动态模糊,手持镜头轻微晃动增强临场感,电影质感,4K。
负面:文字水印、畸形、卡通、过曝、慢动作糊。
```
**English**
```
Dusk outdoor campus footpath, mixed cool-warm sky light. A sleek white humanoid patrol robot walks the path, camera tracking. Suddenly a pedestrian ahead slips and stumbles to the ground — the robot instantly halts, its head camera snaps and focuses on the fallen person, a single red indicator light glows on its body, alert posture. Tense but controlled mood, realistic light and subtle motion blur, slight handheld shake for immediacy, cinematic, 4K.
```
镜头:跟拍→急停聚焦 · 时长 5–7s · 后期叠:REC 红点 + 检测框(用 SVG 动画)

---

## ③ 存储坏/丢 · 云端留存
**细节**:机器人存储坏了/丢了,云端还能留存。

**中文提示词**
```
雨后夜晚的户外街角,湿地面有冷青色反光。一台银白色人形机器人侧倒在地、机身受损,一侧电子/存储模块迸出零星火花与轻烟。镜头从机器人缓缓上摇,雨雾中,一束束淡青色"数据光流"从机器人体内升起、向夜空中若隐若现的云朵轮廓汇聚——仿佛录像正被保存上云。冷青色调,潮湿反光,电影感慢镜,希望与科技感并存,4K,稳定上摇。
负面:文字水印、畸形、卡通、火焰过大、血腥。
```
**English**
```
Rainy night outdoor street corner, wet ground with cool cyan reflections. A sleek white humanoid robot lies toppled and damaged, faint sparks and wisps of smoke from an electronics/storage module. Camera slowly tilts up from the robot; in the mist, soft cyan "data-light" streams rise from its body toward a faint cloud silhouette in the night sky — as if the footage is being saved to the cloud. Cool cyan palette, wet reflections, cinematic slow motion, hopeful yet techy, 4K, stable tilt-up.
```
镜头:缓慢上摇 · 时长 6–8s · 后期叠:精确云图标 + 数据流(用 anim-cloud 的 SVG 更可控)

---

## 通用建议
- **时长**:每段先生成 5–8s,多生成几条挑最稳的(AI 视频废片率高)。
- **一致性**:三段务必同一台机器人——用同一参考图/首帧垫图,或外观描述逐字复用。
- **工具**:中文优先 可灵(Kling)/即梦/Vidu;英文 Sora/Veo3/Runway。
- **拼接**:AI 氛围镜头 + 我做的 SVG 动画(对讲音波/REC框/云图标)叠加 = 既生动又准确。
- **诚实边界**:AI 镜头当氛围,产品真功能靠真机截图/检测录屏背书,二者分工别混。

---
*微信 13826173658 · 深圳*
