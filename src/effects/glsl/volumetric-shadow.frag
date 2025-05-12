// 这些变量由Three.js框架自动定义，不需要再声明
// uniform sampler2D inputBuffer;
// uniform sampler2D depthBuffer;
uniform sampler2D ditherMap;
uniform sampler2D marchingTex;
uniform sampler2D shadowMap;
// uniform vec2 resolution;
uniform mat4 cameraMatrixWorld;
// uniform vec3 cameraPosition;
// uniform float cameraNear;
// uniform float cameraFar;
uniform vec4 offsets;

uniform int rayMarchingStep;
uniform float maxRayLength;
uniform float volumetricLightIntensity;
uniform float volumetricShadowIntensity;
uniform float lightScatteringFactor;
uniform float shadowAttenuation;
uniform float minShadow;
uniform float samplerScale;
uniform vec3 lightPosition; // 光源位置

// varying vec2 vUv;
varying vec4 vRay;

// 重新映射值
float remap(float x, float from1, float to1, float from2, float to2) {
    return (x - from1) / (to1 - from1) * (to2 - from2) + from2;
}

// 计算线性深度值
float getLinearDepth(float depth) {
    float z = depth * 2.0 - 1.0;
    return 2.0 * cameraNear * cameraFar / (cameraFar + cameraNear - z * (cameraFar - cameraNear));
}

// 从深度重建世界坐标
vec3 getWorldPos(vec2 uv, float depth) {
    float linearDepth = getLinearDepth(depth);
    vec3 worldDir = normalize(vRay.xyz);
    return cameraPosition + worldDir * linearDepth;
}

// 判断点是否在阴影中 - 简化版，实际实现需要更精确的阴影计算
float getShadow(vec3 worldPos) {
    // 简化版阴影计算，仅用于演示
    // 在实际实现中，应替换为更准确的阴影计算方法
    float shadowValue = 0.8; // 默认值
    
    // 计算光源方向
    vec3 dirToLight = normalize(lightPosition - worldPos);
    
    // 简单的方向性阴影（这只是演示用）
    float dotNL = dot(dirToLight, normalize(vRay.xyz)) * 0.5 + 0.5;
    shadowValue = mix(0.5, 1.0, dotNL);
    
    return shadowValue;
}

// 主函数，用于射线行进计算阴影
vec4 calcVolumetricShadow() {
    // 获取深度
    float depth = texture2D(depthBuffer, vUv).r;
    float linearDepth = getLinearDepth(depth);
    
    // 限制最大深度
    linearDepth = min(linearDepth, maxRayLength);
    
    // 计算世界坐标
    vec3 worldPos = cameraPosition + vRay.xyz * linearDepth;
    
    float vShadow = 1.0; // 初始阴影值
    float vLight = 0.0;  // 初始光照值
    
    // 射线起点
    vec3 rayOri = cameraPosition;
    vec3 rayDir = normalize(vRay.xyz);
    
    // 计算相机到世界坐标点的距离
    float disCam2World = length(worldPos - cameraPosition);
    
    // 使用抖动图扰动采样点，减少走样
    vec2 offsetUV = mod(floor(gl_FragCoord.xy), 4.0);
    float ditherValue = texture2D(ditherMap, offsetUV * 0.25).a;
    rayOri += ditherValue * rayDir;
    
    // 计算光线散射强度
    vec3 toLight = normalize(lightPosition - cameraPosition);
    float dotLightRayDir = dot(toLight, rayDir) * 0.5 + 0.5;
    float scatteringLight = smoothstep(0.5, 1.0, dotLightRayDir);
    
    // 计算射线行进步长
    float marchStep = disCam2World / float(rayMarchingStep);
    
    // 射线行进循环
    for (int j = 0; j < 128; j++) { // 使用常数最大值，但在内部限制实际步数
        if (j >= rayMarchingStep) break;
        
        // 计算当前采样点
        vec3 currentPos = rayOri + rayDir * marchStep * float(j);
        
        // 计算当前点到相机的距离
        float disCam2Current = length(currentPos - cameraPosition);
        
        // 检查是否超出深度范围
        float outOfRange = step(disCam2Current, disCam2World);
        
        // 计算阴影值
        float shadow = getShadow(currentPos);
        
        // 累积阴影和光照值
        float stepWeight = float(j + 3) / float(rayMarchingStep);
        vShadow -= (1.0 - shadow) * volumetricShadowIntensity / float(rayMarchingStep) * stepWeight * outOfRange;
        vLight += shadow * volumetricLightIntensity * scatteringLight / float(rayMarchingStep) * stepWeight * outOfRange;
    }
    
    // 限制阴影值范围
    vShadow = clamp(vShadow, minShadow, 1.0);
    
    // 应用散射因子到光照值
    vLight = pow(clamp(vLight, 0.0, 1.0), lightScatteringFactor);
    
    return vec4(vLight, vShadow, 0.0, 1.0);
}

// 模糊函数
vec4 blur(sampler2D tex) {
    vec4 color = vec4(0.0);
    vec2 texelSize = 1.0 / resolution;
    
    // 计算模糊采样权重
    color += 0.40 * texture2D(tex, vUv);
    color += 0.15 * texture2D(tex, vUv + offsets.xy * texelSize);
    color += 0.15 * texture2D(tex, vUv - offsets.xy * texelSize);
    color += 0.10 * texture2D(tex, vUv + 2.0 * offsets.xy * texelSize);
    color += 0.10 * texture2D(tex, vUv - 2.0 * offsets.xy * texelSize);
    color += 0.05 * texture2D(tex, vUv + 3.0 * offsets.xy * texelSize);
    color += 0.05 * texture2D(tex, vUv - 3.0 * offsets.xy * texelSize);
    
    return color;
}

// 合成函数
vec4 combine(vec4 originalColor, vec4 marchingColor) {
    vec4 finalColor = vec4(1.0);
    
    // 从marchingTex中获取阴影和光照信息
    float lightValue = marchingColor.r;
    float shadowValue = marchingColor.g;
    
    // 计算最终颜色：原始颜色 + 光照效果，并应用阴影
    finalColor.rgb = clamp(originalColor.rgb + lightValue * vec3(1.0), 0.0, 1.0) * shadowValue;
    finalColor.a = originalColor.a;
    
    return finalColor;
}

// 确定当前处理阶段
// 1. 射线行进阶段: offsets.xy 长度几乎为0
// 2. 模糊阶段: offsets.xy 长度大于微小值
// 3. 合成阶段: offsets.xy 有特定的微小值
int determineStage() {
    float offsetLength = length(offsets.xy);
    
    if (offsetLength < 0.00001) {
        return 1; // 射线行进阶段
    } else if (offsetLength > 0.001) {
        return 2; // 模糊阶段
    } else {
        return 3; // 合成阶段
    }
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    int stage = determineStage();
    
    if (stage == 1) {
        // 阶段1: 射线行进阶段 - 计算初始体积阴影
        outputColor = calcVolumetricShadow();
    }
    else if (stage == 2) {
        // 阶段2: 模糊阶段 - 对阴影贴图应用模糊
        outputColor = blur(inputBuffer);
    }
    else {
        // 阶段3: 合成阶段 - 将阴影和原始图像合成
        vec4 marchingColor = texture2D(marchingTex, uv);
        outputColor = combine(inputColor, marchingColor);
    }
} 