uniform vec2 texelSize;
uniform float intensity;
uniform float kernelSize;

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    // 中心像素
    vec4 center = texture2D(inputBuffer, uv);
    
    // 采样周围像素
    vec4 top = texture2D(inputBuffer, uv + vec2(0.0, -1.0) * texelSize * kernelSize);
    vec4 bottom = texture2D(inputBuffer, uv + vec2(0.0, 1.0) * texelSize * kernelSize);
    vec4 left = texture2D(inputBuffer, uv + vec2(-1.0, 0.0) * texelSize * kernelSize);
    vec4 right = texture2D(inputBuffer, uv + vec2(1.0, 0.0) * texelSize * kernelSize);
    
    // 计算拉普拉斯算子
    vec4 laplacian = 4.0 * center - top - bottom - left - right;
    
    // 应用锐化
    outputColor = center + laplacian * intensity;
}