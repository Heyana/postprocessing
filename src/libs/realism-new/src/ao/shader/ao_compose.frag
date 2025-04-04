uniform sampler2D inputTexture;
uniform highp sampler2D depthTexture;
#ifdef USE_FULL_SCENE_DEPTH
uniform highp sampler2D fullSceneDepthTexture;
#endif
uniform float power;
uniform vec3 color;
uniform float brightnessThreshold; // 亮度阈值，超过此值将减少AO效果

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  // 初始默认值，确保在纹理问题时有合理的回退值
  float ao = 1.0;

  #ifdef DEBUG_DEPTH
    // 调试模式：显示深度纹理
    float depth = textureLod(depthTexture, uv, 0.0).r;
    outputColor = vec4(vec3(depth), 1.0);
    return;
  #endif

  #ifdef DEBUG_FULL_DEPTH
    // 调试模式：显示全场景深度纹理
    #ifdef USE_FULL_SCENE_DEPTH
      float fullDepth = textureLod(fullSceneDepthTexture, uv, 0.0).r;
    #else
      float fullDepth = textureLod(depthTexture, uv, 0.0).r;
    #endif
    outputColor = vec4(vec3(fullDepth), 1.0);
    return;
  #endif

  #ifdef DEBUG_AO
    // 调试模式：只显示AO通道
    vec4 aoSample = textureLod(inputTexture, uv, 0.0);
    outputColor = vec4(vec3(aoSample.a), 1.0);
    return;
  #endif

  // AO效果处理
  // 检查uv坐标是否在有效范围内
  if(uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0) {
    // 读取深度值
    float unpackedDepth = textureLod(depthTexture, uv, 0.0).r;
    
    // 默认假设该像素不是被忽略的对象
    bool isIgnoredObject = false;
    
    // 处理模型忽略情况
    #ifdef USE_FULL_SCENE_DEPTH
      // 读取全场景深度，用于检测被忽略的对象
      float fullSceneDepth = textureLod(fullSceneDepthTexture, uv, 0.0).r;
      
      // 比较两个深度值，判断当前像素是否位于被忽略的对象上
      // 如果全场景深度与过滤后深度不同，说明这是被忽略的对象
      isIgnoredObject = abs(fullSceneDepth - unpackedDepth) > 0.00001;
      
      #ifdef DEBUG_SELECTION
        // 调试模式：高亮显示被忽略/不被忽略的对象
        if (isIgnoredObject) {
          outputColor = vec4(1.0, 0.0, 0.0, 1.0); // 红色 - 被忽略的对象
        } else {
          outputColor = vec4(0.0, 1.0, 0.0, 1.0); // 绿色 - 参与AO计算的对象
        }
        return;
      #endif
    #endif
    
    // 只有非忽略对象才应用AO效果
    if (!isIgnoredObject) {
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
  }

  // 计算输入颜色的亮度 (使用感知亮度公式)
  float brightness = dot(inputColor.rgb, vec3(0.299, 0.587, 0.114));
  
  // 根据亮度调整AO效果强度，亮度越高AO影响越小
  float aoStrength = clamp(1.0 - (brightness / max(brightnessThreshold, 0.001)), 0.0, 1.0);
  
  // 在高亮处减弱AO效果
  ao = mix(1.0, ao, aoStrength);

  // 应用AO效果
  vec3 aoColor = mix(color, vec3(1.0), ao);
  aoColor *= inputColor.rgb;

  // 输出最终颜色，确保alpha值正确
  outputColor = vec4(aoColor, inputColor.a);
}