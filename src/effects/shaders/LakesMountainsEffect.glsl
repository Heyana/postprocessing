// Sky and Fog Effect (修改自 Lakes and Mountains Effect)
// 仅保留雾气效果部分

uniform float time;           // 替代 iTime
uniform vec2 resolution;      // 替代 iResolution
uniform sampler2D noiseTexture; // 替代 iChannel0

// 相机参数 - 从Three.js传入
uniform vec3 cameraPosition;
uniform mat4 viewMatrix;      // 注意：这里实际存储的是相机的世界矩阵(matrixWorld)
uniform float cameraFov;

// 效果参数
uniform float fogDensity;     // 雾气密度
uniform vec3 fogColor;        // 雾气颜色
uniform float fogDecay;       // 雾气衰减速度
uniform float fogMinDist;     // 雾气最小距离
uniform float quality;        // 质量设置 (0-低, 1-中, 2-高)
uniform float occludeSky;     // 雾气遮挡天空的程度 (0-1)

// 高度雾参数
uniform bool useHeightFog;    // 是否使用高度雾
uniform bool combineFog;      // 是否同时启用普通雾和高度雾（叠加显示）
uniform float fogMaxHeight;   // 雾气最大高度
uniform float fogMinHeight;   // 雾气最小高度，低于此高度不会有雾
uniform float fogNoiseScale;  // 雾气噪声缩放
uniform float fogNoiseStrength; // 雾气噪声强度
uniform float heightFogStrength; // 高度雾强度
uniform float heightFogDecay;   // 高度雾衰减速度
uniform float heightFogMinDist; // 高度雾最小距离
uniform float heightFogMaxDist; // 高度雾最大距离
uniform float heightFogTransition; // 高度雾过渡距离，控制上下边缘的平滑过渡

// 噪声函数
float hash(float n) {
    return fract(sin(n)*43758.5453123);
}

float noise(in vec2 x) {
    vec2 p = floor(x);
    vec2 f = fract(x);
    f = f*f*(3.0-2.0*f);
    float n = p.x + p.y*57.0;
    float res = mix(mix(hash(n+  0.0), hash(n+  1.0), f.x),
                    mix(hash(n+ 57.0), hash(n+ 58.0), f.x), f.y);
    return res;
}

float noiseHigh(in vec3 x) {
    vec3 p = floor(x);
    vec3 f = fract(x);
    f = f*f*(3.0-2.0*f);
    float n = p.x + p.y*57.0 + 113.0*p.z;
    float res = mix(mix(mix(hash(n+  0.0), hash(n+  1.0), f.x),
                        mix(hash(n+ 57.0), hash(n+ 58.0), f.x), f.y),
                    mix(mix(hash(n+113.0), hash(n+114.0), f.x),
                        mix(hash(n+170.0), hash(n+171.0), f.x), f.y), f.z);
    return res;
}

// 重建世界坐标的函数 - 改进版本
vec3 reconstructWorldPos(vec2 uv, float depth) {
    // 计算NDC空间的坐标 (-1 到 1 的范围)
    float z = depth * 2.0 - 1.0;
    vec2 screenPos = uv * 2.0 - 1.0;
    
    // 在相机空间中的射线方向 - 使用更精确的计算
    float fovFactor = tan(radians(cameraFov * 0.5));
    vec3 viewDir = normalize(vec3(
        screenPos.x * resolution.x / resolution.y * fovFactor, 
        screenPos.y * fovFactor, 
        -1.0
    ));
    
    // 线性深度计算 - 更精确版本，尽量减少浮点精度问题
    float linearDepth = 2.0 * cameraNear * cameraFar / 
        (cameraFar + cameraNear - z * (cameraFar - cameraNear));
    
    // 计算相机空间的位置 - 使用标准化方向乘以线性深度
    vec3 cameraSpacePos = viewDir * linearDepth;
    
    // 转换为世界空间 - 确保使用正确的相机位置和方向
    return cameraPosition + (viewMatrix * vec4(cameraSpacePos, 0.0)).xyz;
}

// 计算雾因子的函数，应用自定义的雾参数
float calculateFogFactor(float linearDepth) {
    // 考虑最小距离
    float adjustedDepth = max(0.0, linearDepth - fogMinDist);
    
    // 使用指数函数计算雾量 - 更加平滑，减少角度依赖
    // 将fogDensity和fogDecay结合为单一系数，简化计算
    float fogAmount = 1.0 - exp(-adjustedDepth * fogDensity * fogDecay);
    
    // 确保雾限制在合理范围内
    return clamp(fogAmount, 0.0, 1.0);
}

// 计算高度雾因子 - 修改版本
float calculateHeightFogFactor(vec3 worldPos, float linearDepth) {
    // 修改距离判断逻辑 - 减少对高度雾的影响
    float distFactor = 1.0;
    if (linearDepth < heightFogMinDist) {
        distFactor = smoothstep(0.0, heightFogMinDist, linearDepth);
    } else if (linearDepth > heightFogMaxDist) {
        // 使用更缓慢的衰减，减少对大范围的敏感性
        distFactor = 1.0 - smoothstep(heightFogMaxDist * 0.9, heightFogMaxDist * 1.1, linearDepth);
    }
    
    // 获取噪声值，用于扰动高度
    float noiseValue = noise(worldPos.xz * fogNoiseScale) * fogNoiseStrength;
    
    // 计算实际高度，添加噪声扰动
    float adjustedHeight = worldPos.y + noiseValue;
    
    // 使用过渡距离参数计算平滑的高度因子
    float lowerTransitionStart = fogMinHeight;
    float lowerTransitionEnd = fogMinHeight + heightFogTransition;
    float upperTransitionStart = fogMaxHeight - heightFogTransition;
    float upperTransitionEnd = fogMaxHeight;
    
    float heightFactor = 0.0;
    
    // 下边缘过渡区域
    if (adjustedHeight >= lowerTransitionStart && adjustedHeight <= lowerTransitionEnd) {
        // 在下边缘平滑过渡区内，使用平滑步进
        heightFactor = smoothstep(lowerTransitionStart, lowerTransitionEnd, adjustedHeight);
    } 
    // 中间完全雾化区域
    else if (adjustedHeight > lowerTransitionEnd && adjustedHeight < upperTransitionStart) {
        // 在中间区域，保持完全雾化
        heightFactor = 1.0;
    } 
    // 上边缘过渡区域
    else if (adjustedHeight >= upperTransitionStart && adjustedHeight <= upperTransitionEnd) {
        // 在上边缘平滑过渡区内，使用平滑步进的反向版本
        heightFactor = 1.0 - smoothstep(upperTransitionStart, upperTransitionEnd, adjustedHeight);
    }
    
    // 使用新的角度无关的计算方式
    // 保持基于距离的衰减，但移除对视角的直接依赖
    float baseIntensity = heightFogStrength * heightFactor * distFactor;
    float fogAmount = 1.0 - exp(-baseIntensity * heightFogDecay);
    
    return clamp(fogAmount, 0.0, 1.0);
}

// PostProcessing框架的主函数
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    // 根据深度混合场景
    if (USE_DEPTH == 1) {
        // 读取深度
        float depth = texture2D(depthBuffer, uv).r;
        
        // 将深度转换为线性深度 - 使用更稳定的计算方式
        // 这种方式更不容易受到浮点精度问题的影响
        float linearDepth;
        if (depth >= 0.9999) {
            // 对于远处(天空)使用最大值
            linearDepth = 1.0;
        } else {
            // 标准线性深度计算
            float z = depth * 2.0 - 1.0;
            linearDepth = 2.0 * cameraNear * cameraFar / 
                (cameraFar + cameraNear - z * (cameraFar - cameraNear));
            // 归一化，但使用更大的缩放因子来提高近处的精度
            linearDepth = linearDepth / (cameraFar * 2.0); 
            linearDepth = clamp(linearDepth, 0.0, 0.5);
            // 重新映射到0-1范围
            linearDepth = linearDepth * 2.0;
        }
        
        // 基于深度的混合
        float skyMask = step(0.9999, depth); // 天空部分（最远处）
        
        float fogFactor;
        
        // 根据设置决定使用哪种雾算法
        if (useHeightFog && depth < 0.9999) {
            // 使用高度雾 - 先重建世界坐标
            vec3 worldPos = reconstructWorldPos(uv, depth);
            
            // 使用修改后的计算方式获取高度雾因子
            float heightFogFactor = calculateHeightFogFactor(worldPos, linearDepth);
            
            // 确保天空区域不受高度雾影响，除非特别设置了天空遮挡
            if (skyMask > 0.5 && occludeSky <= 0.0) {
                heightFogFactor = 0.0;
            }
            
            // 判断是否同时使用普通雾和高度雾
            if (combineFog) {
                // 计算普通雾的雾因子
                float standardFogFactor = calculateFogFactor(linearDepth);
                
                // 混合两种雾因子 - 使用屏幕空间混合模式，使两种雾叠加而不过度强化
                // 公式: 1.0 - (1.0 - a) * (1.0 - b)，类似于Photoshop的"变亮"混合模式
                fogFactor = 1.0 - (1.0 - heightFogFactor) * (1.0 - standardFogFactor);
            } else {
                // 仅使用高度雾
                fogFactor = heightFogFactor;
            }
        } else {
            // 使用标准雾
            fogFactor = calculateFogFactor(linearDepth);
        }
        
        // 应用雾效果到输入颜色
        vec3 foggedScene = mix(inputColor.rgb, fogColor, fogFactor);
        outputColor = vec4(foggedScene, inputColor.a);
    } else {
        // 不使用深度时直接返回输入颜色
        outputColor = inputColor;
    }
} 