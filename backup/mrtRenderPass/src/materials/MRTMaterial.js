import { RawShaderMaterial, Uniform, RGBADepthPacking, Vector2 } from "three";
import { log } from "../utils/PerformanceLogger.js";
/**
 * 一个用于MRT渲染的材质，同时输出颜色和深度信息。
 * 此材质在WebGL2环境下使用，配合WebGLMultipleRenderTargets渲染目标使用。
 */
export class MRTMaterial extends RawShaderMaterial {

  /**
   * 构造一个新的MRT材质。
   */
  constructor() {
    // WebGL2 顶点着色器（不含#version指令，由Three.js自动添加）
    const webgl2VertexShader = `precision highp float;
precision highp int;

uniform mat4 modelMatrix;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;

in vec3 position;
in vec2 uv;

out vec2 vUv;
out vec4 vViewPosition;

void main() {
  vUv = uv;
  
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vec4 viewPosition = viewMatrix * worldPosition;
  vViewPosition = viewPosition;
  gl_Position = projectionMatrix * viewPosition;
}`;

    // WebGL1 顶点着色器
    const webgl1VertexShader = `precision highp float;
precision highp int;

uniform mat4 modelMatrix;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;

attribute vec3 position;
attribute vec2 uv;

varying vec2 vUv;
varying vec4 vViewPosition;

void main() {
  vUv = uv;
  
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vec4 viewPosition = viewMatrix * worldPosition;
  vViewPosition = viewPosition;
  gl_Position = projectionMatrix * viewPosition;
}`;

    // WebGL2 片元着色器（不含#version指令，由Three.js自动添加）
    const webgl2FragmentShader = `precision highp float;
precision highp int;

uniform sampler2D inputBuffer;

in vec2 vUv;
in vec4 vViewPosition;

// WebGL2需要明确定义输出变量
layout(location = 0) out vec4 fragColor; // 颜色输出
layout(location = 1) out vec4 fragDepth; // 深度输出

// 深度打包函数 (与DepthPass使用相同的打包方式)
vec4 packDepthToRGBA(float v) {
  vec4 r = vec4(1.0, 255.0, 65025.0, 16581375.0) * v;
  r = fract(r);
  r -= r.yzww * vec4(1.0/255.0, 1.0/255.0, 1.0/255.0, 0.0);
  return r;
}

void main() {
  // 获取颜色
  vec4 color = texture(inputBuffer, vUv);
  
  // 深度计算
  float linearDepth = length(vViewPosition.xyz);
  float perspectiveDepth = vViewPosition.z;
  float normalizedDepth = (perspectiveDepth + 1.0) * 0.5;
  
  // 添加调试视觉标记 - 用红色条纹标记图像，确认shader被正确执行
  if (int(gl_FragCoord.x) % 32 < 16) {
    color.r = 1.0; // 添加红色条纹
  }
  
  // 输出颜色到第一个缓冲区
  fragColor = color;
  
  // 输出深度到第二个缓冲区
  fragDepth = packDepthToRGBA(normalizedDepth);
}`;

    // WebGL1 片元着色器
    const webgl1FragmentShader = `precision highp float;
precision highp int;

uniform sampler2D inputBuffer;

varying vec2 vUv;
varying vec4 vViewPosition;

// 深度打包函数 (与DepthPass使用相同的打包方式)
vec4 packDepthToRGBA(float v) {
  vec4 r = vec4(1.0, 255.0, 65025.0, 16581375.0) * v;
  r = fract(r);
  r -= r.yzww * vec4(1.0/255.0, 1.0/255.0, 1.0/255.0, 0.0);
  return r;
}

void main() {
  // 获取颜色
  vec4 color = texture2D(inputBuffer, vUv);
  
  // 深度计算
  float linearDepth = length(vViewPosition.xyz);
  float perspectiveDepth = vViewPosition.z;
  float normalizedDepth = (perspectiveDepth + 1.0) * 0.5;
  
  // 添加调试视觉标记 - 用蓝色条纹标记图像，确认shader被正确执行
  if (int(gl_FragCoord.x) % 32 < 16) {
    color.b = 1.0; // 添加蓝色条纹，与WebGL2不同颜色以区分
  }
  
  // WebGL1只支持单一输出
  gl_FragColor = color;
}`;

    // 为WebGL2创建材质参数（默认使用WebGL1）
    const materialParams = {
      type: "MRTMaterial",
      uniforms: {
        inputBuffer: new Uniform(null),
        resolution: new Uniform(new Vector2(1, 1))
      },
      vertexShader: webgl1VertexShader,
      fragmentShader: webgl1FragmentShader
    };

    // 首先调用super，然后才能使用this
    super(materialParams);

    // 在super调用后保存着色器变体和状态
    this._webgl1VertexShader = webgl1VertexShader;
    this._webgl1FragmentShader = webgl1FragmentShader;
    this._webgl2VertexShader = webgl2VertexShader;
    this._webgl2FragmentShader = webgl2FragmentShader;

    // 保存当前WebGL版本状态
    this.isWebGL2 = false;

    // 不再需要onBeforeCompile回调来手动添加#version指令
    this.onBeforeCompile = (shader, renderer) => {
      console.log("MRTMaterial: 着色器编译前处理");
      // 记录最终的着色器代码，帮助调试
      console.log("顶点着色器前10行:", shader.vertexShader.split('\n').slice(0, 10).join('\n'));
      console.log("片元着色器前10行:", shader.fragmentShader.split('\n').slice(0, 10).join('\n'));
    };
  }

  /**
   * 根据WebGL上下文设置正确的着色器模式
   * @param {boolean} isWebGL2 是否为WebGL2上下文
   */
  updateShaderMode(isWebGL2) {
    if (this.isWebGL2 !== isWebGL2) {
      this.isWebGL2 = isWebGL2;

      if (isWebGL2) {
        console.log("MRTMaterial: 检测到WebGL2环境，启用WebGL2着色器特性");
        this.vertexShader = this._webgl2VertexShader;
        this.fragmentShader = this._webgl2FragmentShader;
        // 设置GLSL版本为GLSL3（WebGL2）
        this.glslVersion = "300 es"; // 正确的GLSL 3.0版本标识
      } else {
        console.log("MRTMaterial: 检测到WebGL1环境，使用兼容模式");
        this.vertexShader = this._webgl1VertexShader;
        this.fragmentShader = this._webgl1FragmentShader;
        // WebGL1没有版本标识
        this.glslVersion = null;
      }

      // 每次更改WebGL模式后强制更新着色器
      this.needsUpdate = true;
    }
  }

  /**
   * 设置输入缓冲区纹理。
   *
   * @param {Texture} value - 输入缓冲区纹理。
   */
  setInputBuffer(value) {
    if (value) {
      // 尝试多种方式获取正确的纹理尺寸
      let width = value.width;
      let height = value.height;

      // 如果纹理本身没有尺寸属性，尝试从纹理的renderTarget获取
      if (!width || !height || width === 0 || height === 0) {
        if (value.renderTarget && value.renderTarget.width && value.renderTarget.height) {
          width = value.renderTarget.width;
          height = value.renderTarget.height;
          console.log(`MRTMaterial: 从renderTarget获取纹理尺寸: ${width}x${height}`);
        } else if (value.__webglTexture) {
          // 如果是Three.js内部纹理，可能有内部尺寸
          console.log(`MRTMaterial: 纹理存在WebGL纹理对象，但无法读取其尺寸`);
        }
      }

      // 最后的备用方案：使用默认尺寸
      if (!width || !height || width === 0 || height === 0) {
        width = 1920;
        height = 1080;
        console.log(`MRTMaterial: 无法获取纹理尺寸，使用默认值: ${width}x${height}`);
      }

      console.log(`MRTMaterial: 设置输入缓冲区纹理ID: ${value.id || '未知'}, 尺寸: ${width}x${height}`);

      // 验证纹理是否有效
      if (width === 'undefined' || height === 'undefined') {
        console.warn('MRTMaterial: 纹理尺寸无效，可能导致渲染问题');
      }

      // 手动设置纹理尺寸属性
      value.width = width;
      value.height = height;

      // 更新分辨率 uniform
      this.uniforms.resolution.value.set(width, height);

      // 在复制模式下，确保材质的片元着色器只使用单个输出
      if (this.isWebGL2 && this.uniforms.inputBuffer.value === null) {
        // 第一次设置输入缓冲区时，如果使用的是复制着色器，则只需要输出颜色，不需要输出深度
        console.log("MRTMaterial: 检测到复制模式，使用单输出着色器");

        // 修改片元着色器中的输出，在复制模式下仅输出颜色到fragColor
        const simpleOutputShader = this._webgl2FragmentShader.replace(
          /layout\(location = 1\) out vec4 fragDepth;/,
          '// 在复制模式下禁用深度输出\n// layout(location = 1) out vec4 fragDepth;'
        ).replace(
          /fragDepth = packDepthToRGBA\(normalizedDepth\);/,
          '// 在复制模式下禁用深度输出\n// fragDepth = packDepthToRGBA(normalizedDepth);'
        );

        this.fragmentShader = simpleOutputShader;
        this.needsUpdate = true;
      }
    } else {
      console.warn("MRTMaterial: 尝试设置null输入缓冲区");
    }
    this.uniforms.inputBuffer.value = value;
  }

  /**
   * 确保着色器已更新并准备好渲染
   */
  ensureShaderReady() {
    if (this.needsUpdate) {
      console.log(`MRTMaterial: 着色器需要更新，WebGL2=${this.isWebGL2}`);
      this.needsUpdate = false; // 设置为false才会真正更新着色器
      return false; // 着色器需要更新
    }
    return true; // 着色器已准备好
  }

  /**
   * 为复制操作使用简化的着色器
   */
  useCopyMode() {
    if (this.isWebGL2) {
      console.log("MRTMaterial: 切换到WebGL2复制模式");

      // 禁用颜色写入，避免WebGL警告
      // 这告诉WebGL在渲染时禁用所有颜色组件的写入
      // 参考：https://stackoverflow.com/questions/57486102/three-js-shader-without-fragment-color-not-working-in-chrome
      this.colorWrite = true;

      // 在WebGL2中，需要修改片元着色器以仅输出到第一个附件
      const copyFragmentShader = `precision highp float;
precision highp int;

uniform sampler2D inputBuffer;

in vec2 vUv;
in vec4 vViewPosition;

// 在复制模式下，只输出颜色
layout(location = 0) out vec4 fragColor; // 颜色输出
// layout(location = 1) 输出在复制模式下被禁用

void main() {
    // 获取颜色
    vec4 color = texture(inputBuffer, vUv);
    
    // 简单的视觉调试标记
    if (int(gl_FragCoord.x) % 64 < 32) {
        color.g = 0.8; // 绿色调试标记，表示这是复制模式着色器
    }
    
    // 只输出到第一个附件
    fragColor = color;
}`;

      this.fragmentShader = copyFragmentShader;
      this.needsUpdate = true;
    } else {
      console.log("MRTMaterial: 切换到WebGL1复制模式");

      // 同样禁用颜色写入
      this.colorWrite = true;

      // WebGL1只有一个输出，不需要特殊处理
      this.fragmentShader = this._webgl1FragmentShader;
      this.needsUpdate = true;
    }
  }

  /**
   * 切换回正常的MRT模式
   */
  useNormalMode() {
    // 恢复颜色写入
    this.colorWrite = true;

    if (this.isWebGL2) {
      console.log("MRTMaterial: 切换回WebGL2正常模式");
      this.fragmentShader = this._webgl2FragmentShader;
      this.needsUpdate = true;
    } else {
      console.log("MRTMaterial: 切换回WebGL1正常模式");
      this.fragmentShader = this._webgl1FragmentShader;
      this.needsUpdate = true;
    }
  }
} 