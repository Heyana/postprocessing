---
layout: single
collection: sections
title: Sharpen
draft: false
menu:
  demos:
    parent: utility
    weight: 30
script: sharpen
---

# Sharpen Effect

锐化效果可以增强图像的细节和边缘，在应用了可能导致模糊的效果（如泛光、景深）后特别有用。此演示展示了两种锐化效果：

1. **基本锐化(SharpenEffect)** - 使用拉普拉斯算子进行简单锐化
2. **自适应锐化(AdaptiveSharpenEffect)** - 根据局部对比度自动调整锐化强度

## 操作指南

- 使用控制面板可以切换不同类型的锐化效果
- 调整锐化强度和核大小以观察不同参数的效果
- 启用/禁用模糊效果以对比锐化前后的差异 