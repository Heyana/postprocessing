uniform float time;
uniform float waterDepth;
uniform float dragMult;
uniform float cameraHeight;
uniform int iterationsRaymarch;
uniform int iterationsNormal;
uniform vec2 resolution;
uniform vec3 sunDirection;
uniform vec3 skyColor;
uniform vec3 waterColor;

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

// 通过计算该点和周围点的高度来计算法线
vec3 calculateNormal(vec2 pos, float epsilon, float depth) {
  // 获取当前位置高度
  float scale = 0.1;
  float height = perlinNoise(pos * scale, iterationsNormal) * depth;
  
  // 使用相邻像素计算法线，类似于Shadertoy中的方法
  float rightHeight = perlinNoise((pos + vec2(epsilon, 0.0)) * scale, iterationsNormal) * depth;
  float upHeight = perlinNoise((pos + vec2(0.0, epsilon)) * scale, iterationsNormal) * depth;
  
  // 计算法线 - 这是一个标准的法线计算方法，通过中心差分计算切线
  vec3 normal = normalize(cross(
      vec3(epsilon, rightHeight - height, 0.0),
      vec3(0.0, upHeight - height, epsilon)
  ));
  
  // 添加高频细节，使得法线看起来更加丰富
  vec2 detailPos = pos * 5.0; // 高频细节使用更小的尺度
  float detailScale = 0.02; // 高频细节的影响强度
  
  float detailHeight = perlinNoise(detailPos, max(4, iterationsNormal / 3));
  normal.xz += detailHeight * detailScale * vec2(
      sin(pos.x * 37.0 + time * 2.0),
      cos(pos.y * 41.0 + time * 1.7)
  );
  
  return normalize(normal);
}

// 一些非常简单但快速的大气近似
vec3 extra_cheap_atmosphere(vec3 raydir, vec3 sundir) {
  float special_trick = 1.0 / (raydir.y * 1.0 + 0.1);
  float special_trick2 = 1.0 / (sundir.y * 11.0 + 1.0);
  float raysundt = pow(abs(dot(sundir, raydir)), 2.0);
  float sundt = pow(max(0.0, dot(sundir, raydir)), 8.0);
  float mymie = sundt * special_trick * 0.2;
  vec3 suncolor = mix(vec3(1.0), max(vec3(0.0), vec3(1.0) - vec3(5.5, 13.0, 22.4) / 22.4), special_trick2);
  vec3 bluesky= vec3(5.5, 13.0, 22.4) / 22.4 * suncolor;
  vec3 bluesky2 = max(vec3(0.0), bluesky - vec3(5.5, 13.0, 22.4) * 0.002 * (special_trick + -6.0 * sundir.y * sundir.y));
  bluesky2 *= special_trick * (0.24 + raysundt * 0.24);
  return bluesky2 * (1.0 + 1.0 * pow(1.0 - raydir.y, 3.0));
} 

// 获取给定方向的大气颜色 (用于反射)
vec3 getAtmosphere(vec3 dir) {
   return extra_cheap_atmosphere(dir, sunDirection) * 0.5;
}

// 获取给定方向的太阳颜色 (用于反射)
float getSun(vec3 dir) { 
  return pow(max(0.0, dot(dir, sunDirection)), 720.0) * 210.0;
}

// ACES色调映射函数
vec3 aces_tonemap(vec3 color) {  
  mat3 m1 = mat3(
    0.59719, 0.07600, 0.02840,
    0.35458, 0.90834, 0.13383,
    0.04823, 0.01566, 0.83777
  );
  mat3 m2 = mat3(
    1.60475, -0.10208, -0.00327,
    -0.53108,  1.10813, -0.07276,
    -0.07367, -0.00605,  1.07602
  );
  vec3 v = m1 * color;  
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return pow(clamp(m2 * (a / b), 0.0, 1.0), vec3(1.0 / 2.2));  
}

void main() {
  // 使用当前片段的位置计算噪声坐标
  vec2 pos = vPosition.xz;
  
  // 计算法线，使用更小的epsilon获得更精细的法线
  vec3 N = calculateNormal(pos, 0.002, waterDepth);
  
  // 计算视线方向（从片段到相机）
  vec3 viewDir = normalize(cameraPosition - vWorldPosition);
  
  // 计算菲涅耳反射系数 - 使用真实的水面菲涅耳公式
  float F0 = 0.02; // 水的基础反射率
  float fresnel = F0 + (1.0 - F0) * pow(1.0 - max(0.0, dot(N, viewDir)), 5.0);
  
  // 增加一些随机变化，给菲涅耳增加一点变化
  fresnel += perlinNoise(pos * 20.0, 4) * 0.03;
  
  // 计算反射方向
  vec3 R = normalize(reflect(-viewDir, N));
  
  // 确保反射方向向上 - 防止反射地下
  R.y = max(0.0, R.y);
  
  // 计算反射的天空和太阳光
  vec3 reflection = getAtmosphere(R) + getSun(R) * 0.25;
  
  // 水体的基础颜色
  vec3 waterBaseColor = waterColor * 0.4;
  
  // 对水面进行着色，根据法线与光线方向的夹角计算光照
  float lambertian = max(dot(N, sunDirection), 0.0);
  float specular = pow(max(0.0, dot(normalize(sunDirection + viewDir), N)), 64.0);
  
  // 添加更多的不均匀性，使水面看起来更有层次
  float depthVariation = perlinNoise(pos * 0.5, 4) * 0.2 + 0.8;
  
  // 模拟次表面散射
  vec3 subSurfaceScattering = waterColor * 0.2 * max(0.0, dot(sunDirection, -N) * 0.5 + 0.5);
  
  // 混合漫反射光照、次表面散射和水体颜色
  vec3 diffuseColor = waterBaseColor * lambertian * depthVariation + subSurfaceScattering;
  
  // 根据菲涅耳因子混合反射和漫反射
  vec3 finalColor = mix(diffuseColor, reflection, fresnel);
  
  // 添加高光反射
  finalColor += vec3(1.0) * specular * 0.5;
  
  // 添加波峰高光 - 当法线y分量接近1时（波峰处）
  float waveCrest = pow(max(0.0, N.y - 0.7) * 3.33, 5.0) * 0.3;
  finalColor += vec3(0.9, 0.95, 1.0) * waveCrest;
  
  // 应用色调映射，增强对比度和亮度
  gl_FragColor = vec4(aces_tonemap(finalColor * 2.4), 1.0);
} 