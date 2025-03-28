varying vec2 vUv;

uniform sampler2D inputTexture;
uniform highp sampler2D depthTexture;
uniform sampler2D normalTexture; // optional, in case no gBufferTexture is used
uniform mat4 projectionMatrix;
uniform mat4 projectionMatrixInverse;
uniform mat4 cameraMatrixWorld;
uniform float radius;
uniform float phi;
uniform float lumaPhi;
uniform float depthPhi;
uniform float normalPhi;
uniform float roughnessPhi;
uniform float specularPhi;
uniform vec2 resolution;
uniform float sigmaSpace;  // 高斯空间标准差
uniform float sigmaRange;  // 高斯范围标准差

layout(location = 0) out vec4 gOutput0;

#if textureCount == 2
uniform sampler2D inputTexture2;
layout(location = 1) out vec4 gOutput1;
#endif

#include <common>
#include <gbuffer_packing>

#define luminance(a) dot(vec3(0.2125, 0.7154, 0.0721), a)

#if textureCount == 1
#define inputTexture2 inputTexture
#endif

Material mat;
vec3 normal;
float depth;

struct InputTexel {
  vec3 rgb;
  float a;
  float totalWeight;
  bool isSpecular;
};

// 极简直通版本 - 基本上只是复制输入
void main() {
  // 获取深度，只用于基本深度测试
  float depth = textureLod(depthTexture, vUv, 0.0).r;
  
  // 天空不处理
  if (depth == 1.0) {
    discard;
    return;
  }
  
  // 读取原始输入纹理 (通道1)
  vec4 origColor = textureLod(inputTexture, vUv, 0.0);
  
  // 极其简单的3x3方框滤波
  vec2 texelSize = 1.0 / resolution;
  vec3 result = origColor.rgb;
  float weight = 1.0;
  float totalWeight = 1.0;
  
  // 只在周围采样4个点，轻微模糊
  vec2 offsets[4];
  offsets[0] = vec2(texelSize.x, 0.0);
  offsets[1] = vec2(-texelSize.x, 0.0);
  offsets[2] = vec2(0.0, texelSize.y);
  offsets[3] = vec2(0.0, -texelSize.y);
  
  for (int i = 0; i < 4; i++) {
    vec2 uv = vUv + offsets[i];
    
    // 确保在纹理边界内
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
      continue;
    }
    
    // 读取相邻像素，并添加到结果中
    vec4 neighborColor = textureLod(inputTexture, uv, 0.0);
    float neighborDepth = textureLod(depthTexture, uv, 0.0).r;
    
    // 简单的深度测试，保持边界锐利
    if (abs(depth - neighborDepth) < 0.1) {
      result += neighborColor.rgb;
      totalWeight += 1.0;
    }
  }
  
  // 正确的混合
  if (totalWeight > 0.0) {
    result /= totalWeight;
  }
  
  // 输出结果，保留原始alpha
  gOutput0 = vec4(result, origColor.a);
  
  // 处理第二个通道（如果有）
  #if textureCount == 2
  // 读取原始输入纹理 (通道2)
  vec4 origColor2 = textureLod(inputTexture2, vUv, 0.0);
  vec3 result2 = origColor2.rgb;
  totalWeight = 1.0;
  
  for (int i = 0; i < 4; i++) {
    vec2 uv = vUv + offsets[i];
    
    // 确保在纹理边界内
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
      continue;
    }
    
    // 读取相邻像素，并添加到结果中
    vec4 neighborColor = textureLod(inputTexture2, uv, 0.0);
    float neighborDepth = textureLod(depthTexture, uv, 0.0).r;
    
    if (abs(depth - neighborDepth) < 0.1) {
      result2 += neighborColor.rgb;
      totalWeight += 1.0;
    }
  }
  
  if (totalWeight > 0.0) {
    result2 /= totalWeight;
  }
  
  gOutput1 = vec4(result2, origColor2.a);
  #endif
} 