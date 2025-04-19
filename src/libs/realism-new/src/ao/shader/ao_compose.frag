uniform sampler2D inputTexture;  // AO的纹理
uniform sampler2D inputBuffer;   // 原始场景的颜色纹理
uniform sampler2D maskPass;   // 原始场景的颜色纹理

uniform highp sampler2D depthPass1;
uniform highp sampler2D depthTexture;
uniform sampler2D maskTexture;
uniform float power;
uniform vec3 color;
uniform float brightnessThreshold; // 亮度阈值，超过此值将减少AO效果
uniform float maskThreshold;       // 遮罩阈值，低于此值应用AO效果
uniform int debugMode; // 调试模式: 0=正常, 1=显示亮度

// 深度可视化参数
uniform float depthNear;
uniform float depthFar;

// 忽略超亮物体的阈值
#define IGNORE_BRIGHTNESS_THRESHOLD 20.0

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  // 读取原始场景颜色
  vec4 sceneColor = texture2D(inputBuffer, uv);
  
  // 读取深度值
  float depth = texture2D(depthTexture, uv).r;
  float linearDepth = (2.0 * depthNear) / (depthFar + depthNear - depth * (depthFar - depthNear));
  
  // 读取遮罩值
  float maskValue = texture2D(maskTexture, uv).r;
  
  // 根据调试模式显示不同信息
  if (debugMode == 1) {
    // 亮度可视化
    float brightness = max(max(sceneColor.r, sceneColor.g), sceneColor.b);
    outputColor = vec4(vec3(brightness), 1.0);
    return;
  } else if (debugMode == 2) {
    // AO强度可视化
    vec4 aoSample = texture2D(inputTexture, uv);
    outputColor = vec4(vec3(aoSample.a), 1.0);
    return;
  } else if (debugMode == 3) {
    // AO值可视化
    vec4 aoSample = texture2D(inputTexture, uv);
    outputColor = vec4(vec3(pow(aoSample.a, power)), 1.0);
    return;
  } else if (debugMode == 4) {
    // 遮罩可视化 - 增强对比度使黑色区域更明显
    float depthGradient = length(vec2(dFdx(linearDepth), dFdy(linearDepth)));
    float isAoArea = maskValue <= maskThreshold ? 0.0 : 1.0; // 黑色区域(会应用AO)为0，其他区域为1
    outputColor = vec4(vec3(maskValue<0.000001?0.0:1.0), 1.0);
    return;
  } else if (debugMode == 5) {
    // 深度(灰度)
    outputColor = vec4(vec3(linearDepth), 1.0);
    return;
  } else if (debugMode == 6) {
    // 深度(彩色)
    float normalizedDepth = linearDepth * 2.0 - 1.0;
    vec3 depthColor = vec3(
      smoothstep(-1.0, 0.0, normalizedDepth),
      smoothstep(0.0, 1.0, normalizedDepth),
      smoothstep(1.0, 2.0, normalizedDepth)
    );
    outputColor = vec4(depthColor, 1.0);
    return;
  } else if (debugMode == 7) {
    // 遮罩和深度对比
    vec3 depthColor = vec3(linearDepth);
    vec3 maskColor = vec3(maskValue);
    outputColor = vec4(mix(depthColor, maskColor, 0.5), 1.0);
    return;
  } else if (debugMode == 8) {
    // 模板缓冲可视化 - 直接显示从模板缓冲捕获的纹理
    // 不再需要复杂的处理，直接显示从captureStencilBuffer生成的纹理
    outputColor = texture2D(maskTexture, uv);
    return;
  } else if (debugMode == 9) {
    // 模板缓冲叠加模式 - 在正常渲染中显示模板区域
    // 首先从正常渲染获取结果
    float ao = 1.0;
    if (depth < 1.0) {
      vec4 aoSample = texture2D(inputTexture, uv);
      ao = aoSample.a;
      ao = pow(ao, power);
    }
    
    // 调整基于亮度的AO强度
    vec3 colorForBrightness = sceneColor.rgb;
    float perceptualBrightness = dot(colorForBrightness, vec3(0.299, 0.587, 0.114));
    float aoStrength = clamp(1.0 - pow(perceptualBrightness / max(brightnessThreshold, 0.001), 0.5), 0.0, 1.0);
    ao = mix(1.0, ao, aoStrength);
    
    // 计算最终AO颜色
    vec3 aoColor = mix(color, vec3(1.0), ao);
    aoColor *= inputColor.rgb;
    
    // 叠加模板可视化效果
    vec4 stencilColor = texture2D(maskTexture, uv);
    if (stencilColor.a > 0.0) {
      // 在有模板内容的地方混合
      outputColor = vec4(mix(aoColor, stencilColor.rgb, stencilColor.a * 0.7), 1.0);
    } else {
      // 无模板内容的地方正常显示
      outputColor = vec4(aoColor, 1.0);
    }
    return;
  }
  
  // 正常渲染模式
  float ao = 1.0;
  if (depth < 1.0) {
    vec4 aoSample = texture2D(inputTexture, uv);
    ao = aoSample.a;
    ao = pow(ao, power);
  }
  
  // 根据亮度调整AO强度
  vec3 colorForBrightness = sceneColor.rgb;
  float perceptualBrightness = dot(colorForBrightness, vec3(0.299, 0.587, 0.114));
  
  // 亮度阈值处理 - 使用更陡峭的曲线以增强对比度
  float aoStrength = clamp(1.0 - pow(perceptualBrightness / max(brightnessThreshold, 0.001), 0.5), 0.0, 1.0);
  ao = mix(1.0, ao, aoStrength);
  
  // 遮罩处理 - 只在遮罩黑色区域应用AO
  // 使用遮罩阈值来确定黑色区域
  if (maskValue < 0.000001){
    // 非黑色区域 - 不应用AO效果
    //ao = 1.0;
    outputColor =inputColor;
    return;
  }
  
  // 最终合成
  vec3 aoColor = mix(color, vec3(1.0), ao);
  aoColor *= inputColor.rgb;
  outputColor = vec4(aoColor, inputColor.a);
}