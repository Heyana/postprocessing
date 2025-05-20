// 流动河流材质顶点着色器

uniform float time;
uniform float waveHeight;
uniform float waveScale;
uniform float waveSpeed;

// 传递给片段着色器的数据
varying vec2 vUv;
varying vec3 vPosition;
varying vec3 vNormal;
varying vec3 vWorldPosition;

// 旋转矩阵函数
mat2 rotate2D(float r) {
    return mat2(cos(r), sin(r), -sin(r), cos(r));
}

// 噪声函数
float hash(float n) {
    return fract(sin(n) * 43758.5453);
}

// 波浪计算函数
float getWave(vec3 pos, float time) {
    // 添加随机性
    float seed = dot(vec2(pos.x, pos.z), vec2(123.45, 678.91));
    float randomOffset = hash(seed) * 6.28;
    
    // 主要波浪
    float waveA = sin(pos.x * 2.0 * waveScale + time * waveSpeed + randomOffset) * 
                 cos(pos.z * 2.0 * waveScale + time * waveSpeed * 0.6) * 0.5;
                 
    // 次要波浪
    float waveB = sin(pos.x * 3.0 * waveScale + time * waveSpeed * 0.4 + randomOffset) * 
                 sin(pos.z * 3.0 * waveScale + time * waveSpeed * 0.8) * 0.25;
    
    // 细节波浪
    float waveC = sin(pos.x * 7.0 * waveScale + time * waveSpeed * 0.2 + randomOffset) * 
                 cos(pos.z * 6.0 * waveScale + time * waveSpeed * 0.4) * 0.125;
    
    return (waveA + waveB + waveC) * waveHeight;
}

void main() {
    // 基础位置
    vec3 pos = position;
    
    // 应用波浪效果
    pos.y += getWave(pos, time);
    
    // 计算法线
    float epsilon = 0.01;
    vec3 pos1 = pos + vec3(epsilon, 0.0, 0.0);
    vec3 pos2 = pos + vec3(-epsilon, 0.0, 0.0);
    vec3 pos3 = pos + vec3(0.0, 0.0, epsilon);
    vec3 pos4 = pos + vec3(0.0, 0.0, -epsilon);
    
    float h1 = getWave(pos1, time);
    float h2 = getWave(pos2, time);
    float h3 = getWave(pos3, time);
    float h4 = getWave(pos4, time);
    
    vec3 tangent = normalize(vec3(2.0 * epsilon, h1 - h2, 0.0));
    vec3 bitangent = normalize(vec3(0.0, h3 - h4, 2.0 * epsilon));
    vec3 modifiedNormal = normalize(cross(bitangent, tangent));
    
    // 传递数据到片段着色器
    vUv = uv;
    vPosition = pos;
    vNormal = normalMatrix * modifiedNormal;
    
    // 计算世界空间位置
    vec4 worldPosition = modelMatrix * vec4(pos, 1.0);
    vWorldPosition = worldPosition.xyz;
    
    // 最终顶点位置
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
} 