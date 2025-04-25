uniform sampler2D inputTexture;
uniform highp sampler2D depthTexture;
uniform highp sampler2D normalTexture;
uniform highp sampler2D colorTexture;
uniform float power;
uniform vec3 color;
uniform float indirectLightIntensity;

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  // 获取深度值，跳过天空盒
  float unpackedDepth = textureLod(depthTexture, uv, 0.).r;
  
  // 读取SSDO结果
  // r通道: 遮蔽度 (1表示完全遮挡，0表示无遮挡)
  // gba通道: 间接光颜色
  vec4 ssdo = unpackedDepth > 0.9999 
    ? vec4(0.0, 0.0, 0.0, 0.0) 
    : textureLod(inputTexture, uv, 0.0);
  
  float ao = 1.0 - ssdo.r; // 反转遮蔽值，使其成为可用度
  vec3 indirectLight = ssdo.gba;
  
  // 应用幂次修改遮蔽强度
  ao = pow(ao, power);
  
  // 使用颜色混合遮蔽
  vec3 aoColor = mix(color, vec3(1.0), ao);
  
  // 应用到输入颜色
  vec3 resultColor = aoColor * inputColor.rgb;
  
  // 添加间接光照贡献
  resultColor += indirectLight * indirectLightIntensity;
  
  // 输出结果
  outputColor = vec4(resultColor, inputColor.a);
} 