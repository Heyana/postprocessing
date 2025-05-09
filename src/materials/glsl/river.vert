// 河流材质顶点着色器
// 基于"Where the River Goes"着色器实现

uniform float time;
uniform float wavesHeight;
// 这些是Three.js已经提供的uniform，不需要再次声明
// uniform mat4 modelMatrix;
// uniform mat4 viewMatrix;
// uniform mat4 projectionMatrix;

// Three.js 提供的变量
// attribute vec3 position;
// attribute vec2 uv;
// attribute vec3 normal;

// 传递给片段着色器的数据
varying vec2 vUv;
varying vec3 vPosition;       // 模型空间位置
varying vec3 vNormal;
varying vec3 vWorldPosition;  // 世界空间位置
varying vec3 vViewDirection;
varying mat3 vNormalMatrix;

// 哈希函数 - 用于随机化波动
float hash(float n) {
    return fract(sin(n) * 43758.5453);
}

// 基于原始着色器的河流波动函数 - 使用vec3模型空间坐标
float GetWave(vec3 pos, float time) {
    // 添加一些随机性，使波浪看起来不均匀
    float seed = dot(vec2(pos.x, pos.z), vec2(123.45, 678.91));
    float randomOffset = hash(seed) * 6.28;
    
    // 主要波浪
    float waveA = sin(pos.x * 2.0 + time * 0.5 + randomOffset) * 
                 cos(pos.z * 2.0 + time * 0.3) * 0.5;
                 
    // 次要波浪
    float waveB = sin(pos.x * 3.0 + time * 0.2 + randomOffset) * 
                 sin(pos.z * 3.0 + time * 0.5) * 0.25;
    
    // 细节波浪
    float waveC = sin(pos.x * 7.0 + time * 0.1 + randomOffset) * 
                 cos(pos.z * 6.0 + time * 0.2) * 0.125;
    
    return (waveA + waveB + waveC) * wavesHeight;
}

void main() {
    // 基础位置 - 使用模型空间坐标
    vec3 pos = position;
    
    // 现在直接使用模型空间的xz坐标
    vec2 modelXZ = vec2(position.x, position.z);
    
    // 应用波浪效果 - 直接使用vec3位置
    pos.y += GetWave(pos, time);
    
    // 计算法线 - 使用有限差分法 (基于模型空间)
    float epsilon = 0.01;
    vec3 pos1 = pos + vec3(epsilon, 0.0, 0.0);
    vec3 pos2 = pos + vec3(-epsilon, 0.0, 0.0);
    vec3 pos3 = pos + vec3(0.0, 0.0, epsilon);
    vec3 pos4 = pos + vec3(0.0, 0.0, -epsilon);
    
    // 使用相同的函数获取高度差
    float h1 = GetWave(pos1, time);
    float h2 = GetWave(pos2, time);
    float h3 = GetWave(pos3, time);
    float h4 = GetWave(pos4, time);
    
    vec3 tangent = normalize(vec3(2.0 * epsilon, h1 - h2, 0.0));
    vec3 bitangent = normalize(vec3(0.0, h3 - h4, 2.0 * epsilon));
    vec3 modifiedNormal = normalize(cross(bitangent, tangent));
    
    // 传递给片段着色器的数据
    vUv = uv;
    vPosition = pos;  // 传递模型空间坐标
    vNormal = normalMatrix * modifiedNormal;
    
    // 计算并传递世界空间位置
    vec4 worldPosition = modelMatrix * vec4(pos, 1.0);
    vWorldPosition = worldPosition.xyz;
    
    // 计算视线方向
    vec4 viewPos = viewMatrix * worldPosition;
    vViewDirection = normalize(-viewPos.xyz);
    
    // 传递法线矩阵给片段着色器
    vNormalMatrix = normalMatrix;
    
    // 最终顶点位置
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
} 