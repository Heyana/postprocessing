uniform sampler2D depthBuffer;
uniform sampler2D normalBuffer;
uniform sampler2D noiseTexture;

uniform vec2 texelSize;
uniform float cameraNear;
uniform float cameraFar;
uniform float snowHeight;
uniform float snowAmount;
uniform float snowBrightness;
uniform bool additiveBlending;
uniform vec3 snowColor;
uniform float alphaTest;
uniform vec3 cameraPosition;
uniform float slopeMinAngle;
uniform float slopeMaxAngle;

// 添加矩阵用于世界位置重建
uniform mat4 cameraMatrixWorld;
uniform mat4 projectionMatrixInverse;

float readDepth(in vec2 uv) {
    return texture2D(depthBuffer, uv).r;
}

// 将深度值转换回线性空间
float linearizeDepth(in float depth) {
    return cameraNear * cameraFar / (cameraNear + depth * (cameraFar - cameraNear));
}

// 从深度重建世界坐标
vec3 reconstructWorldPosition(vec2 uv, float depth) {
    // 从UV和深度构建NDC坐标 (normalized device coordinates)
    vec4 ndc = vec4(
        (uv.x - 0.5) * 2.0,
        (uv.y - 0.5) * 2.0,
        (depth - 0.5) * 2.0,
        1.0
    );
    
    // 转换到相机空间
    vec4 clip = projectionMatrixInverse * ndc;
    clip /= clip.w;
    
    // 转换到世界空间
    vec4 worldPos = cameraMatrixWorld * clip;
    
    return worldPos.xyz;
}

// 计算积雪稳定因子 - 不会随着相机角度变化
float calculateSnowStableFactor(vec3 normal, float linearDepth, vec3 worldPos) {
    // 使用世界坐标Y值作为基本判断 - 高度越高积雪越多
    float worldHeightFactor = smoothstep(-5.0, 5.0, worldPos.y);
    
    // 计算基于深度的积雪因子 - 距离相机越近积雪越多
    float depthFactor = 1.0 - linearDepth / snowHeight;
    
    // 法线朝上的因子 - 但权重非常小，仅作为辅助
    float normalFactor = max(0.0, normal.y);
    
    // 将各个因子混合 - 世界高度最重要，其次是深度，法线影响最小
    // 这样即使在俯视角度，表面也会保持稳定的积雪
    float combinedFactor = mix(worldHeightFactor, depthFactor, 0.3);
    return mix(combinedFactor, normalFactor, 0.1);
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    vec4 normalData = texture2D(normalBuffer, uv);
    float depth = readDepth(uv);
    vec4 depthData = texture2D(depthBuffer, uv);
    
    // 检查alpha值，如果低于阈值则不应用积雪
    if(inputColor.a < alphaTest) {
        outputColor = inputColor;
        return;
    }
    
    // 将深度转换为线性空间
    float linearDepth = linearizeDepth(depth);
    
    // 重建世界坐标 - 用于更稳定的积雪计算
    vec3 worldPos = reconstructWorldPosition(uv, depth);
    
    // 使用噪声纹理为雪添加一些变化
    vec4 noiseData = texture2D(noiseTexture, uv * 10.0);
    
    // 获取法线向量
    vec3 normal = normalize(normalData.xyz * 2.0 - 1.0);
    
    // 使用稳定的积雪计算 - 减少相机角度依赖
    float stableFactor = calculateSnowStableFactor(normal, linearDepth, worldPos);
    float noiseFactor = noiseData.r * 0.4 + 0.8;
    
    // 计算积雪因子 - 基于世界位置而非视图依赖因素
    float snowFactor = clamp(stableFactor * noiseFactor * snowAmount, 0.0, 1.0);
    
    // 平滑过渡到雪的颜色
    vec3 finalColor;
    if (additiveBlending) {
        // 加性混合模式
        finalColor = mix(inputColor.rgb, inputColor.rgb + snowColor * snowBrightness, snowFactor);
    } else {
        // 普通混合模式
        finalColor = mix(inputColor.rgb, snowColor, snowFactor);
    }
    
    // 输出最终颜色
    outputColor = vec4(finalColor, inputColor.a);
} 