import {
    Color,
    FrontSide,
    NoBlending,
    NormalBlending,
    ShaderMaterial,
    Uniform,
    WebGLRenderTarget,
    GLSL3,
    NearestFilter
} from 'three';
import { Selection } from '../../../core/Selection.js';
import { SSRPass } from './SSRPass.js';

console.log('Log-- ', 0.05, 'SelectiveSSRPass');
/**
 * SelectiveSSRPass - 选择性屏幕空间反射通道
 * 
 * 这个通道继承自SSRPass，但增加了选择性功能，可以基于金属度阈值自动选择哪些像素需要渲染SSR效果，
 * 从而提高性能，避免对所有场景对象进行处理。
 * 
 * 支持两种工作模式：
 * 1. 对象级选择：使用Selection类选择特定对象应用SSR
 * 2. 像素级判断：在shader中基于金属度值判断每个像素是否应用SSR
 */
class SelectiveSSRPass extends SSRPass {
    /**
     * 构造函数
     * @param {Object} options - 配置参数
     * @param {WebGLRenderer} options.renderer - WebGL渲染器
     * @param {Scene} options.scene - 渲染场景
     * @param {Camera} options.camera - 摄像机
     * @param {Object[]} [options.selects] - 选择的对象（对象级选择模式）
     * @param {number} [options.width=window.innerWidth] - 宽度
     * @param {number} [options.height=window.innerHeight] - 高度
     * @param {number} [options.selectionLayer=10] - 选择层
     * @param {boolean} [options.usePixelMetalnessThreshold=false] - 是否使用像素级金属度判断
     * @param {number} [options.metalnessThreshold=0.5] - 金属度阈值（仅在usePixelMetalnessThreshold为true时使用）
     */
    constructor(options) {
        super(options);

        console.log('Log-- ', 0.01, '0.01');
        // 初始化this._selects数组，防止renderMetalness方法中出现undefined错误
        this._selects = options.selects || [];

        // 选择对象的集合 - 修复：使用undefined而不是null，因为Selection期望可迭代对象或undefined
        this.selection = new Selection(undefined, options.selectionLayer || 10);

        // 是否反转选择
        this.inverted = false;

        // 是否忽略背景
        this.ignoreBackground = false;

        // 高亮颜色 - 用于指示被选中的对象
        this.highlightColor = new Color(0x333333);

        // 是否使用像素级金属度判断（在着色器中判断）
        this.usePixelMetalnessThreshold = options.usePixelMetalnessThreshold !== undefined ? options.usePixelMetalnessThreshold : false;

        // 金属度阈值 - 仅在usePixelMetalnessThreshold为true时使用

        // 使用金属度阈值进行自动选择
        this.useMetalnessThreshold = options.useMetalnessThreshold !== undefined ? options.useMetalnessThreshold : true;

        // 初始化调试模式 (0=关闭, 1=亮度, 2=金属度纹理, 3=白色检测, 4=颜色差距, 5=亮度热图)
        this.debugMode = options.debugMode !== undefined ? options.debugMode : 0;

        // 初始化亮度阈值 - 用于亮度调试模式
        this.brightnessThreshold = options.brightnessThreshold !== undefined ? options.brightnessThreshold : 0.7;

        // 创建用于渲染金属度的材质
        this._createMetalnessDetectionMaterial();

        // 修改SSR着色器以支持金属度判断 - 无论是否启用像素级判断，都先初始化相关uniforms
        this._modifySSRShader();

        // 记录原始图层
        this._originalLayers = new Map();

        // 记录对象可见性
        this._visibilityCache = new Map();

        // 记录原始自发光颜色
        this._originalEmissive = new Map();
        this._originalIntensity = new Map();

        // 初始化已处理对象集合
        this._processedObjects = new Set();

        // 初始化场景引用
        this.scene = options.scene || null;

        // 重要：如果启用了金属度阈值选择（对象级）且有场景引用，立即执行初始选择
        if (this.useMetalnessThreshold && !this.usePixelMetalnessThreshold && this.scene) {
            this.updateSelectionBasedOnMetalness();
        }
        this.setDebugMode(1)
    }

    /**
     * 创建金属度检测材质
     * @private
     */
    _createMetalnessDetectionMaterial() {
        // 金属度检测着色器
        this.metalnessDetectionMaterial = new ShaderMaterial({
            uniforms: {
                metalnessThreshold: new Uniform(this.metalnessThreshold)
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform float metalnessThreshold;
                varying vec2 vUv;
                
                // 从材质属性中获取金属度
                // 实际使用时，您需要将对象的金属度值传递给这个shader
                void main() {
                    // 这里是示例逻辑，实际实现中您需要访问材质的金属度值
                    float metalness = 0.0; // 这个值应该由材质提供
                    
                    // 如果金属度超过阈值，输出白色，否则输出黑色
                    if(metalness >= metalnessThreshold) {
                        gl_FragColor = vec4(1.0);
                    } else {
                        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
                    }
                }
            `,
            side: FrontSide,
            blending: NoBlending
        });
    }

    /**
     * 修改SSR着色器，添加金属度阈值判断
     * @private
     */
    _modifySSRShader() {
        // 确保ssrMaterial已创建
        if (!this.ssrMaterial) return;

        // 添加金属度相关uniform - 无论usePixelMetalnessThreshold是否为true，都初始化这些uniform
        this.ssrMaterial.uniforms.tMetalness = { value: null };
        this.ssrMaterial.uniforms.metalnessThreshold = { value: this.metalnessThreshold };
        this.ssrMaterial.uniforms.usePixelMetalnessThreshold = { value: this.usePixelMetalnessThreshold };

        // 添加调试模式相关的uniform
        this.ssrMaterial.uniforms.debugMode = { value: this.debugMode };
        this.ssrMaterial.uniforms.brightnessThreshold = { value: this.brightnessThreshold };

        // 获取原始fragment shader代码
        const originalFragmentShader = this.ssrMaterial.fragmentShader;

        // 添加金属度uniform声明
        let modifiedShader = originalFragmentShader.replace(
            'uniform sampler2D tNormal;',
            'uniform sampler2D tNormal;\nuniform float metalnessThreshold;\nuniform bool usePixelMetalnessThreshold;\nuniform int debugMode;\nuniform float brightnessThreshold;'
        );

        // 在main函数开始处添加金属度检查
        modifiedShader = modifiedShader.replace(
            'void main() {',
            `void main() {
    // 如果启用像素级金属度判断，先检查当前像素的金属度
    if(usePixelMetalnessThreshold) {
        vec4 metalSample = texture2D(tMetalness, vUv);
        float metalness = metalSample.r; // 金属度通常存储在R通道
        
        // 如果金属度低于阈值，直接返回无反射
        if(metalness < metalnessThreshold) {
            gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
            return;
        }
    }`
        );

        // 应用修改后的着色器代码
        // this.ssrMaterial.fragmentShader = modifiedShader;
        // this.ssrMaterial.needsUpdate = true;
    }

    /**
     * 更新金属度阈值
     * @param {Number} value - 新的金属度阈值
     */
    setMetalnessThreshold(value) {
        this.metalnessThreshold = value;
        if (this.ssrMaterial) {
            this.ssrMaterial.uniforms['metalnessThreshold'].value = value;
            this.ssrMaterial.needsUpdate = true;
        }
    }

    /**
     * 设置调试模式
     * @param {Number} mode - 调试模式 (0=关闭, 1=亮度, 2=金属度纹理, 3=白色检测, 4=颜色差距, 5=亮度热图)
     */
    setDebugMode(mode) {
        this.debugMode = mode;
        if (this.ssrMaterial) {
            if (!this.ssrMaterial.uniforms['debugMode']) {
                this.ssrMaterial.uniforms['debugMode'] = { value: mode };
            } else {
                this.ssrMaterial.uniforms['debugMode'].value = mode;
            }
            this.ssrMaterial.needsUpdate = true;
        }
    }

    /**
     * 设置亮度阈值 - 用于亮度调试模式
     * @param {Number} value - 亮度阈值 (0.0-1.0)
     */
    setBrightnessThreshold(value) {
        this.brightnessThreshold = value;
        if (this.ssrMaterial) {
            if (!this.ssrMaterial.uniforms['brightnessThreshold']) {
                this.ssrMaterial.uniforms['brightnessThreshold'] = { value: value };
            } else {
                this.ssrMaterial.uniforms['brightnessThreshold'].value = value;
            }
            this.ssrMaterial.needsUpdate = true;
        }
    }

    /**
     * 设置是否使用像素级金属度判断
     * @param {Boolean} value - 是否启用像素级判断
     */
    setUsePixelMetalnessThreshold(value) {
        this.usePixelMetalnessThreshold = value;

        // 更新shader中的标志
        if (this.ssrMaterial) {
            // 确保uniform存在
            if (!this.ssrMaterial.uniforms.usePixelMetalnessThreshold) {
                this.ssrMaterial.uniforms.usePixelMetalnessThreshold = { value: value };
                // 如果这是首次设置，可能需要再次修改着色器
                this._modifySSRShader();
            } else {
                this.ssrMaterial.uniforms.usePixelMetalnessThreshold.value = value;
            }
            // 标记材质需要更新
            this.ssrMaterial.needsUpdate = true;
        }

        // 如果禁用像素级判断，但启用对象级判断，更新选择
        if (!value && this.useMetalnessThreshold) {
            this.updateSelectionBasedOnMetalness();
        }
    }

    /**
     * 根据金属度更新对象选择（对象级选择模式）
     */
    updateSelectionBasedOnMetalness() {
        return
        if (!this.scene) {
            console.warn("SelectiveSSRPass: updateSelectionBasedOnMetalness无法执行 - 场景未设置");
            return;
        }

        console.log("执行updateSelectionBasedOnMetalness，阈值:", this.metalnessThreshold);

        // 清除当前选择
        this.selection.clear();
        this._processedObjects.clear();

        let selectedCount = 0;

        // 遍历场景中的所有对象
        this.scene.traverse((object) => {
            if (object.isMesh && object.material) {
                // 检查对象的金属度
                const metalness = this._getObjectMetalness(object);

                // 如果金属度超过阈值，则添加到选择中
                if (metalness >= this.metalnessThreshold) {
                    this.selection.add(object);
                    this._processedObjects.add(object);
                    selectedCount++;

                    // 存储原始发光颜色并设置高亮
                    this._storeOriginalEmissive(object);
                    this._setObjectHighlight(object, true);
                } else if (this._processedObjects.has(object)) {
                    // 如果之前处理过但现在不符合条件，移除高亮
                    this._setObjectHighlight(object, false);
                    this._processedObjects.delete(object);
                }
            }
        });

        console.log(`金属度选择完成，选中了 ${selectedCount} 个对象`);

        // 即使在像素级模式下，也更新shader中的参数，确保实时效果
        if (this.ssrMaterial) {
            this.ssrMaterial.uniforms['metalnessThreshold'].value = this.metalnessThreshold;
            this.ssrMaterial.needsUpdate = true;
        }

        // 更新_selects数组以避免在renderMetalness中出错
        this._selects = Array.from(this.selection);
    }

    /**
     * 获取对象的金属度值
     * @private
     * @param {Object3D} object - 三维对象
     * @return {Number} 金属度值
     */
    _getObjectMetalness(object) {
        if (!object.material) return 0;

        // 处理数组材质
        if (Array.isArray(object.material)) {
            let maxMetalness = 0;
            for (const material of object.material) {
                if (material.metalness !== undefined) {
                    maxMetalness = Math.max(maxMetalness, material.metalness);
                }
            }
            return maxMetalness;
        }

        // 处理单个材质
        return object.material.metalness !== undefined ? object.material.metalness : 0;
    }

    /**
     * 存储对象的原始发光颜色
     * @private
     * @param {Object3D} object - 三维对象
     */
    _storeOriginalEmissive(object) {
        if (!object.material) return;

        // 处理数组材质
        if (Array.isArray(object.material)) {
            for (const material of object.material) {
                if (material.emissive && !this._originalEmissive.has(material)) {
                    this._originalEmissive.set(material, material.emissive.clone());
                }
            }
        } else if (object.material.emissive && !this._originalEmissive.has(object.material)) {
            this._originalEmissive.set(object.material, object.material.emissive.clone());
        }
    }

    /**
     * 设置对象的高亮状态
     * @private
     * @param {Object3D} object - 三维对象
     * @param {Boolean} highlight - 是否高亮
     */
    _setObjectHighlight(object, highlight) {
        if (!object.material) return;

        // 处理数组材质
        if (Array.isArray(object.material)) {
            for (const material of object.material) {
                if (material.emissive) {
                    if (highlight) {
                        // 添加微弱发光以指示选中
                        material.emissive.copy(this.highlightColor);
                    } else {
                        // 恢复原始发光
                        const originalEmissive = this._originalEmissive.get(material);
                        if (originalEmissive) {
                            material.emissive.copy(originalEmissive);
                        }
                    }
                }
            }
        } else if (object.material.emissive) {
            if (highlight) {
                // 添加微弱发光以指示选中
                object.material.emissive.copy(this.highlightColor);
            } else {
                // 恢复原始发光
                const originalEmissive = this._originalEmissive.get(object.material);
                if (originalEmissive) {
                    object.material.emissive.copy(originalEmissive);
                }
            }
        }
    }

    /**
     * 创建多层渲染所需的材质和渲染目标
     * @private
     */
    _createMultiRenderMaterials() {
        // 创建一个支持多渲染目标(MRT)的WebGLRenderTarget，设置count为3表示三个渲染目标
        this.multiRenderTarget = new WebGLRenderTarget(
            this.width,
            this.height,
            {
                count: 3, // 指定要使用的渲染目标数量：法线、金属度和颜色
                minFilter: NearestFilter,
                magFilter: NearestFilter
            }
        );

        // 设置渲染目标类型和格式，与原来的renderTarget保持一致
        this.multiRenderTarget.textures[0].name = 'normalTexture';
        this.multiRenderTarget.textures[1].name = 'metalnessTexture';
        this.multiRenderTarget.textures[2].name = 'colorTexture';

        // 创建一个能够同时输出法线、金属度和颜色的多通道材质
        this.multiPassMaterial = new ShaderMaterial({
            uniforms: {
                // 可以在这里添加需要的uniform变量
                diffuseMap: { value: null } // 可选：如果需要基于纹理的颜色
                ,
                metalness: {
                    value: 0.0
                }
            },
            vertexShader: `
                out vec3 vNormal;
                out vec2 vUv;
                out vec3 vViewPosition;
                void main() {
                    vUv = uv;
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    vViewPosition = -mvPosition.xyz;
                    vNormal = normalMatrix * normal;    
                    
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                precision highp float;
                precision highp int;
                
                layout(location = 0) out vec4 gNormal;
                layout(location = 1) out vec4 gMetalness;
                layout(location = 2) out vec4 gColor;
                
                in vec3 vNormal;
                in vec2 vUv;
                in vec3 vColor;

                uniform sampler2D tDiffuse;

                
                void main() {
                    // 输出法线信息到第一个渲染目标
                    vec3 normal = normalize(vNormal);
                    gNormal = vec4(  0.5,0.5, 0.5, 1.0);
                    
                    // 输出金属度信息到第二个渲染目标
                    float metalness = 1.0; // 对于选中的对象，金属度始终为1
                    gMetalness = vec4(0.0, 0.0, 0.0, 1.0);
                    
                    // 输出颜色信息到第三个渲染目标
                    // 这里使用了顶点颜色，您也可以使用材质颜色或纹理
                vec3 baseColor = texture(tDiffuse, vUv).rgb;
                    gColor = vec4(baseColor, 1.0); // 输出实际颜色 + alpha
                }
            `,
            side: FrontSide,
            blending: NoBlending,
            glslVersion: GLSL3
        });
    }

    /**
     * 渲染多个层（法线、金属度和颜色）到多个渲染目标
     * @param {WebGLRenderer} renderer - WebGL渲染器
     */
    renderMultipleLayers(renderer) {
        // 如果多渲染目标材质不存在，创建它
        if (!this.multiRenderTarget) {
            this._createMultiRenderMaterials();
        }

        // 保存当前渲染器状态
        this.originalClearColor.copy(renderer.getClearColor(this.tempColor));
        const originalClearAlpha = renderer.getClearAlpha(this.tempColor);
        const originalAutoClear = renderer.autoClear;

        // 设置渲染目标
        renderer.setRenderTarget(this.multiRenderTarget);
        renderer.autoClear = false;
        renderer.setClearColor(0, 0);
        renderer.clear();

        // 临时保存材质
        const materialCache = new Map();
        this.selection.forEach((child) => {
            materialCache.set(child, child.material);
            child.material = this.multiPassMaterial;
        });

        // 应用多通道材质并渲染场景
        this.scene.overrideMaterial = this.multiPassMaterial;
        renderer.render(this.scene, this.camera);
        this.scene.overrideMaterial = null;

        // 恢复原始材质
        this.selection.forEach((child) => {
            child.material = materialCache.get(child);
        });

        // 拷贝结果到原始渲染目标
        // 法线数据被保存到normalRenderTarget
        // this.copyMaterial.uniforms['tDiffuse'].value = this.multiRenderTarget.textures[0];
        this.copyMaterial.blending = NoBlending;
        this.renderPass(renderer, this.copyMaterial, this.normalRenderTarget);

        // 金属度数据被保存到metalnessRenderTarget
        // this.copyMaterial.uniforms['tDiffuse'].value = this.multiRenderTarget.textures[2];
        this.renderPass(renderer, this.copyMaterial, this.metalnessRenderTarget);

        // 颜色数据可以直接使用，或者拷贝到其他渲染目标
        // 如果需要，您可以添加代码来保存颜色数据到单独的渲染目标
        // this.copyMaterial.uniforms['tDiffuse'].value = this.multiRenderTarget.textures[2];
        // this.renderPass(renderer, this.copyMaterial, this.colorRenderTarget);

        // 恢复渲染器状态
        renderer.autoClear = originalAutoClear;
        renderer.setClearColor(this.originalClearColor);
        renderer.setClearAlpha(originalClearAlpha);
    }

    /**
     * 覆盖原始渲染方法，添加选择性渲染逻辑
     * @override
     */
    render(renderer, writeBuffer, readBuffer /*, readBuffer, deltaTime, maskActive */) {
        // 如果启用了对象级金属度阈值检测，且未使用像素级判断
        // if (this.useMetalnessThreshold && !this.usePixelMetalnessThreshold) {
        //     this.updateSelectionBasedOnMetalness();
        // }

        // 在渲染前准备选择性渲染（仅在使用对象级选择时需要）
        if (!this.usePixelMetalnessThreshold) {
            this._prepareSelectionBeforeRender(this.scene);
        }

        // 确保SSR材质属性更新
        if (this.ssrMaterial) {
            this.ssrMaterial.uniforms['readBuffer'] = { value: readBuffer.texture };


            // 确保所有所需的uniform都已创建
            if (!this.ssrMaterial.uniforms['metalnessThreshold']) {
                this.ssrMaterial.uniforms['metalnessThreshold'] = { value: this.metalnessThreshold };
            }
            if (!this.ssrMaterial.uniforms['usePixelMetalnessThreshold']) {
                this.ssrMaterial.uniforms['usePixelMetalnessThreshold'] = { value: this.usePixelMetalnessThreshold };
            }
            if (!this.ssrMaterial.uniforms['debugMode']) {
                this.ssrMaterial.uniforms['debugMode'] = { value: this.debugMode };
            }
            if (!this.ssrMaterial.uniforms['brightnessThreshold']) {
                this.ssrMaterial.uniforms['brightnessThreshold'] = { value: this.brightnessThreshold };
            }
            // 添加颜色纹理的uniform
            if (!this.ssrMaterial.uniforms['tColor']) {
                this.ssrMaterial.uniforms['tColor'] = { value: null };
            }

            // 设置uniform值
            this.ssrMaterial.uniforms['metalnessThreshold'].value = this.metalnessThreshold;
            this.ssrMaterial.uniforms['usePixelMetalnessThreshold'].value = this.usePixelMetalnessThreshold;
            this.ssrMaterial.uniforms['debugMode'].value = this.debugMode;
            this.ssrMaterial.uniforms['brightnessThreshold'].value = this.brightnessThreshold;
        }

        // render beauty and depth
        renderer.setRenderTarget(this.beautyRenderTarget);
        renderer.clear();
        if (this.groundReflector) {
            this.groundReflector.visible = false;
            this.groundReflector.doRender(this.renderer, this.scene, this.camera);
            this.groundReflector.visible = true;
        }

        // 正常渲染场景（保留所有对象）
        // renderer.render(this.scene, this.camera);
        if (this.groundReflector) this.groundReflector.visible = false;

        // 使用多层渲染替代分开渲染法线和金属度
        this.renderMultipleLayers(renderer);

        // 设置SSR材质的输入纹理
        this.ssrMaterial.uniforms['readBuffer'].value = this.multiRenderTarget.textures[2]; // 法线纹理

        if (!this.ssrMaterial.uniforms['tMetalness']) {
            this.ssrMaterial.uniforms['tMetalness'] = { value: this.multiRenderTarget.textures[1] }; // 金属度纹理
        } else {
            this.ssrMaterial.uniforms['tMetalness'].value = this.multiRenderTarget.textures[1];
        }

        // 设置颜色纹理
        this.ssrMaterial.uniforms['tColor'].value = this.multiRenderTarget.textures[2]; // 颜色纹理

        // 设置SSR材质的其他参数
        this.ssrMaterial.uniforms['opacity'].value = this.opacity;
        this.ssrMaterial.uniforms['maxDistance'].value = this.maxDistance;
        this.ssrMaterial.uniforms['thickness'].value = this.thickness;

        // 设置深度纹理
        if (this.useExternalDepth && this.externalDepthTexture) {
            this.ssrMaterial.uniforms['tDepth'].value = this.externalDepthTexture;
        } else {
            this.ssrMaterial.uniforms['tDepth'].value = this.beautyRenderTarget.depthTexture;
        }

        // 渲染SSR
        this.renderPass(renderer, this.ssrMaterial, this.ssrRenderTarget);

        // render blur
        if (this.blur) {
            this.renderPass(renderer, this.blurMaterial, this.blurRenderTarget);
            this.renderPass(renderer, this.blurMaterial2, this.blurRenderTarget2);
        }

        // output result to screen
        switch (this.output) {
            case SSRPass.OUTPUT.Default:
                if (this.bouncing) {
                    this.copyMaterial.uniforms['tDiffuse'].value = this.beautyRenderTarget.texture;
                    this.copyMaterial.blending = NoBlending;
                    this.renderPass(renderer, this.copyMaterial, this.prevRenderTarget);

                    if (this.blur)
                        this.copyMaterial.uniforms['tDiffuse'].value = this.blurRenderTarget2.texture;
                    else
                        this.copyMaterial.uniforms['tDiffuse'].value = this.ssrRenderTarget.texture;
                    this.copyMaterial.blending = NormalBlending;
                    this.renderPass(renderer, this.copyMaterial, this.prevRenderTarget);

                    this.copyMaterial.uniforms['tDiffuse'].value = this.prevRenderTarget.texture;
                    this.copyMaterial.blending = NoBlending;
                    this.renderPass(renderer, this.copyMaterial, this.renderToScreen ? null : writeBuffer);
                } else {
                    this.copyMaterial.uniforms['tDiffuse'].value = this.beautyRenderTarget.texture;
                    this.copyMaterial.blending = NoBlending;
                    this.renderPass(renderer, this.copyMaterial, this.renderToScreen ? null : writeBuffer);

                    if (this.blur)
                        this.copyMaterial.uniforms['tDiffuse'].value = this.blurRenderTarget2.texture;
                    else
                        this.copyMaterial.uniforms['tDiffuse'].value = this.ssrRenderTarget.texture;
                    this.copyMaterial.blending = NormalBlending;
                    this.renderPass(renderer, this.copyMaterial, this.renderToScreen ? null : writeBuffer);
                }
                break;
            case SSRPass.OUTPUT.SSR:
                if (this.blur)
                    this.copyMaterial.uniforms['tDiffuse'].value = this.blurRenderTarget2.texture;
                else
                    this.copyMaterial.uniforms['tDiffuse'].value = this.ssrRenderTarget.texture;
                this.copyMaterial.blending = NoBlending;
                this.renderPass(renderer, this.copyMaterial, this.renderToScreen ? null : writeBuffer);

                if (this.bouncing) {
                    if (this.blur)
                        this.copyMaterial.uniforms['tDiffuse'].value = this.blurRenderTarget2.texture;
                    else
                        this.copyMaterial.uniforms['tDiffuse'].value = this.beautyRenderTarget.texture;
                    this.copyMaterial.blending = NoBlending;
                    this.renderPass(renderer, this.copyMaterial, this.prevRenderTarget);

                    this.copyMaterial.uniforms['tDiffuse'].value = this.ssrRenderTarget.texture;
                    this.copyMaterial.blending = NormalBlending;
                    this.renderPass(renderer, this.copyMaterial, this.prevRenderTarget);
                }
                break;
            case SSRPass.OUTPUT.Beauty:
                this.copyMaterial.uniforms['tDiffuse'].value = this.beautyRenderTarget.texture;
                this.copyMaterial.blending = NoBlending;
                this.renderPass(renderer, this.copyMaterial, this.renderToScreen ? null : writeBuffer);
                break;
            case SSRPass.OUTPUT.Depth:
                if (this.useExternalDepth && this.externalDepthTexture) {
                    this.depthRenderMaterial.uniforms['tDepth'].value = this.externalDepthTexture;
                } else {
                    this.depthRenderMaterial.uniforms['tDepth'].value = this.beautyRenderTarget.depthTexture;
                }
                this.renderPass(renderer, this.depthRenderMaterial, this.renderToScreen ? null : writeBuffer);
                break;
            case SSRPass.OUTPUT.Normal:
                this.copyMaterial.uniforms['tDiffuse'].value = this.multiRenderTarget.textures[0];
                this.copyMaterial.blending = NoBlending;
                this.renderPass(renderer, this.copyMaterial, this.renderToScreen ? null : writeBuffer);
                break;
            case SSRPass.OUTPUT.Metalness:
                this.copyMaterial.uniforms['tDiffuse'].value = this.multiRenderTarget.textures[1];
                this.copyMaterial.blending = NoBlending;
                this.renderPass(renderer, this.copyMaterial, this.renderToScreen ? null : writeBuffer);
                break;
            case SSRPass.OUTPUT.Color:
                // 新增：输出颜色通道
                this.copyMaterial.uniforms['tDiffuse'].value = this.multiRenderTarget.textures[2];
                this.copyMaterial.blending = NoBlending;
                this.renderPass(renderer, this.copyMaterial, this.renderToScreen ? null : writeBuffer);
                break;
            case SSRPass.OUTPUT.Brightness:
                // 设置debugMode为1（亮度模式）
                if (this.ssrMaterial.uniforms['debugMode']) {
                    this.ssrMaterial.uniforms['debugMode'].value = 1;
                }
                // 使用SSR着色器但专门显示亮度
                this.renderPass(renderer, this.ssrMaterial, this.renderToScreen ? null : writeBuffer);
                // 恢复debugMode为0
                if (this.ssrMaterial.uniforms['debugMode']) {
                    this.ssrMaterial.uniforms['debugMode'].value = 0;
                }
                break;
            default:
                console.warn('THREE.SSRPass: Unknown output type.');
        }

        // 在渲染后恢复对象的原始状态（仅在使用对象级选择时需要）
    }
    renderOverride(renderer, overrideMaterial, renderTarget, clearColor, clearAlpha) {

        this.originalClearColor.copy(renderer.getClearColor(this.tempColor));
        const originalClearAlpha = renderer.getClearAlpha(this.tempColor);
        const originalAutoClear = renderer.autoClear;

        renderer.setRenderTarget(renderTarget);
        renderer.autoClear = false;

        clearColor = overrideMaterial.clearColor || clearColor;
        clearAlpha = overrideMaterial.clearAlpha || clearAlpha;

        if ((clearColor !== undefined) && (clearColor !== null)) {

            renderer.setClearColor(clearColor);
            renderer.setClearAlpha(clearAlpha || 0.0);
            renderer.clear();

        }

        this.scene.overrideMaterial = overrideMaterial;

        renderer.render(this.scene, this.camera);

        this.scene.overrideMaterial = null;

        // restore original state

        renderer.autoClear = originalAutoClear;
        renderer.setClearColor(this.originalClearColor);
        renderer.setClearAlpha(originalClearAlpha);

    }


    /**
    * 覆盖SSRPass的renderMetalness方法，考虑选择的对象
    */
    renderMetalness(renderer, overrideMaterial, renderTarget, clearColor, clearAlpha) {
        // 确保_selects始终存在，防止undefined错误
        if (!this._selects) {
            this._selects = Array.from(this.selection);
        }



        // 以下是对象级金属度判断的逻辑
        // 保存当前渲染器状态
        this.originalClearColor.copy(renderer.getClearColor(this.tempColor));
        const originalClearAlpha = renderer.getClearAlpha(this.tempColor);
        const originalAutoClear = renderer.autoClear;

        renderer.setRenderTarget(renderTarget);

        // 设置Pass状态
        renderer.autoClear = false;
        if ((clearColor !== undefined) && (clearColor !== null)) {
            renderer.setClearColor(clearColor);
            renderer.setClearAlpha(clearAlpha || 0.0);
            renderer.clear();
        }

        // 确保scene存在
        if (!this.scene) {
            console.warn("SelectiveSSRPass: 场景未设置，无法渲染金属度");
            return;
        }

        // 临时保存材质和可见性
        const visibilityCache = new Map();
        const materialCache = new Map();

        // console.log('Log-- ', this.selection, 'this.selection');
        this.selection.forEach((child) => {
            // 保存原始信息
            materialCache.set(child, child.material);
            // 根据选择确定使用哪种金属度材质
            child.material = this.metalnessOnMaterial;
        })

        // 渲染金属度
        renderer.render(this.scene, this.camera);


        this.selection.forEach((child) => {
            child.material = materialCache.get(child);
        })

        // 恢复渲染器状态
        renderer.setClearColor(this.originalClearColor, originalClearAlpha);
        renderer.autoClear = originalAutoClear;
    }

    /**
     * 在渲染前准备选择性渲染（对象级选择模式）
     * @private
     * @param {Scene} scene - 场景
     */
    _prepareSelectionBeforeRender(scene) {
        // this.selection.forEach((object) => {
        //     object.material.metalness = 1.0
        // })
        return
        // 清除缓存
        this._originalLayers.clear();

        // 遍历场景中的所有对象
        scene.traverse((object) => {
            if (object.isMesh) {
                // 保存原始图层
                this._originalLayers.set(object, object.layers.mask);

                // 保存原始可见性
                this._visibilityCache.set(object, object.visible);

                // 确定对象是否应该被SSR渲染
                const selected = this.selection.has(object);
                const include = this.inverted ? !selected : selected;

                if (include) {
                    // 激活选择层使对象被SSR渲染
                    object.layers.enable(this.selection.layer);
                } else if (!this.ignoreBackground) {
                    // 如果不忽略背景，对未选中对象进行特殊处理
                    object.layers.enable(this.selection.layer);
                } else {
                    // 否则禁用选择层
                    object.layers.disable(this.selection.layer);
                    // 在SSR渲染阶段隐藏对象
                    object.visible = false;
                }
            }
        });
    }

    /**
     * 在渲染后恢复对象的原始状态（对象级选择模式）
     * @private
     */
    _restoreSelectionAfterRender() {
        // 恢复所有对象的原始图层和可见性
        // for (const [object, mask] of this._originalLayers) {
        //     object.layers.mask = mask;
        //     object.visible = this._visibilityCache.get(object);
        // }
    }

    /**
     * 设置场景引用，用于自动更新选择
     * @param {Scene} scene - 场景对象
     */
    setScene(scene) {
        this.scene = scene;
        if (this.useMetalnessThreshold && !this.usePixelMetalnessThreshold) {
            this.updateSelectionBasedOnMetalness();
        }
        // 更新_selects以避免renderMetalness中的错误
        this._selects = Array.from(this.selection);
    }

    /**
     * 设置选择层
     * @param {Number} layer - 选择层索引
     */
    setSelectionLayer(layer) {
        this.selection.layer = layer;
    }

    /**
     * 设置选择反转
     * @param {Boolean} inverted - 是否反转选择
     */
    setInverted(inverted) {
        this.inverted = inverted;
    }

    /**
     * 设置是否忽略背景
     * @param {Boolean} ignore - 是否忽略背景
     */
    setIgnoreBackground(ignore) {
        this.ignoreBackground = ignore;
    }

    /**
     * 添加对象到选择集
     * @param {Object3D} object - 要添加的对象
     */
    addSelection(object) {
        this.selection.add(object);
        // 更新_selects以避免renderMetalness中的错误
        this._selects = Array.from(this.selection);
        this._storeOriginalEmissive(object);
        this._setObjectHighlight(object, true);
        this._processedObjects.add(object);
    }

    /**
     * 从选择集中移除对象
     * @param {Object3D} object - 要移除的对象
     */
    removeSelection(object) {
        this.selection.delete(object);
        // 更新_selects以避免renderMetalness中的错误
        this._selects = Array.from(this.selection);
        this._setObjectHighlight(object, false);
        this._processedObjects.delete(object);
    }

    /**
     * 切换对象的选择状态
     * @param {Object3D} object - 要切换的对象
     */
    toggleSelection(object) {
        this.selection.toggle(object);
        // 更新_selects以避免renderMetalness中的错误
        this._selects = Array.from(this.selection);
    }

    /**
     * 清空选择集
     */
    clearSelection() {
        // 恢复所有对象的原始发光
        for (const object of this._processedObjects) {
            this._setObjectHighlight(object, false);
        }

        this.selection.clear();
        // 更新_selects以避免renderMetalness中的错误
        this._selects = [];
        this._processedObjects.clear();
    }

    /**
     * 资源释放
     * @override
     */
    dispose() {
        this._originalLayers.clear();
        this._visibilityCache = new Map();
        this._originalEmissive = new Map();
        this._originalIntensity = new Map();
        this._processedObjects.clear();

        if (this.metalnessDetectionMaterial) {
            this.metalnessDetectionMaterial.dispose();
        }

        // 释放多渲染目标资源
        if (this.multiRenderTarget) {
            this.multiRenderTarget.dispose();
        }

        if (this.multiPassMaterial) {
            this.multiPassMaterial.dispose();
        }

        super.dispose();
    }
}

export { SelectiveSSRPass };
