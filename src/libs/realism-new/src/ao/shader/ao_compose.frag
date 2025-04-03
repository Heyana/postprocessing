uniform sampler2D inputTexture;
uniform highp sampler2D depthTexture;
uniform float power;
uniform vec3 color;
uniform float brightnessThreshold; // 亮度阈值，超过此值将减少AO效果

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  float unpackedDepth = textureLod(depthTexture, uv, 0.).r;

  float ao = unpackedDepth > 0.9999 ? 1.0 : textureLod(inputTexture, uv, 0.0).a;
  ao = pow(ao, power);

  // 计算输入颜色的亮度 (使用感知亮度公式)
  float brightness = dot(inputColor.rgb, vec3(0.299, 0.587, 0.114));
  
  // 根据亮度调整AO效果强度，亮度越高AO影响越小
  float aoStrength = clamp(1.0 - (brightness / brightnessThreshold), 0.0, 1.0);
  
  // 在高亮处减弱AO效果
  ao = mix(1.0, ao, aoStrength);

  vec3 aoColor = mix(color, vec3(1.), ao);

  aoColor *= inputColor.rgb;

  // 使用正确的颜色输出
  outputColor = vec4(aoColor, inputColor.a);
}