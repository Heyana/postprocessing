uniform sampler2D noiseTexture;
uniform vec2 texelSize;
uniform float time;
uniform float intensity;
uniform float rainSpeed;
uniform float rainSize;
uniform vec2 windDirection;
uniform float rainAngle;
uniform vec3 rainColor;
uniform float wetness;
uniform float puddleIntensity;
uniform float mistIntensity;
uniform int enableLighting;
uniform float lightningFrequency;
uniform vec3 lightningColor;
uniform float lightningTime;
uniform float lightningFlash;

varying vec2 vUv;
varying vec2 vUvPattern;

// 生成雨滴
float generateRaindrop(vec2 uv, float layer, float time) {
    // 为每层应用不同的缩放和偏移
    vec2 scaledUv = uv * (20.0 + layer * 10.0);
    vec2 cellId = floor(scaledUv);
    vec2 cellUv = fract(scaledUv);
    
    // 从噪声纹理获取随机值
    vec3 noise = texture2D(noiseTexture, cellId / (20.0 + layer * 10.0) * 0.1).rgb;
    
    // 雨滴位置偏移
    vec2 offset = noise.xy * 0.8;
    
    // 雨滴下落动画
    float fallTime = time * rainSpeed * (0.8 + noise.z * 0.4);
    offset.y = mod(offset.y - fallTime, 1.0);
    
    // 风向影响
    offset.x += sin(fallTime * 0.5 + noise.x * 6.28) * windDirection.x * 0.3;
    offset.x += windDirection.x * (offset.y - 0.5) * 0.2; // 倾斜效果
    
    // 计算到雨滴中心的距离
    vec2 dropCenter = cellUv - offset;
    
    // 雨滴形状：椭圆形模拟运动模糊
    float aspectRatio = 0.3 + noise.z * 0.2; // 雨滴的长宽比
    dropCenter.y *= aspectRatio; // 垂直压缩
    
    // 应用雨滴角度 - 手动矩阵乘法避免兼容性问题
    float c = cos(rainAngle);
    float s = sin(rainAngle);
    vec2 rotatedDropCenter;
    rotatedDropCenter.x = c * dropCenter.x - s * dropCenter.y;
    rotatedDropCenter.y = s * dropCenter.x + c * dropCenter.y;
    dropCenter = rotatedDropCenter;
    
    float dropDist = length(dropCenter);
    float dropSize = rainSize * (0.7 + noise.z * 0.6) * (1.0 - layer * 0.2);
    
    // 雨滴强度
    float drop = 1.0 - smoothstep(0.0, dropSize, dropDist);
    drop *= drop; // 增强中心亮度
    
    return drop;
}

// 生成雨雾效果
float generateMist(vec2 uv, float time) {
    vec2 mistUv = uv * 3.0 + vec2(time * 0.1, time * 0.05);
    vec3 noise1 = texture2D(noiseTexture, mistUv * 0.5).rgb;
    vec3 noise2 = texture2D(noiseTexture, mistUv * 1.5 + 0.5).rgb;
    
    float mist = (noise1.r + noise2.g * 0.5) * 0.5;
    mist = smoothstep(0.3, 0.8, mist);
    
    return mist * mistIntensity;
}

// 生成积水反射效果
vec3 generatePuddles(vec2 uv, vec3 inputColor) {
    vec2 puddleUv = uv * 8.0;
    vec3 puddleNoise = texture2D(noiseTexture, puddleUv * 0.2).rgb;
    
    // 积水区域
    float puddleShape = smoothstep(0.4, 0.6, puddleNoise.r) * puddleIntensity;
    
    // 水面波纹
    vec2 ripple = sin(uv * 50.0 + time * 3.0) * 0.02 * puddleShape;
    
    // 反射效果
    vec3 reflectionColor = inputColor * 0.6 + vec3(0.2, 0.3, 0.4) * 0.4;
    
    return mix(inputColor, reflectionColor, puddleShape * wetness);
}

// 闪电效果
vec3 generateLightning(vec2 uv, vec3 color) {
    if (enableLighting == 0 || lightningFlash <= 0.0) {
        return color;
    }
    
    // 闪电分支形状
    float lightning = 0.0;
    for (int i = 0; i < 3; i++) {
        float branch = float(i) * 0.3;
        vec2 lightningUv = uv + vec2(branch, sin(uv.y * 10.0 + branch) * 0.05);
        
        float dist = abs(lightningUv.x - 0.5 - sin(lightningUv.y * 5.0 + time * 10.0) * 0.1);
        lightning += exp(-dist * 200.0) * (1.0 - float(i) * 0.3);
    }
    
    // 整体闪电亮度
    float flash = lightningFlash * (0.5 + 0.5 * sin(time * 50.0));
    lightning *= flash;
    
    // 环境照明
    float ambientFlash = lightningFlash * 0.3 * (1.0 + sin(time * 30.0) * 0.5);
    
    return color + lightningColor * lightning + color * lightningColor * ambientFlash;
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    vec3 color = inputColor.rgb;
    
    if (intensity <= 0.0) {
        outputColor = inputColor;
        return;
    }
    
    // 生成多层雨滴
    float rain = 0.0;
    
    // 前景雨滴 - 大且清晰
    rain += generateRaindrop(vUv, 0.0, time) * 0.8;
    
    // 中景雨滴 - 中等大小
    rain += generateRaindrop(vUv * 1.3, 1.0, time * 1.1) * 0.6;
    
    // 背景雨滴 - 小且模糊
    rain += generateRaindrop(vUvPattern, 2.0, time * 0.9) * 0.4;
    
    // 远景雨滴 - 非常小
    rain += generateRaindrop(vUvPattern * 0.8, 3.0, time * 1.2) * 0.2;
    
    // 应用强度
    rain *= intensity;
    
    // 雨雾效果
    float mist = generateMist(uv, time);
    
    // 湿润和积水效果
    color = generatePuddles(uv, color);
    
    // 应用湿润效果（增强对比度和饱和度）
    if (wetness > 0.0) {
        // 增强反射
        color *= 1.0 + wetness * 0.2;
        // 轻微的蓝色调
        color = mix(color, color * vec3(0.9, 0.95, 1.1), wetness * 0.1);
    }
    
    // 添加雨雾
    color = mix(color, vec3(0.7, 0.8, 0.9), mist);
    
    // 混合雨滴
    vec3 dropColor = rainColor;
    color = mix(color, dropColor, rain);
    
    // 闪电效果
    color = generateLightning(uv, color);
    
    // 整体雨天色调调整
    if (intensity > 0.0) {
        // 降低亮度，增加灰色调
        color *= 1.0 - intensity * 0.2;
        color = mix(color, vec3(dot(color, vec3(0.299, 0.587, 0.114))), intensity * 0.1);
    }
    
    outputColor = vec4(color, inputColor.a);
}
