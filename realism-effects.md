# Realism Effects 后处理效果库

这个库提供了多种用于提升3D渲染真实感的后处理效果，基于Three.js和postprocessing库实现。

## 主要效果

### SSGI (屏幕空间全局光照)
- **文件**: `src/libs/realism-effects/src/ssgi/SSGIEffect.js`
- **描述**: 屏幕空间全局光照是一种模拟光线在场景中多次反弹的技术，可以显著提高渲染的真实感。
- **特点**:
  - 支持屏幕空间反射和间接光照
  - 集成降噪系统处理渲染噪点
  - 可调整的质量和性能参数
  - 支持基于层的选择性渲染

### SSR (屏幕空间反射)
- **文件**: `src/libs/realism-effects/src/ssgi/SSREffect.js`
- **描述**: 屏幕空间反射提供了对场景中物体的反射效果，不需要额外的环境贴图。
- **特点**:
  - 基于当前可见场景信息计算反射
  - 较SSGI计算量更小

### TRAA (时间重构抗锯齿)
- **文件**: `src/libs/realism-effects/src/traa/TRAAEffect.js`
- **描述**: 先进的时间抗锯齿技术，通过多帧信息重构提供比TAA更高质量的抗锯齿效果。
- **特点**:
  - 减少锯齿，提供更平滑的边缘
  - 抑制闪烁和噪点

### TAA (时间抗锯齿)
- **文件**: `src/libs/realism-effects/src/taa/TAAPass.js`
- **描述**: 传统的时间抗锯齿技术，通过帧间混合减少锯齿和闪烁。
- **特点**:
  - 轻量级实现
  - 兼容性良好

### MotionBlur (动态模糊)
- **文件**: `src/libs/realism-effects/src/motion-blur/MotionBlurEffect.js`
- **描述**: 模拟高速移动物体的模糊效果，增强动态场景的真实感。
- **特点**:
  - 基于速度缓冲区实现
  - 可调整的模糊强度

### HBAO (基于地平线的环境光遮蔽)
- **文件**: `src/libs/realism-effects/src/hbao/HBAOEffect.js`
- **描述**: 高质量的环境光遮蔽技术，根据表面几何结构计算阴影和环境光的遮挡。
- **特点**:
  - 物理真实的环境光遮蔽效果
  - 可配置的质量和性能选项

### Sharpness (锐化)
- **文件**: `src/libs/realism-effects/src/sharpness/SharpnessEffect.js`
- **描述**: 增强图像细节和边缘锐度的后处理效果。
- **特点**:
  - 自适应锐化算法
  - 可控制的锐化强度

### GradualBackground (渐变背景)
- **文件**: `src/libs/realism-effects/src/gradual-background/GradualBackgroundEffect.js`
- **描述**: 为场景提供平滑渐变背景效果。
- **特点**:
  - 可自定义的渐变色彩和方向
  - 与场景其他元素的融合

### Sparkle (闪光效果)
- **文件**: `src/libs/realism-effects/src/sparkle/SparkleEffect.js`
- **描述**: 为高亮区域添加闪光效果，模拟金属或水面反光。
- **特点**:
  - 基于亮度阈值的闪光生成
  - 可调整的闪光参数

### LensDistortion (镜头畸变)
- **文件**: `src/libs/realism-effects/src/lens-distortion/LensDistortionEffect.js`
- **描述**: 模拟相机镜头的畸变效果，增加摄影真实感。
- **特点**:
  - 多种畸变模式
  - 可调整的畸变参数

## 核心组件

### Denoiser (降噪器)
- **文件**: `src/libs/realism-effects/src/denoise/Denoiser.js`
- **描述**: 用于处理渲染中的噪点问题，特别是与路径追踪和全局光照相关的噪点。
- **特点**:
  - 支持时间与空间降噪
  - 多种降噪算法，包括Poisson降噪

### TemporalReproject (时间重投影)
- **文件**: `src/libs/realism-effects/src/temporal-reproject/TemporalReprojectPass.js`
- **描述**: 帧间信息重投影技术，是多种效果的基础组件。
- **特点**:
  - 帧历史累积
  - 运动补偿
  - 抖动采样支持

### GBuffer (几何缓冲区)
- **文件**: `src/libs/realism-effects/src/gbuffer/GBufferPass.js`
- **描述**: 存储场景的几何信息，包括深度、法线、粗糙度等，为其他效果提供数据支持。
- **特点**:
  - 高效的场景信息提取
  - 支持多种材质属性

## 辅助组件

### VelocityPass (速度通道)
- **文件**: `src/libs/realism-effects/src/temporal-reproject/pass/VelocityPass.js`
- **描述**: 计算场景中物体的运动速度，为动态模糊和时间抗锯齿效果提供支持。

### VelocityDepthNormalPass (速度深度法线通道)
- **文件**: `src/libs/realism-effects/src/temporal-reproject/pass/VelocityDepthNormalPass.js`
- **描述**: 同时计算速度、深度和法线信息，优化多效果情况下的性能。

### PoissonDenoisePass (泊松降噪通道)
- **文件**: `src/libs/realism-effects/src/denoise/pass/PoissonDenoisePass.js`
- **描述**: 基于泊松分布的降噪算法，高效去除渲染噪点。

## 使用这些效果

这些效果都是基于postprocessing库设计的，可以轻松集成到Three.js项目中。大多数效果都提供了丰富的参数设置，可以根据性能需求和视觉质量进行调整。

使用示例可以参考库中的example目录，该目录包含了多个演示场景和配置示例。

## 注意事项

- 部分高级效果（如SSGI）对硬件要求较高，可能需要在低端设备上降低质量设置
- 降噪过程对特定场景可能会出现黑点问题，需要调整参数或进行额外处理
- 这些效果最好在WebGL2上运行，以获得最佳性能和视觉效果 