import {
	Uniform,
	Vector2
} from "three";

import { DepthMaskMaterial } from "./DepthMaskMaterial.js";

/**
 * 多采样深度掩码材质
 *
 * 这个材质通过对周围像素进行采样来改善深度比较结果，
 * 减少锯齿和不规则图案。
 */
export class MultiSampleDepthMaskMaterial extends DepthMaskMaterial {

	/**
     * 构造一个新的多采样深度掩码材质
     */
	constructor() {

		super();

		// 更改材质名称
		this.name = "MultiSampleDepthMaskMaterial";

		// 添加多采样相关定义
		this.defines.USE_MULTISAMPLING = "";
		this.defines.SAMPLES = "9"; // 默认采样数量

		// 添加新的uniform
		this.uniforms.samplingRadius = new Uniform(2.0); // 采样半径
		this.uniforms.samplingThreshold = new Uniform(0.5); // 采样匹配阈值
		this.uniforms.resolution = new Uniform(new Vector2(1, 1)); // 屏幕分辨率

		// 更新着色器
		this.fragmentShader = this.generateFragmentShader();
		this.needsUpdate = true;

	}

	/**
     * 采样数量
     *
     * @type {Number}
     */
	get samplingCount() {

		return Number(this.defines.SAMPLES);

	}

	set samplingCount(value) {

		this.defines.SAMPLES = Math.max(1, Math.floor(value)).toString();
		this.needsUpdate = true;

	}

	/**
     * 采样半径
     *
     * @type {Number}
     */
	get samplingRadius() {

		return this.uniforms.samplingRadius.value;

	}

	set samplingRadius(value) {

		this.uniforms.samplingRadius.value = Math.max(0.1, value);

	}

	/**
     * 采样匹配阈值
     *
     * @type {Number}
     */
	get samplingThreshold() {

		return this.uniforms.samplingThreshold.value;

	}

	set samplingThreshold(value) {

		this.uniforms.samplingThreshold.value = Math.min(Math.max(0, value), 1);

	}

	/**
     * 设置分辨率
     *
     * @param {Number} width - 宽度
     * @param {Number} height - 高度
     */
	setResolution(width, height) {

		this.uniforms.resolution.value.set(width, height);

	}

	/**
     * 生成带有多采样功能的片元着色器
     *
     * @return {String} 新的片元着色器代码
     */
	generateFragmentShader() {

		// 加载原始着色器代码
		const originalShader = /* 从文件加载的原始着色器，此处需替换 */`
#include <common>
#include <packing>

#ifdef GL_FRAGMENT_PRECISION_HIGH
    uniform highp sampler2D depthBuffer0;
    uniform highp sampler2D depthBuffer1;
#else
    uniform mediump sampler2D depthBuffer0;
    uniform mediump sampler2D depthBuffer1;
#endif

uniform sampler2D inputBuffer;
uniform vec2 cameraNearFar;

float getViewZ(const in float depth) {
    #ifdef PERSPECTIVE_CAMERA
        return perspectiveDepthToViewZ(depth, cameraNearFar.x, cameraNearFar.y);
    #else
        return orthographicDepthToViewZ(depth, cameraNearFar.x, cameraNearFar.y);
    #endif
}

varying vec2 vUv;

void main() {
    vec2 depth;

    #if DEPTH_PACKING_0 == 3201
        depth.x = unpackRGBAToDepth(texture2D(depthBuffer0, vUv));
    #else
        depth.x = texture2D(depthBuffer0, vUv).r;
        #ifdef LOG_DEPTH
            float d = pow(2.0, depth.x * log2(cameraNearFar.y + 1.0)) - 1.0;
            float a = cameraNearFar.y / (cameraNearFar.y - cameraNearFar.x);
            float b = cameraNearFar.y * cameraNearFar.x / (cameraNearFar.x - cameraNearFar.y);
            depth.x = a + b / d;
        #endif
    #endif

    #if DEPTH_PACKING_1 == 3201
        depth.y = unpackRGBAToDepth(texture2D(depthBuffer1, vUv));
    #else
        depth.y = texture2D(depthBuffer1, vUv).r;
        #ifdef LOG_DEPTH
            float d = pow(2.0, depth.y * log2(cameraNearFar.y + 1.0)) - 1.0;
            float a = cameraNearFar.y / (cameraNearFar.y - cameraNearFar.x);
            float b = cameraNearFar.y * cameraNearFar.x / (cameraNearFar.x - cameraNearFar.y);
            depth.y = a + b / d;
        #endif
    #endif

    bool isMaxDepth = (depth.x == 1.0);

    #ifdef PERSPECTIVE_CAMERA
        // Linearize.
        depth.x = viewZToOrthographicDepth(getViewZ(depth.x), cameraNearFar.x, cameraNearFar.y);
        depth.y = viewZToOrthographicDepth(getViewZ(depth.y), cameraNearFar.x, cameraNearFar.y);
    #endif

    #if DEPTH_TEST_STRATEGY == 0
        // Decide based on depth test.
        bool keep = depthTest(depth.x, depth.y);
    #elif DEPTH_TEST_STRATEGY == 1
        // Always keep max depth.
        bool keep = isMaxDepth || depthTest(depth.x, depth.y);
    #else
        // Always discard max depth.
        bool keep = !isMaxDepth && depthTest(depth.x, depth.y);
    #endif

    if(keep) {
        gl_FragColor = texture2D(inputBuffer, vUv);
    } else {
        discard;
    }
}`;

		// 添加多采样代码
		const multiSamplingShader = `
#include <common>
#include <packing>

#ifdef GL_FRAGMENT_PRECISION_HIGH
    uniform highp sampler2D depthBuffer0;
    uniform highp sampler2D depthBuffer1;
#else
    uniform mediump sampler2D depthBuffer0;
    uniform mediump sampler2D depthBuffer1;
#endif

uniform sampler2D inputBuffer;
uniform vec2 cameraNearFar;
uniform float samplingRadius;
uniform float samplingThreshold;
uniform vec2 resolution;

float getViewZ(const in float depth) {
    #ifdef PERSPECTIVE_CAMERA
        return perspectiveDepthToViewZ(depth, cameraNearFar.x, cameraNearFar.y);
    #else
        return orthographicDepthToViewZ(depth, cameraNearFar.x, cameraNearFar.y);
    #endif
}

varying vec2 vUv;

#ifdef USE_MULTISAMPLING
    // 定义采样偏移数组
    vec2 offsets[9] = vec2[](
        vec2(-1, -1), vec2(0, -1), vec2(1, -1),
        vec2(-1,  0), vec2(0,  0), vec2(1,  0),
        vec2(-1,  1), vec2(0,  1), vec2(1,  1)
    );
    
    // 获取特定位置的深度值
    vec2 getDepthAt(vec2 uv) {
        vec2 depth;
        
        #if DEPTH_PACKING_0 == 3201
            depth.x = unpackRGBAToDepth(texture2D(depthBuffer0, uv));
        #else
            depth.x = texture2D(depthBuffer0, uv).r;
            #ifdef LOG_DEPTH
                float d = pow(2.0, depth.x * log2(cameraNearFar.y + 1.0)) - 1.0;
                float a = cameraNearFar.y / (cameraNearFar.y - cameraNearFar.x);
                float b = cameraNearFar.y * cameraNearFar.x / (cameraNearFar.x - cameraNearFar.y);
                depth.x = a + b / d;
            #endif
        #endif
        
        #if DEPTH_PACKING_1 == 3201
            depth.y = unpackRGBAToDepth(texture2D(depthBuffer1, uv));
        #else
            depth.y = texture2D(depthBuffer1, uv).r;
            #ifdef LOG_DEPTH
                float d = pow(2.0, depth.y * log2(cameraNearFar.y + 1.0)) - 1.0;
                float a = cameraNearFar.y / (cameraNearFar.y - cameraNearFar.x);
                float b = cameraNearFar.y * cameraNearFar.x / (cameraNearFar.x - cameraNearFar.y);
                depth.y = a + b / d;
            #endif
        #endif
        
        #ifdef PERSPECTIVE_CAMERA
            // Linearize.
            depth.x = viewZToOrthographicDepth(getViewZ(depth.x), cameraNearFar.x, cameraNearFar.y);
            depth.y = viewZToOrthographicDepth(getViewZ(depth.y), cameraNearFar.x, cameraNearFar.y);
        #endif
        
        return depth;
    }
    
    // 多采样深度比较
    float multiSampleDepthComparison(vec2 uv) {
        float matchCount = 0.0;
        float pixelSize = samplingRadius / max(resolution.x, resolution.y);
        
        for(int i = 0; i < SAMPLES; i++) {
            int idx = i % 9; // 循环使用偏移数组
            vec2 offset = offsets[idx] * pixelSize;
            vec2 sampleUv = uv + offset;
            
            // 确保采样点在有效范围内
            if(sampleUv.x >= 0.0 && sampleUv.x <= 1.0 && sampleUv.y >= 0.0 && sampleUv.y <= 1.0) {
                // 获取深度值
                vec2 sampleDepth = getDepthAt(sampleUv);
                
                bool isMaxDepth = (sampleDepth.x == 1.0);
                
                // 深度比较
                bool keep;
                
                #if DEPTH_TEST_STRATEGY == 0
                    // Decide based on depth test.
                    keep = depthTest(sampleDepth.x, sampleDepth.y);
                #elif DEPTH_TEST_STRATEGY == 1
                    // Always keep max depth.
                    keep = isMaxDepth || depthTest(sampleDepth.x, sampleDepth.y);
                #else
                    // Always discard max depth.
                    keep = !isMaxDepth && depthTest(sampleDepth.x, sampleDepth.y);
                #endif
                
                matchCount += keep ? 1.0 : 0.0;
            }
        }
        
        // 返回匹配率
        return matchCount / float(SAMPLES);
    }
#endif

void main() {
#ifdef USE_MULTISAMPLING
    // 使用多采样
    float matchRate = multiSampleDepthComparison(vUv);
    
    // 应用平滑过渡而非二值化结果
    if(matchRate >= samplingThreshold) {
        gl_FragColor = texture2D(inputBuffer, vUv);
    } else {
        discard;
    }
#else
    // 原始单采样逻辑
    vec2 depth;

    #if DEPTH_PACKING_0 == 3201
        depth.x = unpackRGBAToDepth(texture2D(depthBuffer0, vUv));
    #else
        depth.x = texture2D(depthBuffer0, vUv).r;
        #ifdef LOG_DEPTH
            float d = pow(2.0, depth.x * log2(cameraNearFar.y + 1.0)) - 1.0;
            float a = cameraNearFar.y / (cameraNearFar.y - cameraNearFar.x);
            float b = cameraNearFar.y * cameraNearFar.x / (cameraNearFar.x - cameraNearFar.y);
            depth.x = a + b / d;
        #endif
    #endif

    #if DEPTH_PACKING_1 == 3201
        depth.y = unpackRGBAToDepth(texture2D(depthBuffer1, vUv));
    #else
        depth.y = texture2D(depthBuffer1, vUv).r;
        #ifdef LOG_DEPTH
            float d = pow(2.0, depth.y * log2(cameraNearFar.y + 1.0)) - 1.0;
            float a = cameraNearFar.y / (cameraNearFar.y - cameraNearFar.x);
            float b = cameraNearFar.y * cameraNearFar.x / (cameraNearFar.x - cameraNearFar.y);
            depth.y = a + b / d;
        #endif
    #endif

    bool isMaxDepth = (depth.x == 1.0);

    #ifdef PERSPECTIVE_CAMERA
        // Linearize.
        depth.x = viewZToOrthographicDepth(getViewZ(depth.x), cameraNearFar.x, cameraNearFar.y);
        depth.y = viewZToOrthographicDepth(getViewZ(depth.y), cameraNearFar.x, cameraNearFar.y);
    #endif

    #if DEPTH_TEST_STRATEGY == 0
        // Decide based on depth test.
        bool keep = depthTest(depth.x, depth.y);
    #elif DEPTH_TEST_STRATEGY == 1
        // Always keep max depth.
        bool keep = isMaxDepth || depthTest(depth.x, depth.y);
    #else
        // Always discard max depth.
        bool keep = !isMaxDepth && depthTest(depth.x, depth.y);
    #endif

    if(keep) {
        gl_FragColor = texture2D(inputBuffer, vUv);
    } else {
        discard;
    }
#endif
}`;

		return multiSamplingShader;

	}

}
