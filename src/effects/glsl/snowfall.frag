uniform sampler2D noiseTexture;
uniform vec2 texelSize;
uniform float time;
uniform float density;
uniform float snowSpeed;
uniform float snowSize;
uniform vec2 windDirection;
uniform vec3 snowColor;
uniform float alphaTest;
uniform int debugMode; // 0=正常模式, 1=显示UV坐标, 2=显示雪花层1, 3=显示雪花层2, 等等
uniform int activeLayer; // 当前活跃的雪花层(0-4)，用于单独调试

varying vec2 vUv;
varying vec2 vUvPattern;

// 雪花函数 - 生成一片雪花
float snowflake(vec2 uv, float scale) {
    vec2 pos = vec2(uv * scale);
    
    // 使用噪声纹理创建随机位置
    vec2 seed = floor(pos);
    // 修改噪声采样坐标计算方式，确保更均匀的分布
    vec3 noise = texture2D(noiseTexture, seed / vec2(scale) * 0.03).rgb;
    
    // 计算雪花位置
    vec2 center = seed + noise.xy;
    
    // 动画 - 下落和飘动
    float t = time * snowSpeed;
    
    // 雪花下落 - 添加变化以使不同位置的雪花速度不同
    center.y -= t + noise.z * 8.0;
    
    // 雪花水平飘动 - 使用风向
    center.x += sin(t * (0.1 + noise.z * 0.1)) * windDirection.x;
    center.y += cos(t * (0.1 + noise.z * 0.1)) * windDirection.y;
    
    // 循环雪花位置
    center = fract(center);
    
    // 计算当前点到雪花中心的距离
    float dist = length(pos - center - 0.5 + noise.xy * 0.2) * 2.0;
    
    // 获取额外的噪声值用于雪花形状变化
    float shapeNoise = noise.z;
    
    // 创建雪花形状 - 根据噪声随机选择不同的形状
    float snowShape;
    
    if (shapeNoise < 0.3) {
        // 标准圆形雪花
        snowShape = 1.0 - smoothstep(0.0, snowSize * (0.3 + noise.z * 0.7), dist);
    } else if (shapeNoise < 0.6) {
        // 六边形形状的雪花
        vec2 hexCoord = pos - center - 0.5;
        float hexDist = max(abs(hexCoord.x), abs(hexCoord.y) * 0.866);
        snowShape = 1.0 - smoothstep(0.0, snowSize * 0.4, hexDist);
    } else {
        // 星形雪花
        vec2 starCoord = pos - center - 0.5;
        float angle = atan(starCoord.y, starCoord.x);
        float starFactor = abs(sin(angle * 4.0)) * 0.5 + 0.5;
        float starDist = dist * (1.0 - starFactor * 0.2);
        snowShape = 1.0 - smoothstep(0.0, snowSize * 0.5, starDist);
    }
    
    return snowShape;
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    // 调试模式 - 显示UV坐标
    if (debugMode == 1) {
        outputColor = vec4(vUv.x, vUv.y, 0.0, 1.0);
        return;
    } else if (debugMode == 2) {
        outputColor = vec4(vUvPattern.x, vUvPattern.y, 0.0, 1.0);
        return;
    }
    
    // 应用透明度测试 - 如果原始颜色的透明度低于阈值，不添加雪花效果
    if(inputColor.a < alphaTest) {
        outputColor = inputColor;
        return;
    }
    
    // 创建多个不同大小的雪花层，使用不同的UV坐标和缩放系数
    float snow = 0.0;
    float layer1 = 0.0, layer2 = 0.0, layer3 = 0.0, layer4 = 0.0, layer5 = 0.0;
    
    // 雪花层1 - 使用基本UV坐标，大尺度
    layer1 = snowflake(vUv, 40.0) * 0.25;
    
    // 雪花层2 - 使用基本UV坐标，中尺度 
    layer2 = snowflake(vUv * 1.2, 25.0) * 0.25;
    
    // 雪花层3 - 使用旋转UV坐标，中小尺度
    layer3 = snowflake(vUvPattern, 15.0) * 0.2;
    
    // 雪花层4 - 使用旋转UV坐标，小尺度
    layer4 = snowflake(vUvPattern * 1.1, 12.0) * 0.15;
    
    // 雪花层5 - 使用混合UV坐标，超小尺度
    layer5 = snowflake(mix(vUv, vUvPattern, 0.5), 8.0) * 0.15;
    
    // 调试模式 - 单独显示某一层雪花
    if (debugMode >= 3 && debugMode <= 7) {
        int layerIndex = debugMode - 3;
        if (layerIndex == 0) snow = layer1 * 4.0;
        else if (layerIndex == 1) snow = layer2 * 4.0;
        else if (layerIndex == 2) snow = layer3 * 5.0;
        else if (layerIndex == 3) snow = layer4 * 6.0;
        else if (layerIndex == 4) snow = layer5 * 6.0;
    }
    // 正常模式 - 根据activeLayer设置显示全部或指定层
    else {
        if (activeLayer == -1 || activeLayer == 0) snow += layer1;
        if (activeLayer == -1 || activeLayer == 1) snow += layer2;
        if (activeLayer == -1 || activeLayer == 2) snow += layer3;
        if (activeLayer == -1 || activeLayer == 3) snow += layer4;
        if (activeLayer == -1 || activeLayer == 4) snow += layer5;
    }
    
    // 应用雪花密度，增加基础可见度
    snow *= density * 1.5;
    
    // 混合输入颜色和雪花颜色
    vec3 finalColor = mix(inputColor.rgb, snowColor, snow);
    
    // 调试模式 - 显示全屏填充的雪花颜色
    if (debugMode == 8) {
        finalColor = snowColor;
    }
    
    outputColor = vec4(finalColor, inputColor.a);
} 