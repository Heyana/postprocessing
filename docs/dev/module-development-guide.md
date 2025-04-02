# 后处理库模块开发指南

## 目录

1. [简介](#简介)
2. [项目结构](#项目结构)
3. [开发流程](#开发流程)
   - [需求分析](#需求分析)
   - [架构设计](#架构设计)
   - [核心实现](#核心实现)
   - [单元测试](#单元测试)
   - [Demo创建](#demo创建)
   - [性能优化](#性能优化)
   - [文档编写](#文档编写)
4. [核心模块开发](#核心模块开发)
   - [Effect基类](#effect基类)
   - [插件系统](#插件系统)
   - [通道系统](#通道系统)
   - [渲染架构](#渲染架构)
5. [Demo开发](#demo开发)
   - [Demo文件结构](#demo文件结构)
   - [场景设计](#场景设计)
   - [效果应用](#效果应用)
   - [UI控制面板](#ui控制面板)
   - [文档编写](#demo文档编写)
6. [最佳实践](#最佳实践)
   - [性能优化](#性能优化技巧)
   - [用户体验](#用户体验)
   - [兼容性处理](#兼容性处理)
7. [文档标准](#文档标准)
8. [参考资源](#参考资源)

## 简介

本文档是后处理效果库的综合开发指南，为开发者提供了理解项目架构和快速开始开发的完整参考。该指南涵盖了从基础模块开发到高级效果实现的全过程，以及如何创建高质量的演示示例。

后处理效果库是一个专注于为Three.js提供高质量后期处理效果的工具包，包括泛光、屏幕空间反射、环境光遮蔽等视觉效果。通过本指南，开发者可以了解如何扩展现有功能，开发新的后处理效果，以及创建展示这些效果的演示示例。

## 项目结构

项目的主要目录结构如下：

```
project/
├── src/                     # 源代码
│   ├── core/                # 核心基础类
│   ├── effects/             # 后处理效果
│   │   └── glsl/            # 着色器代码
│   ├── passes/              # 渲染通道
│   └── materials/           # 自定义材质
├── demo/                    # 演示示例
│   ├── src/                 # 示例源代码
│   │   ├── demos/           # 各种效果演示
│   │   └── DemoManager.js   # 示例管理器
│   └── assets/              # 示例资源
├── test/                    # 测试代码
├── docs/                    # 文档
├── dist/                    # 构建输出
├── package.json             # 项目配置
└── README.md                # 项目说明
```

## 开发流程

### 需求分析

开发新模块前首先需要明确需求：

1. **目标效果**：确定视觉效果目标和参考资料
2. **参数定义**：设计用户可配置的参数和默认值
3. **性能目标**：确定目标平台和性能基准
4. **依赖分析**：确定所需的输入资源（如深度纹理、法线纹理等）

### 架构设计

确定模块的架构和实现方式：

1. **类结构设计**：确定类继承关系和接口
2. **数据流分析**：规划数据如何在不同处理阶段流动
3. **资源管理**：确定需要创建的渲染目标和纹理资源
4. **着色器分解**：将复杂效果分解为多个着色器通道

### 核心实现

模块开发的具体步骤：

1. **创建基础类**：实现基本框架和参数设置
2. **实现着色器**：编写GLSL代码实现视觉效果
3. **JS封装**：将着色器集成到Three.js渲染流程中
4. **参数控制**：实现参数动态调整的逻辑

```javascript
// 效果类实现示例
import { Effect } from "./Effect.js";
import fragmentShader from "./glsl/my-effect.frag";

export class MyEffect extends Effect {
    constructor({
        intensity = 1.0,
        resolution = 0.5,
        blendFunction = BlendFunction.NORMAL
    } = {}) {
        super("MyEffect", fragmentShader, {
            blendFunction,
            uniforms: new Map([
                ["intensity", new Uniform(intensity)],
                ["resolution", new Uniform(new Vector2())]
            ])
        });
        
        this._resolution = resolution;
    }
    
    // 设置函数和属性访问器
    setIntensity(value) {
        this.uniforms.get("intensity").value = value;
    }
    
    getIntensity() {
        return this.uniforms.get("intensity").value;
    }
    
    // 生命周期方法
    update(renderer, inputBuffer, deltaTime) {
        // 每帧更新逻辑
    }
    
    setSize(width, height) {
        const resolution = this._resolution;
        this.uniforms.get("resolution").value.set(
            resolution * width, resolution * height);
    }
}
```

### 单元测试

为确保模块质量，需要编写测试：

1. **参数测试**：验证参数设置和获取功能
2. **渲染测试**：验证效果在不同场景下的渲染结果
3. **性能测试**：测量效果在不同配置下的性能表现
4. **边界测试**：测试极端参数值和边界条件

```javascript
// Jest测试示例
describe("MyEffect", () => {
    test("constructs with default parameters", () => {
        const effect = new MyEffect();
        expect(effect.getIntensity()).toBe(1.0);
    });
    
    test("updates intensity correctly", () => {
        const effect = new MyEffect();
        effect.setIntensity(2.0);
        expect(effect.getIntensity()).toBe(2.0);
    });
    
    // 更多测试...
});
```

### Demo创建

开发完成后，创建演示示例：

1. **设计场景**：创建能够展示效果的3D场景
2. **应用效果**：将开发的效果应用到场景中
3. **添加控制**：创建UI控制面板调整参数
4. **添加说明**：提供效果说明和使用方法

### 性能优化

优化模块性能：

1. **分析瓶颈**：使用性能工具识别瓶颈
2. **着色器优化**：优化着色器代码以减少计算量
3. **缓存策略**：合理利用缓存减少重复计算
4. **分辨率调整**：为不同效果使用适当的渲染分辨率

### 文档编写

编写完整的文档：

1. **API文档**：详细的类、方法和参数说明
2. **使用示例**：提供基本的使用代码示例
3. **原理解释**：解释效果的实现原理
4. **性能建议**：提供优化使用的建议

## 核心模块开发

### Effect基类

`Effect`是所有后处理效果的基类，提供了以下核心功能：

```javascript
export class Effect {
    constructor(name, fragmentShader, {
        attributes = EffectAttribute.NONE,
        blendFunction = BlendFunction.NORMAL,
        defines = new Map(),
        uniforms = new Map(),
        extensions = null,
        vertexShader = null
    } = {}) {
        // 初始化代码...
    }
    
    // 生命周期方法
    initialize(renderer, alpha, frameBufferType) {}
    update(renderer, inputBuffer, deltaTime) {}
    setSize(width, height) {}
    dispose() {}
    
    // 渲染方法
    render(renderer, inputBuffer, outputBuffer, deltaTime, stencilTest) {}
}
```

开发新效果时，继承此类并重写相关方法。

### 插件系统

后处理库支持插件扩展，用于添加新功能或修改现有行为：

```javascript
// 插件示例
class MyPlugin extends Plugin {
    constructor() {
        super("MyPlugin");
    }
    
    // 初始化钩子
    initialize(composer, renderer) {
        // 初始化逻辑
    }
    
    // 更新钩子
    update(composer, deltaTime) {
        // 更新逻辑
    }
}
```

### 通道系统

通道(Pass)是后处理流程的基本单元，实现不同的渲染步骤：

```javascript
// 通道示例
class CustomPass extends Pass {
    constructor() {
        super("CustomPass");
        
        // 创建材质、渲染目标等
    }
    
    render(renderer, inputBuffer, outputBuffer, deltaTime, stencilTest) {
        // 实现渲染逻辑
    }
}
```

### 渲染架构

后处理系统的整体渲染架构：

1. **EffectComposer**：管理整个后处理渲染流程
2. **RenderPass**：渲染原始场景到缓冲区
3. **EffectPass**：应用一个或多个效果到缓冲区
4. **ShaderPass**：使用自定义着色器处理缓冲区
5. **SavePass**：保存当前缓冲区以供后续使用

## Demo开发

### Demo文件结构

演示示例通常包含以下文件：

```
demo/src/demos/MyEffectDemo/
├── index.js              # 主入口
├── MyEffectDemo.js       # 示例实现
├── assets/               # 示例资源
├── post-processing-cn.md # 中文文档
└── post-processing.md    # 英文文档
```

### 场景设计

设计良好的演示场景应考虑：

1. **视觉吸引力**：创建吸引人的3D场景
2. **针对性**：突出展示效果的特性和优势
3. **交互性**：提供适当的交互增强体验
4. **性能平衡**：保持良好的帧率和效果质量

```javascript
// 场景设计示例
function createScene() {
    const scene = new THREE.Scene();
    
    // 添加能够展示效果的模型
    const geometry = new THREE.TorusKnotGeometry(1, 0.3, 128, 32);
    const material = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        metalness: 0.8,
        roughness: 0.2
    });
    const model = new THREE.Mesh(geometry, material);
    scene.add(model);
    
    // 添加适合效果的灯光
    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(5, 5, 5);
    scene.add(light);
    
    // 环境设置
    scene.background = new THREE.Color(0x101010);
    
    return { scene, model };
}
```

### 效果应用

将开发的效果应用到场景：

```javascript
// 效果应用示例
function setupPostProcessing(renderer, scene, camera) {
    // 创建效果合成器
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    
    // 创建自定义效果
    const myEffect = new MyEffect({
        intensity: 1.5,
        resolution: 1.0
    });
    
    // 添加效果通道
    composer.addPass(new EffectPass(camera, myEffect));
    
    return { composer, myEffect };
}
```

### UI控制面板

添加用户交互控制面板：

```javascript
// GUI控制面板示例
function setupGUI(myEffect) {
    const gui = new GUI({ width: 300 });
    
    const folder = gui.addFolder("My Effect");
    folder.add(myEffect, "intensity", 0, 3, 0.01).name("强度");
    folder.add(myEffect, "resolution", 0.1, 1, 0.01).name("分辨率").onChange((value) => {
        myEffect.setResolution(value);
        composer.setSize(window.innerWidth, window.innerHeight);
    });
    
    folder.open();
    return gui;
}
```

### Demo文档编写

为演示示例编写文档：

```markdown
# My Effect

My Effect是一种高性能的后处理效果，能够...

## 参数

- **intensity**: 控制效果强度，默认值：1.0
- **resolution**: 控制处理分辨率，默认值：0.5

## 使用方法

```js
import { MyEffect } from "postprocessing";

const myEffect = new MyEffect({
    intensity: 1.5,
    resolution: 0.75
});

// 添加到EffectPass
const effectPass = new EffectPass(camera, myEffect);
composer.addPass(effectPass);
```

## 性能建议

- 对于移动设备，建议降低resolution参数
- 可以与其他效果组合使用，但注意整体性能影响
```

## 最佳实践

### 性能优化技巧

1. **分辨率缩放**：对计算密集型效果使用较低分辨率
2. **按需处理**：仅在必要时执行完整计算
3. **资源共享**：在多个效果间共享缓冲区和资源
4. **LOD策略**：基于性能指标动态调整效果质量

### 用户体验

1. **渐进增强**：确保在低端设备上提供基本功能
2. **即时反馈**：参数调整时立即显示变化
3. **直观控制**：为复杂参数提供直观的控制界面
4. **预设方案**：提供常用效果组合的预设

### 兼容性处理

1. **WebGL版本检测**：
   ```javascript
   const isWebGL2 = renderer.capabilities.isWebGL2;
   ```

2. **扩展检测**：
   ```javascript
   const hasFloatTexture = renderer.extensions.get("OES_texture_float");
   ```

3. **平台适配**：
   ```javascript
   const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
   const quality = isMobile ? "low" : "high";
   ```

## 文档标准

项目文档应包含以下部分：

1. **概述**：简要介绍模块的功能和用途
2. **安装**：详细的安装和导入说明
3. **API**：完整的类、方法和参数文档
4. **示例**：基本使用和高级使用的代码示例
5. **性能**：性能特征和优化建议
6. **兼容性**：平台和浏览器兼容性信息
7. **贡献**：如何为项目贡献代码

## 参考资源

- [Three.js文档](https://threejs.org/docs/) - Three.js官方文档
- [WebGL规范](https://www.khronos.org/registry/webgl/specs/latest/) - WebGL官方规范
- [GLSL文档](https://www.khronos.org/opengl/wiki/Core_Language_(GLSL)) - GLSL着色器语言文档
- [性能优化指南](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices) - WebGL最佳实践
- [示例代码库](https://github.com/mrdoob/three.js/tree/master/examples) - Three.js官方示例 