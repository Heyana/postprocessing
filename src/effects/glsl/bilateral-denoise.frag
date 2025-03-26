uniform vec2 texelSize;
uniform float radius;
uniform float strength;
uniform bool luminanceOnly;
uniform float edgePreservation;

// 获取亮度函数
float getLuminance(const in vec3 color) {
    return dot(color, vec3(0.2126, 0.7152, 0.0722));
}

// RGB转YCbCr（如果仅处理亮度通道）
vec3 rgbToYCbCr(const in vec3 rgb) {
    float y = getLuminance(rgb);
    float cb = 0.5 + (rgb.b - y) * 0.564;
    float cr = 0.5 + (rgb.r - y) * 0.713;
    return vec3(y, cb, cr);
}

// YCbCr转RGB
vec3 yCbCrToRgb(const in vec3 yCbCr) {
    float y = yCbCr.x;
    float cb = yCbCr.y - 0.5;
    float cr = yCbCr.z - 0.5;
    
    float r = y + 1.403 * cr;
    float g = y - 0.344 * cb - 0.714 * cr;
    float b = y + 1.770 * cb;
    
    return vec3(r, g, b);
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    // 中心像素
    vec4 centerColor = texture2D(inputBuffer, uv);
    
    // 如果仅处理亮度通道，则转换为YCbCr
    vec3 centerYCbCr = luminanceOnly ? rgbToYCbCr(centerColor.rgb) : centerColor.rgb;
    
    // 双边滤波设置
    float sigmaSpace = radius;
    float sigmaColor = 0.1 + (1.0 - edgePreservation) * 0.2;
    
    // 定义滤波内核大小
    const int kernelSize = 9; // 实际半径: (kernelSize - 1) / 2
    const int kernelRadius = 4;
    
    // 累积变量
    vec3 filteredColor = vec3(0.0);
    float totalWeight = 0.0;
    
    // 双边滤波循环
    for(int offsetX = -kernelRadius; offsetX <= kernelRadius; offsetX++) {
        for(int offsetY = -kernelRadius; offsetY <= kernelRadius; offsetY++) {
            // 样本位置
            vec2 sampleUv = uv + vec2(float(offsetX), float(offsetY)) * texelSize * radius / float(kernelRadius);
            
            // 样本颜色
            vec4 sampleColor = texture2D(inputBuffer, sampleUv);
            vec3 sampleYCbCr = luminanceOnly ? rgbToYCbCr(sampleColor.rgb) : sampleColor.rgb;
            
            // 计算空间权重（基于距离）
            float distSquared = float(offsetX * offsetX + offsetY * offsetY);
            float spatialWeight = exp(-distSquared / (2.0 * sigmaSpace * sigmaSpace));
            
            // 计算范围权重（基于颜色差异）
            vec3 colorDiff = centerYCbCr - sampleYCbCr;
            float colorDistSquared = dot(colorDiff, colorDiff);
            float rangeWeight = exp(-colorDistSquared / (2.0 * sigmaColor * sigmaColor));
            
            // 计算总权重
            float weight = spatialWeight * rangeWeight;
            
            // 累积加权颜色
            filteredColor += (luminanceOnly ? sampleYCbCr : sampleColor.rgb) * weight;
            totalWeight += weight;
        }
    }
    
    // 归一化结果
    filteredColor /= totalWeight;
    
    // 如果仅处理亮度通道，则转换回RGB
    vec3 resultColor = luminanceOnly ? yCbCrToRgb(filteredColor) : filteredColor;
    
    // 混合原始颜色和滤波后的颜色
    vec3 finalColor = mix(centerColor.rgb, resultColor, strength);
    
    // 输出结果
    outputColor = vec4(finalColor, centerColor.a);
} 