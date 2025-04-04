uniform sampler2D inputTexture;  // AO的纹理
uniform sampler2D inputBuffer;   // 原始场景的颜色纹理
uniform highp sampler2D depthTexture;
uniform float power;
uniform vec3 color;
uniform float brightnessThreshold; // 亮度阈值，超过此值将减少AO效果
uniform int debugMode; // 调试模式: 0=正常, 1=显示亮度

// 忽略超亮物体的阈值
#define IGNORE_BRIGHTNESS_THRESHOLD 20.0

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  // 初始默认值，确保在纹理问题时有合理的回退值
  float ao = 1.0;

  // 读取原始场景颜色（用于调试模式）
  vec4 sceneColor = texture2D(inputBuffer, uv);
  
  // 计算场景颜色的亮度用于调试
  float sceneBrightness = max(max(sceneColor.r, sceneColor.g), sceneColor.b);
  
  // 计算输入颜色的亮度
  float brightness = max(max(inputColor.r, inputColor.g), inputColor.b);
  
  // 检测超亮物体（被标记为不参与AO的对象）
  if (brightness > IGNORE_BRIGHTNESS_THRESHOLD) {
    // 如果检测到超亮物体，直接返回原始颜色，不应用AO
    outputColor = inputColor;
    return;
  }

  // AO效果处理
  // 检查uv坐标是否在有效范围内
  if(uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0) {
    // 读取深度值
    float unpackedDepth = textureLod(depthTexture, uv, 0.).r;
    
    // 检查深度有效性
    if(unpackedDepth > 0.0 && unpackedDepth <= 1.0) {
      if(unpackedDepth > 0.9999) {
        // 深度接近远平面，认为是天空或远处物体，使用1.0（无AO）
        ao = 1.0;
      } else {
        // 读取AO值并检查有效性
        vec4 aoSample = textureLod(inputTexture, uv, 0.0);
        if(aoSample.a >= 0.0 && aoSample.a <= 1.0) {
          ao = aoSample.a;
          ao = pow(ao, power);
        }
      }
    }
  }

  // 计算输入颜色的亮度 (使用感知亮度公式)
  // 在调试模式下使用场景颜色，正常模式下使用输入颜色
  vec3 colorForBrightness = debugMode > 0 ? sceneColor.rgb : inputColor.rgb;
  float perceptualBrightness = dot(colorForBrightness, vec3(0.299, 0.587, 0.114));
  
  // 根据亮度调整AO效果强度，亮度越高AO影响越小
  float aoStrength = clamp(1.0 - (perceptualBrightness / max(brightnessThreshold, 0.001)), 0.0, 1.0);
  
  // 在高亮处减弱AO效果
  ao = mix(1.0, ao, aoStrength);

  // 亮度调试模式
  if (debugMode == 1) {
    // 显示亮度值
    float normalizedBrightness = clamp(perceptualBrightness / brightnessThreshold, 0.0, 1.0);
    outputColor = vec4(vec3(normalizedBrightness), 1.0);
    return;
  } else if (debugMode == 2) {
    // 显示AO强度值
    outputColor = vec4(vec3(aoStrength), 1.0);
    return;
  } else if (debugMode == 3) {
    // 显示最终AO值
    outputColor = vec4(vec3(ao), 1.0);
    return;
  }

  // 正常模式: 应用AO效果
  vec3 aoColor = mix(color, vec3(1.0), ao);
  aoColor *= inputColor.rgb;

  // 输出最终颜色，确保alpha值正确
  outputColor = vec4(aoColor, inputColor.a);
}