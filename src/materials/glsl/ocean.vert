uniform float time;
uniform float cameraHeight;
uniform float waterDepth;
uniform float dragMult;
uniform int iterationsVertex;

// Three.js 已提供的变量，不需要重新声明
// attribute vec3 position;
// attribute vec2 uv;
// attribute vec3 normal;
// uniform mat4 modelMatrix;
// uniform mat4 viewMatrix;
// uniform mat4 projectionMatrix;
// uniform mat3 normalMatrix;
// uniform vec3 cameraPosition;

varying vec2 vUv;
varying vec3 vPosition;
varying vec3 vWorldPosition;
varying vec3 vViewDirection;

// 哈希函数，返回随机向量
vec2 hashVec(vec2 p) {
  return sin(58322.51 * sin(vec2(
    dot(p + 0.01, vec2(123.4, 234.5)),
    dot(p + 0.01, vec2(234.5, 345.6))
  )) + time * 2.4);
}

// 生成一个柏林噪声的八度音阶
float octave(vec2 uv, float gridSize) {
  vec2 gridUv = fract(uv * gridSize);
  vec2 cellId = floor(uv * gridSize);
  vec2 smoothUv = smoothstep(0.0, 1.0, gridUv);
  
  return mix(
    mix(
      dot(hashVec(cellId + vec2(0.0, 0.0)), gridUv - vec2(0.0, 0.0)),
      dot(hashVec(cellId + vec2(1.0, 0.0)), gridUv - vec2(1.0, 0.0)), 
      smoothUv.x
    ),
    mix(
      dot(hashVec(cellId + vec2(0.0, 1.0)), gridUv - vec2(0.0, 1.0)),
      dot(hashVec(cellId + vec2(1.0, 1.0)), gridUv - vec2(1.0, 1.0)), 
      smoothUv.x
    ), 
    smoothUv.y
  );
}

// 生成多个八度音阶的柏林噪声
float perlinNoise(vec2 uv, int iterations) {
  float noise = 0.0;
  float minOct = 3.0;
  float maxOct = float(iterations);
  float amp = 1.0;
  float totalAmp = 0.0;
  
  // 添加移动速度变量，使不同比例的波浪有不同的速度
  float mainSpeed = 0.3;
  float detailSpeed = 0.7;
  
  // 大尺度波浪 - 较慢移动
  for (float i = minOct; i < minOct + 4.0; i++) {
    if (i > maxOct) break;
    float freq = pow(2.0, i);
    vec2 offset = vec2(time * mainSpeed * (0.1 + 0.05 * i), 
                       time * mainSpeed * (0.12 + 0.03 * i));
    float octaveValue = octave(uv + offset, freq);
    float weight = 1.0 / pow(2.0, 1.0 + i - minOct);
    noise += (octaveValue + 0.5) * weight * amp;
    totalAmp += weight * amp;
  }
  
  // 中尺度波浪 - 中等速度移动
  for (float i = minOct + 4.0; i < minOct + 8.0; i++) {
    if (i > maxOct) break;
    float freq = pow(2.0, i);
    vec2 offset = vec2(time * (mainSpeed + detailSpeed) * 0.15 * sin(i),
                       time * (mainSpeed + detailSpeed) * 0.17 * cos(i * 0.7));
    float octaveValue = octave(uv + offset, freq);
    float weight = 1.0 / pow(2.0, 1.0 + i - minOct);
    noise += (octaveValue + 0.5) * weight * amp * 0.8;
    totalAmp += weight * amp * 0.8;
  }
  
  // 小尺度波浪 - 较快移动
  for (float i = minOct + 8.0; i <= maxOct; i++) {
    if (i > maxOct) break;
    float freq = pow(2.0, i);
    vec2 offset = vec2(time * detailSpeed * 0.2 * sin(i * 1.3),
                       time * detailSpeed * 0.25 * cos(i * 0.9));
    float octaveValue = octave(uv + offset, freq);
    float weight = 1.0 / pow(2.0, 1.0 + i - minOct);
    noise += (octaveValue + 0.5) * weight * amp * 0.5;
    totalAmp += weight * amp * 0.5;
  }
  
  return noise / totalAmp;
}

void main() {
  // 使用position变量为了不改变原始的position
  vec3 pos = position;
  
  // 添加随机偏移，避免格子状外观
  float randomOffset = sin(position.x * 123.4 + position.z * 97.12) * 0.01 + 
                      cos(position.z * 89.3 + position.x * 67.7) * 0.01;
  
  // 应用波浪高度 - 对uv坐标进行缩放以控制波浪大小
  float scale = 0.1;
  vec2 noiseCoord = pos.xz * scale;
  
  // 生成波浪高度
  float waves = perlinNoise(noiseCoord, iterationsVertex);
  
  // 添加非对称性，使波浪看起来更自然
  float asymmetry = sin(pos.x * 0.1 + pos.z * 0.2 + time * 0.3) * 0.05;
  
  // 最终高度计算
  pos.y += waves * waterDepth + randomOffset + asymmetry;
  
  // 传递位置变量
  vWorldPosition = (modelMatrix * vec4(pos, 1.0)).xyz;
  vPosition = pos;
  vUv = uv;
  
  // 设置投影位置
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(pos, 1.0);
} 