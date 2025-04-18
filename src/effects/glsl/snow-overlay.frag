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
uniform float normalThreshold;
uniform float viewStability;
uniform float snowNoisiness; // 雪的不均匀程度
uniform float snowAccumulation; // 雪的堆积程度

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
    // 构建截锥体空间坐标 (-1到1范围)
    vec4 clipPos = vec4(
        (uv.x * 2.0 - 1.0),
        (uv.y * 2.0 - 1.0),
        (depth * 2.0 - 1.0),
        1.0
    );
    
    // 转换到相机空间
    vec4 viewPos = projectionMatrixInverse * clipPos;
    viewPos /= viewPos.w;
    
    // 转换到世界空间
    vec4 worldPos = cameraMatrixWorld * viewPos;
    
    return worldPos.xyz;
}

// 计算相机视角稳定因子 - 防止极端视角下雪消失
float calculateViewStabilityFactor(vec3 normal, vec3 worldPos) {
    // 计算从相机到表面点的向量
    vec3 viewDir = normalize(worldPos - cameraPosition);
    
    // 计算视线与法线的夹角 (点积)
    float viewDotNormal = abs(dot(viewDir, normal));
    
    // 当视线几乎垂直于表面时(接近0)，提供额外的稳定因子
    // 使用viewStability参数控制稳定性强度
    return mix(0.0, smoothstep(0.0, 0.3, viewDotNormal), 1.0 - viewStability);
}

// 计算雪滑落效果 - 大角度表面会有更少的积雪
float calculateSnowSliding(vec3 normal, vec3 worldPos, float noise) {
    // 基础滑落计算 - 基于法线Y分量（垂直度）
    float slope = normal.y; // 1.0表示完全水平, 0.0表示完全垂直
    
    // 添加噪声到滑落计算，使得边缘更自然
    float noisySlope = mix(slope, slope * (0.8 + noise * 0.4), snowNoisiness);
    
    // 计算滑落系数 - 陡峭的表面滑落更多，缓和的表面积累更多
    float slideThreshold = 0.7; // 开始滑落的阈值角度
    float slideFactor = smoothstep(slideThreshold - 0.3, slideThreshold + 0.2, noisySlope);
    
    // 模拟雪的堆积 - 在坡度变化的地方添加更多雪
    float localHeight = dot(worldPos, vec3(0.8, 1.0, 0.8)) * 0.1;
    float heightVariation = fract(localHeight) * 2.0 - 1.0;
    float accumulationFactor = smoothstep(0.3, 0.7, abs(heightVariation)) * snowAccumulation;
    
    // 在坡度适中的地方增加雪的堆积
    float accumulationSlope = smoothstep(0.4, 0.9, noisySlope) * smoothstep(1.0, 0.4, noisySlope);
    float finalAccumulation = mix(0.0, accumulationFactor, accumulationSlope);
    
    // 合并滑落和堆积效果
    return slideFactor + finalAccumulation * 0.5;
}

// 生成复杂噪声 - 用于不均匀雪分布
float generateComplexNoise(vec2 uv) {
    float noise1 = texture2D(noiseTexture, uv * 10.0).r;
    float noise2 = texture2D(noiseTexture, uv * 5.0 + vec2(0.4, 0.6)).r;
    float noise3 = texture2D(noiseTexture, uv * 20.0 - vec2(0.1, 0.9)).r;
    
    // 混合不同尺度的噪声，创造自然变化
    return noise1 * 0.5 + noise2 * 0.3 + noise3 * 0.2;
}

// 计算积雪稳定因子 - 不会随着相机角度变化
float calculateSnowStableFactor(vec3 normal, float linearDepth, vec3 worldPos) {
    // 使用世界坐标Y值作为基本判断 - 高度越高积雪越多
    float worldHeightFactor = smoothstep(-5.0, 5.0, worldPos.y);
    
    // 计算基于深度的积雪因子 - 距离相机越近积雪越多
    float depthFactor = 1.0 - linearDepth / snowHeight;
    
    // 法线朝上的因子 - 垂直面（法线Y接近0）应该没有雪
    float normalFactor = pow(max(0.0, normal.y), 2.0);
    
    // 硬性阈值 - 如果法线Y分量小于normalThreshold，就不应该有雪
    float normalThresholdFactor = step(normalThreshold, normal.y);
    
    // 获取视角稳定因子
    float viewStabilityFactor = calculateViewStabilityFactor(normal, worldPos);
    
    // 将各个因子混合 - 世界高度和法线共同决定
    float combinedFactor = mix(worldHeightFactor, depthFactor, 0.3);
    
    // 提高法线因子在接近垂直视角下的稳定性
    float stabilizedNormalFactor = mix(normalFactor, max(normalFactor, 0.2), 1.0 - viewStabilityFactor);
    
    // 法线因子权重增加到0.5，并应用硬性阈值
    // 应用视角稳定性修正，在极端视角下保持积雪效果
    return mix(combinedFactor, stabilizedNormalFactor, 0.5) * normalThresholdFactor;
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    // 获取法线和深度数据
    vec4 normalData = texture2D(normalBuffer, uv);
    float depth = readDepth(uv);
    
    // 检查alpha值，如果低于阈值则不应用积雪
    if(inputColor.a < alphaTest) {
        outputColor = inputColor;
        return;
    }
    
    // 将深度转换为线性空间
    float linearDepth = linearizeDepth(depth);
    
    // 重建世界坐标 - 用于更稳定的积雪计算
    vec3 worldPos = reconstructWorldPosition(uv, depth);
    
    // 获取法线向量
    vec3 normal = normalize(normalData.xyz * 2.0 - 1.0);
    
    // 生成复杂噪声 - 用于不均匀雪分布
    float complexNoise = generateComplexNoise(uv);
    
    // 使用稳定的积雪计算 - 减少相机角度依赖
    float stableFactor = calculateSnowStableFactor(normal, linearDepth, worldPos);
    
    // 计算雪滑落效果
    float slidingFactor = calculateSnowSliding(normal, worldPos, complexNoise);
    
    // 增加不均匀性 - 使用噪声调整雪分布
    float variationFactor = mix(1.0, complexNoise * 0.7 + 0.5, snowNoisiness);
    
    // 计算积雪因子 - 综合所有效果
    float snowFactor = clamp(stableFactor * slidingFactor * variationFactor * snowAmount, 0.0, 1.0);
    
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