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

// 定义高斯核 - 计算像素间空间距离的权重
float gaussianWeight(float distanceSquared, float sigma) {
  return exp(-distanceSquared / (2.0 * sigma * sigma));
}

// 计算两个颜色的平方距离
float colorDistanceSquared(vec3 a, vec3 b) {
  vec3 diff = a - b;
  return dot(diff, diff);
}

// 进行真正的高斯双边滤波
void main() {
  // 获取深度和法线信息
  depth = textureLod(depthTexture, vUv, 0.0).r;
  
  // 天空不处理
  if (depth == 1.0) {
    discard;
    return;
  }

  // 获取法线信息
  #ifdef GBUFFER_TEXTURE
    mat = getMaterial(gBufferTexture, vUv);
    normal = mat.normal;
  #else
    vec3 normalTexel = textureLod(normalTexture, vUv, 0.0).xyz;
    normal = unpackNormal(normalTexel.b);
  #endif
  
  // 读取原始输入纹理 (通道1)
  vec4 origColor = textureLod(inputTexture, vUv, 0.0);
  
  // 高斯双边滤波
  vec2 texelSize = 1.0 / resolution;
  vec3 result = vec3(0.0);
  float totalWeight = 0.0;
  
  // 使用较大的采样半径（但不会太大，减少漏光）
  int kernelRadius = int(radius);
  
  // 限制最大半径为5，防止过度模糊
  kernelRadius = min(kernelRadius, 5);
  
  // 防止数值过小导致的无效滤波
  float effectiveSigmaSpace = max(sigmaSpace, 0.5);
  float effectiveSigmaRange = max(sigmaRange, 0.01);
  
  for (int x = -kernelRadius; x <= kernelRadius; x++) {
    for (int y = -kernelRadius; y <= kernelRadius; y++) {
      vec2 offset = vec2(float(x), float(y));
      vec2 uv = vUv + offset * texelSize;
      
      // 确保在纹理边界内
      if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
        continue;
      }
      
      // 读取相邻像素
      vec4 neighborColor = textureLod(inputTexture, uv, 0.0);
      float neighborDepth = textureLod(depthTexture, uv, 0.0).r;
      
      // 获取邻居法线
      vec3 neighborNormal;
      #ifdef GBUFFER_TEXTURE
        Material neighborMat = getMaterial(gBufferTexture, uv);
        neighborNormal = neighborMat.normal;
      #else
        vec3 neighborNormalTexel = textureLod(normalTexture, uv, 0.0).xyz;
        neighborNormal = unpackNormal(neighborNormalTexel.b);
      #endif
      
      // 1. 空间权重（高斯）
      float distSquared = dot(offset, offset);
      float spatialWeight = gaussianWeight(distSquared, effectiveSigmaSpace);
      
      // 2. 范围权重（颜色差异）
      float colorDist = colorDistanceSquared(origColor.rgb, neighborColor.rgb);
      float rangeWeight = gaussianWeight(colorDist, effectiveSigmaRange);
      
      // 3. 深度权重
      float depthDiff = abs(depth - neighborDepth);
      float depthWeight = depthDiff < 0.1 ? 1.0 : 0.0; // 硬截断，防止跨边界模糊
      
      // 4. 法线权重
      float normalDiff = 1.0 - max(0.0, dot(normal, neighborNormal));
      float normalWeight = normalDiff < 0.3 ? 1.0 : 0.0; // 硬截断，保持边缘
      
      // 合并所有权重
      float weight = spatialWeight * rangeWeight * depthWeight * normalWeight;
      
      // 丢弃过小的权重
      if (weight < 0.001) continue;
      
      result += neighborColor.rgb * weight;
      totalWeight += weight;
    }
  }
  
  // 归一化
  if (totalWeight > 0.0) {
    result /= totalWeight;
  } else {
    // 如果没有有效的样本（可能是孤立的边缘点），保留原始颜色
    result = origColor.rgb;
  }
  
  // 锐化处理 - 提高边缘细节
  vec3 sharpened = origColor.rgb + (origColor.rgb - result) * 0.3;
  
  // 混合锐化和模糊结果 - 在平面区域使用模糊，边缘使用锐化
  float edgeFactor = length(fwidth(normal)) * 10.0; // 检测边缘
  vec3 finalColor = mix(result, sharpened, clamp(edgeFactor, 0.0, 0.5));
  
  // 对结果进行HDR权重调整，防止过亮区域产生噪点
  float lum = luminance(finalColor);
  if (lum > 1.0) {
    finalColor *= 1.0 / (1.0 + lum * 0.5);
  }
  
  // 输出结果，保留原始alpha
  gOutput0 = vec4(finalColor, origColor.a);
  
  // 处理第二个通道（如果有）- 通常是镜面反射
  #if textureCount == 2
  // 读取原始输入纹理 (通道2)
  vec4 origColor2 = textureLod(inputTexture2, vUv, 0.0);
  vec3 result2 = vec3(0.0);
  totalWeight = 0.0;
  
  for (int x = -kernelRadius; x <= kernelRadius; x++) {
    for (int y = -kernelRadius; y <= kernelRadius; y++) {
      vec2 offset = vec2(float(x), float(y));
      vec2 uv = vUv + offset * texelSize;
      
      // 确保在纹理边界内
      if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
        continue;
      }
      
      // 读取相邻像素
      vec4 neighborColor = textureLod(inputTexture2, uv, 0.0);
      float neighborDepth = textureLod(depthTexture, uv, 0.0).r;
      
      // 获取邻居法线
      vec3 neighborNormal;
      #ifdef GBUFFER_TEXTURE
        Material neighborMat = getMaterial(gBufferTexture, uv);
        neighborNormal = neighborMat.normal;
      #else
        vec3 neighborNormalTexel = textureLod(normalTexture, uv, 0.0).xyz;
        neighborNormal = unpackNormal(neighborNormalTexel.b);
      #endif
      
      // 1. 空间权重（高斯）
      float distSquared = dot(offset, offset);
      float spatialWeight = gaussianWeight(distSquared, effectiveSigmaSpace);
      
      // 2. 范围权重（颜色差异）- 对镜面反射使用更严格的范围权重
      float colorDist = colorDistanceSquared(origColor2.rgb, neighborColor.rgb);
      float rangeWeight = gaussianWeight(colorDist, effectiveSigmaRange * 0.5); // 更严格的范围
      
      // 3. 深度权重
      float depthDiff = abs(depth - neighborDepth);
      float depthWeight = depthDiff < 0.05 ? 1.0 : 0.0; // 更严格的深度限制
      
      // 4. 法线权重
      float normalDiff = 1.0 - max(0.0, dot(normal, neighborNormal));
      float normalWeight = normalDiff < 0.2 ? 1.0 : 0.0; // 更严格的法线限制
      
      // 合并所有权重
      float weight = spatialWeight * rangeWeight * depthWeight * normalWeight;
      
      // 丢弃过小的权重
      if (weight < 0.001) continue;
      
      result2 += neighborColor.rgb * weight;
      totalWeight += weight;
    }
  }
  
  // 归一化
  if (totalWeight > 0.0) {
    result2 /= totalWeight;
  } else {
    // 如果没有有效的样本（可能是孤立的边缘点），保留原始颜色
    result2 = origColor2.rgb;
  }
  
  // 镜面反射通常需要保留锐利的边缘，所以使用更强的锐化
  vec3 sharpened2 = origColor2.rgb + (origColor2.rgb - result2) * 0.5;
  
  // 混合锐化和模糊结果 - 在平面区域使用模糊，边缘使用锐化
  float edgeFactor2 = length(fwidth(normal)) * 15.0; // 检测边缘，镜面反射需要更敏感
  vec3 finalColor2 = mix(result2, sharpened2, clamp(edgeFactor2, 0.0, 0.7));
  
  // 对结果进行HDR权重调整，防止过亮区域产生噪点
  float lum2 = luminance(finalColor2);
  if (lum2 > 1.0) {
    finalColor2 *= 1.0 / (1.0 + lum2 * 0.7); // 镜面反射需要更强的调整
  }
  
  gOutput1 = vec4(finalColor2, origColor2.a);
  #endif
} 