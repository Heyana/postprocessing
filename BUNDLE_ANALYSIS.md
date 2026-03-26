# 打包体积分析报告

## 总体情况

- **总打包大小**: 2.05 MB (未压缩)
- **压缩后大小**: 1.22 MB (见 postprocessing-fork.min.js)
- **压缩率**: 约 40%

## 主要体积来源

### 🔴 最大的文件 (前 5)

1. **src/libs/realism-new/index.js** - 251 KB (12.2%)

   - 这是最大的单个文件，包含 realism 效果库
   - 建议：考虑拆分为多个模块，按需加载

2. **src/libs/realism-effects/src/utils/TextureAssets.js** - 85 KB (4.1%)

   - 纹理资源文件
   - 建议：检查是否有 base64 编码的纹理可以外部化

3. **src/textures/smaa/areaImageDataURL.js** - 65 KB (3.2%)

   - SMAA 抗锯齿的查找表数据
   - 这是必需的，但可以考虑懒加载

4. **src/libs/three/pass/SelectiveSSRPass.js** - 46 KB (2.2%)

   - 选择性屏幕空间反射通道

5. **src/passes/MRTRenderPass.js** - 41 KB (2.0%)
   - 多渲染目标通道

### 📊 文件类型分布

- **JavaScript**: 1762 KB (80.6%)
- **GLSL 着色器**: 425 KB (19.4%)

## 优化建议

### 1. 代码分割 (Code Splitting)

```javascript
// 将大型效果库改为动态导入
export async function loadRealismEffects() {
  return await import("./libs/realism-new/index.js");
}
```

### 2. Tree Shaking 优化

确保所有导出都是具名导出，避免 `export default`：

```javascript
// ✅ 好
export { BloomEffect, SSAOEffect };

// ❌ 避免
export default { BloomEffect, SSAOEffect };
```

### 3. 纹理资源外部化

将 base64 编码的纹理改为外部文件：

```javascript
// 当前：内联 base64 (65KB)
const areaImageData = "data:image/png;base64,iVBORw0KG...";

// 优化：外部加载
const areaImageData = await fetch("/textures/smaa-area.png");
```

### 4. 按需加载效果

创建轻量级入口点：

```javascript
// index.lite.js - 只包含核心功能
export { EffectComposer, RenderPass, EffectPass };

// index.full.js - 包含所有效果
export * from "./index.lite.js";
export * from "./effects/index.js";
```

### 5. 移除重复代码

分析中发现的警告：

- ⚠️ 重复的 case 语句 (SSGIEffect.js)
- ⚠️ 重复的对象键 (RenderPass.js, SSGIOptions.js)
- ⚠️ 不可能的 typeof 检查

## 详细分析

### 查看交互式分析

1. 打开 https://esbuild.github.io/analyze/
2. 上传 `build/meta.json` 文件
3. 可视化查看每个模块的大小和依赖关系

### 按效果类型统计

**大型效果 (>20KB)**:

- UnrealBloomEffect: 29 KB
- SelectiveAOEffect: 29 KB
- SkyAtmosphereEffect: 27 KB + 27 KB shader
- OutlineMultiEffect: 22 KB
- SelectiveSSRPass: 46 KB
- SSRPass: 21 KB

**核心系统**:

- EffectComposer: 19 KB
- EffectPass: 17 KB
- MRTRenderPass: 41 KB

## 下一步行动

1. ✅ 已生成详细分析文件 `build/meta.json`
2. 🔍 审查 realism-new/index.js (251KB) 是否可以拆分
3. 🔍 检查 TextureAssets.js 中的纹理是否可以外部化
4. 🐛 修复代码中的重复和警告
5. 📦 考虑提供多个构建版本：
   - `postprocessing.core.js` - 核心功能 (~500KB)
   - `postprocessing.full.js` - 完整版本 (~2MB)
   - `postprocessing.lite.js` - 精简版 (~300KB)
