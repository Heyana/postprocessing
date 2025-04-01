# 选择性AO(环境光遮蔽)修改方案

## 问题描述

在当前的AO效果实现中，我们无法有效地控制哪些对象参与AO计算，哪些对象被排除。当前的机制是在`update`方法中修改对象的渲染层，但这种方法存在根本性问题 - 当执行到`update`方法时，深度信息已经被采集和处理，AO效果已经计算好了。

根据运行时日志分析：
```
AOEffect: 准备处理 6 个被排除的对象
AOEffect: 排除对象 未命名, 原层: 5, 新层: 2
AOEffect: 排除对象 Z_UP, 原层: 1, 新层: 2
AOEffect: 排除对象 Armature, 原层: 1, 新层: 2
AOEffect: 排除对象 Bone, 原层: 1, 新层: 2
AOEffect: 排除对象 Bone001, 原层: 1, 新层: 2
AOEffect: 排除对象 Cylinder, 原层: 1, 新层: 2
AOEffect: 恢复对象 未命名 到原层: 5
AOEffect: 恢复对象 Z_UP 到原层: 1
AOEffect: 恢复对象 Armature 到原层: 1
AOEffect: 恢复对象 Bone 到原层: 1
AOEffect: 恢复对象 Bone001 到原层: 1
AOEffect: 恢复对象 Cylinder 到原层: 1
```

可以看到对象的层设置确实被修改了，但AO效果仍然应用到了这些对象上。这是因为AO效果的工作流程：

1. 先通过深度图为所有模型叠加一层颜色（生成AO效果）
2. 然后利用深度信息减去不需要的部分，只留下阴影

当我们在update方法中修改对象的层级，深度信息已经被采集了，修改无效。

## 解决方案

以下提出几种可能的解决方案，从简单到复杂，各有利弊。

### 方案1：预渲染遮罩

创建一个深度预处理通道，在正式的AO计算前处理深度纹理：

```javascript
// 新增一个深度预处理通道，在此通道中剔除不需要AO的对象
class AODepthPrepass {
    constructor(scene, camera) {
        this.scene = scene;
        this.camera = camera;
        this.excludedObjects = new Set();
        
        // 创建一个临时渲染目标用于深度处理
        this.renderTarget = new WebGLRenderTarget(1, 1, {
            minFilter: NearestFilter,
            magFilter: NearestFilter,
            format: RGBAFormat,
            type: UnsignedByteType,
            depthBuffer: true,
            stencilBuffer: false
        });
    }
    
    excludeObject(object) {
        this.excludedObjects.add(object);
    }
    
    reset() {
        this.excludedObjects.clear();
    }
    
    // 在AO计算前调用此方法
    processDepth(renderer, inputDepthTexture, outputDepthTexture) {
        // 保存原始可见性状态
        const hiddenStates = new Map();
        
        // 隐藏被排除的对象
        for (const object of this.excludedObjects) {
            this._hideObjectAndChildren(object, hiddenStates);
        }
        
        // 在这里执行深度渲染...
        
        // 恢复原始可见性状态
        for (const [obj, wasVisible] of hiddenStates) {
            obj.visible = wasVisible;
        }
    }
    
    _hideObjectAndChildren(object, stateMap) {
        if (!object) return;
        
        if (object.isMesh || object.isGroup || object.isObject3D) {
            stateMap.set(object, object.visible);
            object.visible = false;
        }
        
        if (object.children) {
            for (const child of object.children) {
                this._hideObjectAndChildren(child, stateMap);
            }
        }
    }
}
```

**优点**：
- 不需要修改复杂的着色器代码
- 可以完全控制哪些对象参与AO计算

**缺点**：
- 需要额外的渲染通道，可能影响性能
- 需要适当处理复杂的场景层次结构

### 方案2：修改AO着色器

直接修改AO的着色器代码，添加一个遮罩纹理，用于指定哪些区域应该接收AO效果：

```javascript
// 创建一个遮罩纹理
const maskTexture = new DataTexture(
    new Uint8Array(width * height).fill(255), // 默认全白，表示全部接收AO
    width, 
    height, 
    RGBAFormat
);

// 将遮罩纹理传递给着色器
aoPass.fullscreenMaterial.uniforms.maskTexture = { value: maskTexture };

// 然后在aoPass的着色器中，使用这个遮罩纹理来调整AO效果的强度
// 例如，在ao_compose中可以加上：
// vec4 mask = texture2D(maskTexture, vUv);
// finalColor = mix(originalColor, aoColor, mask.r);
```

**优点**：
- 灵活性高，可以精确控制每个像素的AO效果
- 不需要额外的渲染通道（如果使用ID纹理方式）

**缺点**：
- 需要修改着色器代码，增加复杂度
- 需要在CPU端生成或更新遮罩纹理，可能影响性能

### 方案3：渲染组方式

使用Three.js的渲染组（RenderGroups）系统来管理对象的渲染层级：

```javascript
// 创建两个场景或使用渲染组
const mainScene = new Scene(); // 正常渲染的场景
const aoExcludedScene = new Scene(); // 不参与AO的场景

// 移动对象到不同场景
function excludeFromAO(object) {
    mainScene.remove(object);
    aoExcludedScene.add(object);
}

function includeInAO(object) {
    aoExcludedScene.remove(object);
    mainScene.add(object);
}

// 修改渲染流程
// 1. 先渲染mainScene到深度缓冲
// 2. 使用这个深度缓冲计算AO
// 3. 然后渲染aoExcludedScene（不应用AO）
// 4. 最后合成
```

**优点**：
- 概念简单，易于理解
- 使用Three.js现有功能

**缺点**：
- 需要管理多个场景或渲染组
- 移动对象可能影响场景图结构
- 较复杂的实现逻辑

### 方案4（推荐）：双深度图技术

最有效的方案是使用双深度图技术：

```javascript
// 在AOEffect构造函数中
constructor(composer, camera, scene, aoPass, options = defaultAOOptions) {
    super(/*...*/);
    
    // ... 其他初始化代码 ...
    
    // 创建两个深度渲染目标
    this.fullDepthRT = new WebGLRenderTarget(/*...*/);
    this.aoOnlyDepthRT = new WebGLRenderTarget(/*...*/);
    
    // 创建深度材质
    this.depthMaterial = new MeshDepthMaterial({
        depthPacking: RGBADepthPacking
    });
    
    // 添加hideSelection功能
    this.hideSelection = new Selection();
}

// 修改渲染方法
update(renderer, inputBuffer, outputBuffer) {
    // 1. 保存当前渲染器状态
    const originalClearColor = renderer.getClearColor().clone();
    const originalClearAlpha = renderer.getClearAlpha();
    const originalAutoClear = renderer.autoClear;
    
    // 2. 渲染完整深度图(所有对象)
    this.scene.overrideMaterial = this.depthMaterial;
    renderer.setRenderTarget(this.fullDepthRT);
    renderer.clear();
    renderer.render(this.scene, this.camera);
    
    // 3. 临时隐藏被排除的对象
    const hiddenStates = new Map();
    Array.from(this.hideSelection).forEach(object => {
        this._hideObjectAndChildren(object, hiddenStates);
    });
    
    // 4. 渲染AO专用的深度图(只有需要AO的对象)
    renderer.setRenderTarget(this.aoOnlyDepthRT);
    renderer.clear();
    renderer.render(this.scene, this.camera);
    
    // 5. 恢复被隐藏的对象
    for (const [obj, wasVisible] of hiddenStates) {
        obj.visible = wasVisible;
    }
    
    // 6. 恢复场景材质
    this.scene.overrideMaterial = null;
    
    // 7. 使用AO专用深度图进行AO计算
    this.aoPass.fullscreenMaterial.uniforms.depthTexture.value = this.aoOnlyDepthRT.depthTexture;
    
    // 8. 执行AO渲染...
    this.aoPass.render(renderer);
    this.poissionDenoisePass.render(renderer);
    
    // 9. 恢复渲染器状态
    renderer.setRenderTarget(null);
    renderer.setClearColor(originalClearColor, originalClearAlpha);
    renderer.autoClear = originalAutoClear;
}

// 辅助方法：递归隐藏对象及其子对象
_hideObjectAndChildren(object, stateMap) {
    if (!object) return;
    
    if (object.isMesh || object.isGroup || object.isObject3D) {
        stateMap.set(object, object.visible);
        object.visible = false;
    }
    
    if (object.children) {
        for (const child of object.children) {
            this._hideObjectAndChildren(child, stateMap);
        }
    }
}
```

**优点**：
- 最灵活，可以完全控制深度信息
- 不需要修改AO着色器
- 可以处理复杂场景结构

**缺点**：
- 需要额外的渲染通道，增加性能开销
- 实现逻辑相对复杂

## 实现建议

基于以上分析，我们建议采用**方案4（双深度图技术）**，因为它提供了最佳的控制能力和兼容性。具体实现步骤：

1. 修改`AOEffect`构造函数，添加双深度图支持
2. 实现对象可见性临时修改和恢复的逻辑
3. 修改`update`方法，在AO计算前生成和使用专用深度图
4. 保持现有的API接口，如`excludeFromAO`、`includeInAO`方法

对于开发团队，需要注意的关键事项：

1. 渲染性能监测：双深度图技术会带来额外的渲染开销，应在实现后进行性能测试
2. 兼容性测试：在不同的WebGL实现和硬件平台上测试
3. 边缘情况处理：特别关注动态添加/删除对象的情况

## 总结

选择性AO效果是一个重要的视觉功能，能够让开发者精确控制哪些对象参与环境光遮蔽计算。当前实现中在`update`方法中修改对象层级的方法是无效的，因为此时深度信息已经采集完成。

通过实现双深度图技术，我们可以在深度信息采集阶段就排除不需要AO的对象，从而实现真正的选择性AO效果。这种方法虽然会增加一定的渲染开销，但提供了最佳的控制能力和视觉效果。

后续可以考虑进一步优化，例如使用共享深度缓冲、条件性AO渲染等技术来减少性能开销。 