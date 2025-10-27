/**
 * MRT G-Buffer Material Patcher
 * 
 * 通过onBeforeCompile注入MRT输出代码到现有材质
 * 实现一次渲染同时输出：正常画面 + G-Buffer + 对象ID
 * 
 * 性能优势：
 * - 只需渲染场景一次
 * - 不需要clone材质
 * - 不需要替换材质
 * - 对象ID通过userData传递，不需要逐对象设置uniform
 */

import { Color, Vector4 } from "three";

export class MRTGBufferMaterialPatcher {

    /**
     * 构造MRT G-Buffer材质补丁器
     * 
     * @param {ObjectIdManager} objectIdManager - 对象ID管理器
     */
    constructor(objectIdManager) {

        this.objectIdManager = objectIdManager;

        /**
         * 已注入的材质集合（避免重复注入）
         * @type {WeakSet<Material>}
         */
        this.patchedMaterials = new WeakSet();

        /**
         * 材质的原始onBeforeCompile（用于恢复）
         * @type {WeakMap<Material, Function>}
         */
        this.originalOnBeforeCompile = new WeakMap();

        /**
         * 是否启用调试模式
         * @type {boolean}
         */
        this.debug = false;

    }

    /**
     * 为场景中的所有材质注入MRT输出代码
     * 
     * @param {Scene} scene - Three.js场景
     * @param {Camera} camera - 相机（用于深度计算）
     * @returns {number} 注入的材质数量
     */
    patchScene(scene, camera) {

        let patchCount = 0;
        let totalMaterialCount = 0;
        let alreadyPatchedCount = 0;

        scene.traverse((object) => {

            if (object.isMesh && object.visible && object.material) {

                const materials = Array.isArray(object.material) ? object.material : [object.material];

                materials.forEach(material => {

                    totalMaterialCount++;

                    if (this.patchedMaterials.has(material)) {
                        alreadyPatchedCount++;
                    } else if (this.patchMaterial(material, object, camera)) {
                        patchCount++;
                    }

                });

            }

        });

        // 打印详细统计信息
        if (patchCount > 0) {
            console.log(`🔧 MRTGBufferMaterialPatcher: 新注入 ${patchCount} 个材质 (总计: ${totalMaterialCount}, 已存在: ${alreadyPatchedCount})`);
        } else if (alreadyPatchedCount > 0) {
            console.log(`🔧 MRTGBufferMaterialPatcher: 所有材质已注入 (总计: ${totalMaterialCount})`);
        } else if (totalMaterialCount === 0) {
            console.warn('⚠️ MRTGBufferMaterialPatcher: 场景中没有找到可见的网格材质');
        }

        return patchCount;

    }

    /**
     * 为单个材质注入MRT输出代码
     * 
     * @param {Material} material - 要注入的材质
     * @param {Object3D} object - 材质所属的对象
     * @param {Camera} camera - 相机
     * @returns {boolean} 是否成功注入
     */
    patchMaterial(material, object, camera) {

        // 跳过已注入的材质
        if (this.patchedMaterials.has(material)) {

            return false;

        }

        // 获取对象ID
        const objectId = this.objectIdManager ? this.objectIdManager.getObjectId(object) : 0;

        // 保存原始的onBeforeCompile
        if (material.onBeforeCompile && material.onBeforeCompile !== Function.prototype) {

            this.originalOnBeforeCompile.set(material, material.onBeforeCompile);

        }

        // 保存原始的customProgramCacheKey（如果存在）
        const originalCustomProgramCacheKey = material.customProgramCacheKey;

        // 创建新的onBeforeCompile
        const originalOnBeforeCompile = this.originalOnBeforeCompile.get(material);

        material.onBeforeCompile = (shader, renderer) => {

            // 先调用原始的onBeforeCompile（如果存在）
            if (originalOnBeforeCompile) {
                originalOnBeforeCompile(shader, renderer);
            }

            // 🔑 关键：检查当前渲染目标是否支持 MRT
            // 如果不是 MRT 目标，跳过注入（避免在 SelectiveSSRPass 的 beautyRenderTarget 中出错）
            const currentRenderTarget = renderer.getRenderTarget();
            const isMRTTarget = currentRenderTarget && currentRenderTarget.textures && currentRenderTarget.textures.length >= 5;

            if (!isMRTTarget) {
                // 不是 MRT 目标，跳过注入，使用原始 shader
                if (this.debug) {
                    console.log('⚠️ 当前渲染目标不是 MRT，跳过注入');
                }
                return;
            }

            // 注入对象ID uniform
            shader.uniforms.objectId = { value: objectId };
            shader.uniforms.cameraNear = { value: camera.near };
            shader.uniforms.cameraFar = { value: camera.far };

            // 检测是否是GLSL3
            const isGLSL3 = renderer.capabilities.isWebGL2;

            if (isGLSL3) {
                // ===== GLSL3 (WebGL2) 方案 =====
                // 参考 StandardMRTStencilMaterial.ts 的实现方案

                // 🔑 关键：设置 GLSL3 版本（必须在WebGL2环境下）
                shader.glslVersion = '300 es';

                // 步骤1：在 vertex shader 的 #include <common> 后添加 uniform 和 varying 声明
                shader.vertexShader = shader.vertexShader.replace(
                    '#include <common>',
                    /* glsl */`
#include <common>

uniform float cameraNear;
uniform float cameraFar;
varying vec3 vViewNormal;
varying float vLinearDepth;
`
                );

                // 步骤2：在vertex shader的fog_vertex之后添加计算代码
                shader.vertexShader = shader.vertexShader.replace(
                    '#include <fog_vertex>',
                    /* glsl */`
#include <fog_vertex>

// 计算视图空间法线
vViewNormal = normalize(normalMatrix * normal);

// 计算视图空间位置
vViewPosition = -mvPosition.xyz;

// 计算线性深度
float depth = -mvPosition.z;
vLinearDepth = (depth - cameraNear) / (cameraFar - cameraNear);
vLinearDepth = clamp(vLinearDepth, 0.0, 1.0);
`
                );

                // 步骤3：🔑 关键技巧 - 在整个fragment shader前面添加 #define 重定向 gl_FragColor
                // 这样Three.js内部所有的gl_FragColor都会被重定向到gLitColor（location 0）
                shader.fragmentShader = `
#define gl_FragColor gLitColor
${shader.fragmentShader}
`;

                // 步骤4：在 void main() { 前添加 MRT layout 声明
                shader.fragmentShader = shader.fragmentShader.replace(
                    'void main() {',
                    /* glsl */`
layout(location = 0) out vec4 gLitColor;
layout(location = 1) out vec4 gNormal;
layout(location = 2) out vec4 gDepth;
layout(location = 3) out vec4 gPosition;
layout(location = 4) out vec4 gObjectId;

varying vec3 vViewNormal;
varying float vLinearDepth;
uniform float objectId;

void main() {
`
                );

                // 步骤5：在dithering_fragment之后添加G-Buffer输出
                const beforeReplace = shader.fragmentShader;
                shader.fragmentShader = shader.fragmentShader.replace(
                    '#include <dithering_fragment>',
                    /* glsl */`
#include <dithering_fragment>

// 输出G-Buffer数据
gNormal = vec4(normalize(vViewNormal) * 0.5 + 0.5, 1.0);
gDepth = vec4(vec3(vLinearDepth), 1.0);
gPosition = vec4(vViewPosition, 1.0);

// 输出对象ID（归一化到0-1）
float normalizedObjectId = objectId / 255.0;
gObjectId = vec4(vec3(normalizedObjectId), 1.0);
`
                );

                // 检查替换是否成功
                if (beforeReplace === shader.fragmentShader) {
                    console.warn('⚠️ 警告：#include <dithering_fragment> 替换失败，尝试备用方案');
                    // 备用方案：在shader末尾添加（#include <tonemapping_fragment>之后）
                    shader.fragmentShader = shader.fragmentShader.replace(
                        '#include <tonemapping_fragment>',
                        /* glsl */`
#include <tonemapping_fragment>

// 输出G-Buffer数据
gNormal = vec4(normalize(vViewNormal) * 0.5 + 0.5, 1.0);
gDepth = vec4(vec3(vLinearDepth), 1.0);
gPosition = vec4(vViewPosition, 1.0);

// 输出对象ID（归一化到0-1）
float normalizedObjectId = objectId / 255.0;
gObjectId = vec4(vec3(normalizedObjectId), 1.0);
`
                    );
                }

            } else {
                // ===== GLSL1 (WebGL1) 方案 =====

                // 修改vertex shader
                shader.vertexShader = shader.vertexShader.replace(
                    '#include <common>',
                    /* glsl */`
#include <common>
uniform float cameraNear;
uniform float cameraFar;
varying vec3 vViewNormal;
varying float vLinearDepth;
`
                );

                shader.vertexShader = shader.vertexShader.replace(
                    '#include <fog_vertex>',
                    /* glsl */`
#include <fog_vertex>

// 计算视图空间法线
vViewNormal = normalize(normalMatrix * normal);

// 计算视图空间位置  
vViewPosition = -mvPosition.xyz;

// 计算线性深度
float depth = -mvPosition.z;
vLinearDepth = (depth - cameraNear) / (cameraFar - cameraNear);
vLinearDepth = clamp(vLinearDepth, 0.0, 1.0);
`
                );

                // Fragment shader - 使用gl_FragData
                shader.fragmentShader = shader.fragmentShader.replace(
                    '#include <common>',
                    /* glsl */`
#include <common>
varying vec3 vViewNormal;
varying float vLinearDepth;
uniform float objectId;

// MRT输出声明（GLSL1使用gl_FragData）
#define gLitColor gl_FragData[0]
#define gNormal gl_FragData[1]
#define gDepth gl_FragData[2]
#define gPosition gl_FragData[3]
#define gObjectId gl_FragData[4]
`
                );

                // 替换gl_FragColor为gLitColor
                shader.fragmentShader = shader.fragmentShader.replace(
                    /gl_FragColor/g,
                    'gLitColor'
                );

                // 在末尾添加G-Buffer输出
                shader.fragmentShader = shader.fragmentShader.replace(
                    /\}[\s]*$/,
                    /* glsl */`
	// 输出G-Buffer数据
	gNormal = vec4(normalize(vViewNormal) * 0.5 + 0.5, 1.0);
	gDepth = vec4(vec3(vLinearDepth), 1.0);
	gPosition = vec4(vViewPosition, 1.0);
	
	// 输出对象ID（归一化到0-1）
	float normalizedObjectId = objectId / 255.0;
	gObjectId = vec4(vec3(normalizedObjectId), 1.0);
}
`
                );

            }

            // 调试模式下打印详细信息
            if (this.debug) {
                console.log(`📝 已注入材质: ${material.name || material.type} (ObjectId: ${objectId})`);
                console.log('=== Modified Fragment Shader (first 500 chars) ===');
                console.log(shader.fragmentShader.substring(0, 500));
            }

        };

        // 修改customProgramCacheKey以确保每个对象ID使用不同的shader program
        material.customProgramCacheKey = function () {

            let key = originalCustomProgramCacheKey ? originalCustomProgramCacheKey.call(this) : '';
            return key + '_mrtGBuffer_' + objectId;

        };

        // 标记已注入
        this.patchedMaterials.add(material);

        // ⚡ 关键：标记材质需要重新编译shader
        // 这会触发onBeforeCompile在下一次渲染时执行
        material.needsUpdate = true;

        // 如果材质有program，清除它以强制重新编译
        if (material.program) {
            material.program = null;
        }

        return true;

    }

    /**
     * 恢复场景中所有材质的原始onBeforeCompile
     * 
     * @param {Scene} scene - Three.js场景
     * @returns {number} 恢复的材质数量
     */
    unpatchScene(scene) {

        let unpatchCount = 0;

        scene.traverse((object) => {

            if (object.isMesh && object.material) {

                const materials = Array.isArray(object.material) ? object.material : [object.material];

                materials.forEach(material => {

                    if (this.unpatchMaterial(material)) {

                        unpatchCount++;

                    }

                });

            }

        });

        if (this.debug && unpatchCount > 0) {

            console.log(`🔧 MRTGBufferMaterialPatcher: 已恢复${unpatchCount}个材质`);

        }

        return unpatchCount;

    }

    /**
     * 恢复单个材质
     * 
     * @param {Material} material - 要恢复的材质
     * @returns {boolean} 是否成功恢复
     */
    unpatchMaterial(material) {

        if (!this.patchedMaterials.has(material)) {

            return false;

        }

        // 恢复原始的onBeforeCompile
        const original = this.originalOnBeforeCompile.get(material);

        if (original) {

            material.onBeforeCompile = original;
            this.originalOnBeforeCompile.delete(material);

        } else {

            // 重置为默认
            material.onBeforeCompile = function () { };

        }

        // 恢复customProgramCacheKey
        delete material.customProgramCacheKey;

        // 移除标记
        this.patchedMaterials.delete(material);

        // 标记材质需要更新
        material.needsUpdate = true;

        return true;

    }

    /**
     * 清除所有注入
     */
    clear() {

        this.patchedMaterials = new WeakSet();
        this.originalOnBeforeCompile = new WeakMap();

    }

    /**
     * 设置调试模式
     * 
     * @param {boolean} enabled - 是否启用
     */
    setDebug(enabled) {

        this.debug = enabled;

    }

}

