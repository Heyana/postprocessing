---
layout: single
collection: sections
title: MRT Rendering
draft: false
menu:
  demos:
    parent: utility
    weight: 40
script: mrtrender
---

# 多渲染目标(MRT)效果

多渲染目标(Multiple Render Targets, MRT)技术允许在单次渲染中同时输出多种不同的信息，如颜色、法线、深度等。这是现代渲染管线中关键的优化技术，被广泛应用于延迟渲染、屏幕空间特效和后期处理中。

## 自定义通道支持

本演示展示了增强版的`MRTRenderPass`，支持以下类型的通道：

1. **颜色通道** (CHANNEL_COLOR) - 场景的基本颜色信息
2. **法线通道** (CHANNEL_NORMAL) - 物体表面的法线向量
3. **深度通道** (CHANNEL_DEPTH) - 场景的深度信息
4. **世界位置通道** (CHANNEL_POSITION) - 存储片元在世界空间中的位置
5. **PBR属性通道** (CHANNEL_PBR) - 粗糙度、金属度和环境光遮蔽
6. **单独的材质属性通道**:
   - **粗糙度** (CHANNEL_ROUGHNESS)
   - **金属度** (CHANNEL_METALNESS)
   - **环境光遮蔽** (CHANNEL_AO)
7. **运动向量通道** (CHANNEL_MOTION) - 用于运动模糊效果
8. **自发光通道** (CHANNEL_EMISSION) - 捕捉自发光材质信息
9. **对象ID通道** (CHANNEL_ID) - 用于选择和标识对象
10. **遮罩通道** (CHANNEL_MASK) - 各种自定义遮罩
11. **阴影通道** (CHANNEL_SHADOW) - 阴影信息
12. **速度通道** (CHANNEL_VELOCITY) - 用于流体和粒子效果
13. **自定义通道** (CHANNEL_CUSTOM) - 用户自定义通道

您可以根据需要选择使用这些通道的任意组合，而不必全部渲染。例如，创建一个只有颜色、法线和粗糙度的配置：

```javascript
new MRTRenderPass(scene, camera, {
    channels: [
        MRTRenderPass.CHANNEL_COLOR,
        MRTRenderPass.CHANNEL_NORMAL,
        MRTRenderPass.CHANNEL_ROUGHNESS
    ]
});
```

## 实用功能

- `getChannelTexture(channelType)` - 根据通道类型获取对应纹理
- `hasChannel(channelType)` - 检查是否存在特定通道
- `getAvailableChannels()` - 获取所有可用通道类型
- `getChannelIndex(channelType)` - 获取特定通道的索引

## 功能特点

- 单一渲染通道同时输出多种通道信息
- 支持自定义输出格式和数量
- 与标准RenderPass保持兼容的API
- 可以同时渲染任意数量的输出通道（取决于硬件限制）

## 操作指南

- 使用控制面板在不同的渲染通道之间切换
- 使用数字键1-9快速切换不同通道（9显示全部通道网格视图）
- 观察不同材质的物体在各个通道中的表现
- 尝试修改源代码选择不同的通道组合

## 兼容性注意事项

- WebGL2规范限制最多支持8个同时渲染目标
- 某些设备可能支持更少的渲染目标，代码会自动检测并调整
- 所有渲染目标必须使用相同的大小和相似的格式
- 推荐使用RGBA格式以提高兼容性
- 如果出现`GL_INVALID_FRAMEBUFFER_OPERATION`错误，通常是由于格式不兼容或者尺寸问题
- **避免同时使用PBR通道和单独的材质属性通道（roughness/metalness/ao）**，因为它们计算类似的值
- 如果需要粗糙度和金属度，可以选择：
  - 使用`CHANNEL_PBR`通道获取完整的PBR属性（R=粗糙度，G=金属度，B=AO）
  - 或者仅使用单独的属性通道（`CHANNEL_ROUGHNESS`、`CHANNEL_METALNESS`等）

## 智能显示适配

MRTRenderPass现在提供了智能通道显示适配功能，会根据您的通道配置自动调整显示逻辑：

1. **自动通道检测** - 显示器会自动检测当前可用的渲染通道
2. **动态UI适配** - 控制面板会根据可用通道动态更新选项
3. **灵活键盘快捷键** - 数字键1-9会根据当前加载的通道自动映射
4. **通道切换不重启** - 可以在运行时切换不同的通道组合而无需重启应用

### 使用自定义通道

控制面板中的"使用自定义通道"开关允许您在两种预设通道配置之间切换：

- **标准配置**：颜色、法线、深度、位置、PBR属性(合并)、运动、自发光、ID
- **自定义配置**：颜色、法线、深度、位置、粗糙度、金属度、环境光遮蔽、运动

这展示了如何在不同的通道组合之间切换，您可以根据需要修改代码以支持任意通道组合。

### 键盘快捷键
  
以下是用于切换不同渲染通道的快捷键：
  
- `1` - 颜色通道
- `2` - 法线通道
- `3` - 深度通道
- `4` - 世界位置通道
- `5` - PBR属性通道
- `6` - 粗糙度通道（在自定义通道模式下）
- `7` - 金属度通道（在自定义通道模式下）
- `8` - 对象ID通道
- `9` - 显示所有通道（网格布局） 