// 均匀雾效果
// 提供一种距离无关的均匀雾效果，雾的浓度在视距范围内保持相对均匀

uniform float time;           // 时间
uniform vec2 resolution;      // 分辨率

// 相机参数
uniform vec3 cameraPosition;
uniform mat4 viewMatrix;      // 相机世界矩阵
uniform float cameraFov;

// 效果参数
uniform float fogDensity;     // 雾气密度
uniform vec3 fogColor;        // 雾气颜色
uniform float fogMinDist;     // 雾气最小距离
uniform float quality;        // 质量设置 (0-1)
uniform float occludeSky;     // 雾气遮挡天空的程度 (0-1)
uniform float segments;       // 雾的分段数
uniform int fogSteps;         // 采样步数
uniform float fogScale;       // 雾团大小
uniform float fogStrength;    // 雾团强度
uniform float fogEdgeMin;     // 雾团边缘平滑起点
uniform float fogEdgeMax;     // 雾团边缘平滑终点
uniform float fogAtten;      // 雾的距离衰减系数
uniform float fogFadeWidth;   // 雾的近距离淡入宽度

// 重建世界坐标的函数
vec3 reconstructWorldPos(vec2 uv, float depth) {
    // 计算NDC空间的坐标 (-1 到 1 的范围)
    float z = depth * 2.0 - 1.0;
    vec2 screenPos = uv * 2.0 - 1.0;
    
    // 在相机空间中的射线方向
    float fovFactor = tan(radians(cameraFov * 0.5));
    vec3 viewDir = normalize(vec3(
        screenPos.x * resolution.x / resolution.y * fovFactor, 
        screenPos.y * fovFactor, 
        -1.0
    ));
    
    // 线性深度计算
    float linearDepth = 2.0 * cameraNear * cameraFar / 
        (cameraFar + cameraNear - z * (cameraFar - cameraNear));
    
    // 计算相机空间的位置
    vec3 cameraSpacePos = viewDir * linearDepth;
    
    // 转换为世界空间
    return cameraPosition + (viewMatrix * vec4(cameraSpacePos, 0.0)).xyz;
}

// 3D hash/噪声
float hash(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float n000 = hash(i + vec3(0, 0, 0));
    float n001 = hash(i + vec3(0, 0, 1));
    float n010 = hash(i + vec3(0, 1, 0));
    float n011 = hash(i + vec3(0, 1, 1));
    float n100 = hash(i + vec3(1, 0, 0));
    float n101 = hash(i + vec3(1, 0, 1));
    float n110 = hash(i + vec3(1, 1, 0));
    float n111 = hash(i + vec3(1, 1, 1));
    return mix(
        mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
        mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),
        f.z);
}

// 体积雾团采样（用真实空间距离）
float volumeFogFactor(vec3 camPos, vec3 rayDir, float maxDist, float fogDensity, float minDist) {
    int steps = fogSteps;
    float tMin = minDist;
    float tMax = maxDist;
    float dt = (tMax - tMin) / float(steps);
    float accum = 0.0;
    for(int i = 0; i < 128; i++) {
        if(i >= steps) break;
        float t = tMin + dt * (float(i) + 0.5);
        vec3 p = camPos + rayDir * t;
        float d = noise(p * fogScale + time * 0.02);
        d = smoothstep(fogEdgeMin, fogEdgeMax, d);
        float attenuation = exp(-t * fogAtten);
        accum += d * dt * attenuation;
    }
    accum = clamp(accum * fogDensity * fogStrength, 0.0, 1.0);
    return accum;
}

// PostProcessing框架的主函数
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    if (USE_DEPTH == 1) {
        float depth = texture2D(depthBuffer, uv).r;
        float linearDepth;
        if (depth >= 0.9999) {
            linearDepth = 1.0;
        } else {
            float z = depth * 2.0 - 1.0;
            linearDepth = 2.0 * cameraNear * cameraFar / 
                (cameraFar + cameraNear - z * (cameraFar - cameraNear));
        }
        vec3 worldPos = reconstructWorldPos(uv, depth);
        vec3 camPos = cameraPosition;
        vec3 rayDir = normalize(worldPos - camPos);
        float maxDist = length(worldPos - camPos);
        float nearMask = step(fogMinDist, maxDist);
        float nearFade = smoothstep(fogMinDist, fogMinDist + fogFadeWidth, maxDist);
        float fogFactor = volumeFogFactor(camPos, rayDir, maxDist, fogDensity, fogMinDist) * nearFade * nearMask;
        vec3 foggedScene = mix(inputColor.rgb, fogColor, fogFactor);
        outputColor = vec4(foggedScene, inputColor.a);
    } else {
        outputColor = inputColor;
    }
} 