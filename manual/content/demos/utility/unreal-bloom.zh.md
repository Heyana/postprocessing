---
layout: single
collection: sections
title: Unreal Bloom（虚幻泛光）
draft: false
menu:
  demos:
    parent: utility
    weight: 38
script: unreal-bloom
---

# Unreal Bloom（虚幻泛光）

该示例展示与 three.js UnrealBloomPass 等价的泛光效果，实现了高通滤波、可分离高斯模糊的多级 MIP 合成，并通过 Additive 混合叠加到最终画面。

## 可调参数

- strength：泛光强度（合成时应用）
- radius：半径/权重插值
- threshold：亮度阈值
- smoothWidth：阈值平滑宽度
- intensity：额外强度细调
- bloomColor：泛光颜色

使用右上角面板实时调整参数，观察不同发光物体与背景下的表现。


