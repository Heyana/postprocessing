uniform vec2 texelSize;
uniform float intensity;
uniform float kernelSize;
uniform bool adaptiveSharpening;
uniform float threshold;

// 亮度计算
float getLuminance(const in vec3 color) {
    return dot(color, vec3(0.2126, 0.7152, 0.0722));
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    // 中心像素
    vec4 center = texture2D(inputBuffer, uv);
    
    // 采样3x3网格周围像素
    vec4 tl = texture2D(inputBuffer, uv + vec2(-1.0, -1.0) * texelSize * kernelSize);
    vec4 t = texture2D(inputBuffer, uv + vec2(0.0, -1.0) * texelSize * kernelSize);
    vec4 tr = texture2D(inputBuffer, uv + vec2(1.0, -1.0) * texelSize * kernelSize);
    vec4 l = texture2D(inputBuffer, uv + vec2(-1.0, 0.0) * texelSize * kernelSize);
    vec4 r = texture2D(inputBuffer, uv + vec2(1.0, 0.0) * texelSize * kernelSize);
    vec4 bl = texture2D(inputBuffer, uv + vec2(-1.0, 1.0) * texelSize * kernelSize);
    vec4 b = texture2D(inputBuffer, uv + vec2(0.0, 1.0) * texelSize * kernelSize);
    vec4 br = texture2D(inputBuffer, uv + vec2(1.0, 1.0) * texelSize * kernelSize);
    
    // 基本3x3锐化卷积核
    vec4 sharpen = 9.0 * center - tl - t - tr - l - r - bl - b - br;
    
    // 自适应锐化 - 根据局部对比度调整强度
    float currentIntensity = intensity;
    
    if (adaptiveSharpening) {
        float centerLuma = getLuminance(center.rgb);
        float avgLuma = (
            getLuminance(tl.rgb) + getLuminance(t.rgb) + getLuminance(tr.rgb) +
            getLuminance(l.rgb) + getLuminance(r.rgb) +
            getLuminance(bl.rgb) + getLuminance(b.rgb) + getLuminance(br.rgb)
        ) / 8.0;
        
        // 局部对比度
        float contrast = abs(centerLuma - avgLuma);
        
        // 根据对比度调整强度 - 高对比度区域少锐化，低对比度区域多锐化
        currentIntensity *= smoothstep(0.0, threshold, contrast);
    }
    
    // 应用锐化，保证结果在有效范围内
    outputColor = center + sharpen * currentIntensity;
}