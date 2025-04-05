import { SSRPass } from './SSRPass.js';
import { Selection } from '../../../core/Selection.js';
import {
    NoBlending,
    NormalBlending,
    ShaderMaterial,
    Color,
    Uniform,
    FrontSide,
    Vector2,
    ShaderLib,
    UniformsUtils
} from 'three';

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
        this.metalnessThreshold = options.metalnessThreshold !== undefined ? options.metalnessThreshold : 0.5;

        // 创建用于渲染金属度的材质
        this._createMetalnessDetectionMaterial();

        // 修改SSR着色器以支持像素级金属度判断
        if (this.usePixelMetalnessThreshold) {
            this._modifySSRShader();
        }

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

        // 添加金属度相关uniform
        this.ssrMaterial.uniforms.tMetalness = { value: null };
        this.ssrMaterial.uniforms.metalnessThreshold = { value: this.metalnessThreshold };
        this.ssrMaterial.uniforms.usePixelMetalnessThreshold = { value: this.usePixelMetalnessThreshold };

        // 获取原始fragment shader代码
        const originalFragmentShader = this.ssrMaterial.fragmentShader;

        // 添加金属度uniform声明
        let modifiedShader = originalFragmentShader.replace(
            'uniform sampler2D tNormal;',
            'uniform sampler2D tNormal;\nuniform float metalnessThreshold;\nuniform bool usePixelMetalnessThreshold;'
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
        this.ssrMaterial.fragmentShader = modifiedShader;
        this.ssrMaterial.needsUpdate = true;
    }

    /**
     * 更新金属度阈值
     * @param {Number} value - 新的金属度阈值
     */
    setMetalnessThreshold(value) {
        this.metalnessThreshold = value;

        // 更新shader中的阈值
        if (this.ssrMaterial && this.ssrMaterial.uniforms.metalnessThreshold) {
            this.ssrMaterial.uniforms.metalnessThreshold.value = value;
        }

        if (this.metalnessDetectionMaterial) {
            this.metalnessDetectionMaterial.uniforms.metalnessThreshold.value = value;
        }

        // 重新检测场景中的对象（对象级检测）
        if (this.usePixelMetalnessThreshold) {
            this.updateSelectionBasedOnMetalness();
        }
    }

    /**
     * 设置是否使用像素级金属度判断
     * @param {Boolean} value - 是否启用像素级判断
     */
    setUsePixelMetalnessThreshold(value) {
        this.usePixelMetalnessThreshold = value;

        // 更新shader中的标志
        if (this.ssrMaterial && this.ssrMaterial.uniforms.usePixelMetalnessThreshold) {
            this.ssrMaterial.uniforms.usePixelMetalnessThreshold.value = value;
        }

        // 如果禁用像素级判断，但启用对象级判断，更新选择
        if (!value && this.usePixelMetalnessThreshold) {
            this.updateSelectionBasedOnMetalness();
        }
    }

    /**
     * 根据金属度更新对象选择（对象级选择模式）
     */
    updateSelectionBasedOnMetalness() {
        if (!this.scene) return;

        // 清除当前选择
        this.selection.clear();
        this._processedObjects.clear();

        // 遍历场景中的所有对象
        this.scene.traverse((object) => {
            if (object.isMesh && object.material) {
                // 检查对象的金属度
                const metalness = this._getObjectMetalness(object);

                // 如果金属度超过阈值，则添加到选择中
                if (metalness >= this.metalnessThreshold) {
                    this.selection.add(object);
                    this._processedObjects.add(object);

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
     * 覆盖原始渲染方法，添加选择性渲染逻辑
     * @override
     */
    render(renderer, writeBuffer /*, readBuffer, deltaTime, maskActive */) {
        // 如果启用了对象级金属度阈值检测，且未使用像素级判断
        if (this.usePixelMetalnessThreshold) {
            this.updateSelectionBasedOnMetalness();
        }

        // 在渲染前准备选择性渲染（仅在使用对象级选择时需要）
        if (!this.usePixelMetalnessThreshold) {
            this._prepareSelectionBeforeRender(this.scene);
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

        // render normals
        this.renderOverride(renderer, this.normalMaterial, this.normalRenderTarget, 0, 0);

        // 渲染金属度 - 这对像素级判断很重要
        // this.renderMetalness(renderer, this.metalnessOnMaterial, this.metalnessRenderTarget, 0, 0);

        // 设置SSR材质的金属度相关参数
        if (this.usePixelMetalnessThreshold) {
            this.ssrMaterial.uniforms['tMetalness'].value = this.metalnessRenderTarget.texture;
            this.ssrMaterial.uniforms['metalnessThreshold'].value = this.metalnessThreshold;
            this.ssrMaterial.uniforms['usePixelMetalnessThreshold'].value = true;
        } else {
            // 如果不使用像素级判断，禁用shader中的判断逻辑
            this.ssrMaterial.uniforms['usePixelMetalnessThreshold'].value = false;
        }

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
                this.copyMaterial.uniforms['tDiffuse'].value = this.normalRenderTarget.texture;
                this.copyMaterial.blending = NoBlending;
                this.renderPass(renderer, this.copyMaterial, this.renderToScreen ? null : writeBuffer);
                break;
            case SSRPass.OUTPUT.Metalness:
                this.copyMaterial.uniforms['tDiffuse'].value = this.metalnessRenderTarget.texture;
                this.copyMaterial.blending = NoBlending;
                this.renderPass(renderer, this.copyMaterial, this.renderToScreen ? null : writeBuffer);
                break;
            default:
                console.warn('THREE.SSRPass: Unknown output type.');
        }

        // 在渲染后恢复对象的原始状态（仅在使用对象级选择时需要）
        if (!this.usePixelMetalnessThreshold) {
            this._restoreSelectionAfterRender();
        }
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

        // 如果使用像素级金属度判断，使用标准方法处理
        if (this.usePixelMetalnessThreshold) {
            // 确保scene存在，避免在super.renderMetalness中出错
            if (!this.scene) {
                console.warn("SelectiveSSRPass: 场景未设置，无法渲染金属度");
                return;
            }

            try {
                super.renderMetalness(renderer, overrideMaterial, renderTarget, clearColor, clearAlpha);
            } catch (error) {
                console.error("SelectiveSSRPass: renderMetalness出错", error);
            }
            return;
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

        // // 遍历场景，为选中的对象应用金属度材质
        // this.scene.traverseVisible((child) => {
        //     if (child.isMesh) {
        //         // 保存原始信息
        //         materialCache.set(child, child.material);
        //         visibilityCache.set(child, child.visible);

        //         // 根据选择确定使用哪种金属度材质
        //         const isSelected = Array.isArray(this._selects) && this._selects.includes(child);
        //         child.material = isSelected ? this.metalnessOnMaterial : this.metalnessOffMaterial;
        //     }
        // });

        // 渲染金属度
        // renderer.render(this.scene, this.camera);

        // // 恢复场景状态
        // this.scene.traverseVisible((child) => {
        //     if (child.isMesh && materialCache.has(child)) {
        //         child.material = materialCache.get(child);
        //         child.visible = visibilityCache.get(child);
        //     }
        // });

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
        for (const [object, mask] of this._originalLayers) {
            object.layers.mask = mask;
            object.visible = this._visibilityCache.get(object);
        }
    }

    /**
     * 设置场景引用，用于自动更新选择
     * @param {Scene} scene - 场景对象
     */
    setScene(scene) {
        this.scene = scene;
        if (this.usePixelMetalnessThreshold) {
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
     * 覆盖SSRPass的renderMetalness方法，考虑选择的对象
     */
    renderMetalness(renderer, overrideMaterial, renderTarget, clearColor, clearAlpha) {
        // 确保_selects始终存在，防止undefined错误
        if (!this._selects) {
            this._selects = Array.from(this.selection);
        }

        // 如果使用像素级金属度判断，使用标准方法处理
        if (this.usePixelMetalnessThreshold) {
            // 确保scene存在，避免在super.renderMetalness中出错
            if (!this.scene) {
                console.warn("SelectiveSSRPass: 场景未设置，无法渲染金属度");
                return;
            }

            try {
                super.renderMetalness(renderer, overrideMaterial, renderTarget, clearColor, clearAlpha);
            } catch (error) {
                console.error("SelectiveSSRPass: renderMetalness出错", error);
            }
            return;
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

        // 遍历场景，为选中的对象应用金属度材质
        this.scene.traverseVisible((child) => {
            if (child.isMesh) {
                // 保存原始信息
                materialCache.set(child, child.material);
                visibilityCache.set(child, child.visible);

                // 根据选择确定使用哪种金属度材质
                const isSelected = Array.isArray(this._selects) && this._selects.includes(child);
                child.material = isSelected ? this.metalnessOnMaterial : this.metalnessOffMaterial;
            }
        });

        // 渲染金属度
        // renderer.render(this.scene, this.camera);

        // 恢复场景状态
        this.scene.traverseVisible((child) => {
            if (child.isMesh && materialCache.has(child)) {
                child.material = materialCache.get(child);
                child.visible = visibilityCache.get(child);
            }
        });

        // 恢复渲染器状态
        renderer.setClearColor(this.originalClearColor, originalClearAlpha);
        renderer.autoClear = originalAutoClear;
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

        super.dispose();
    }
}

export { SelectiveSSRPass }; 