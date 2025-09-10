uniform float time;

varying vec2 vUv;
varying vec2 vUvPattern;

void mainSupport(const in vec2 uv) {
    // 基本UV坐标
    vUv = uv;
    
    // 创建旋转的UV坐标用于不同的雨滴图案
    float rotation = time * 0.1;
    float cos_r = cos(rotation);
    float sin_r = sin(rotation);
    
    vec2 center = vec2(0.5, 0.5);
    vec2 rotatedUv = uv - center;
    
    // 手动执行矩阵乘法，避免mat2构造函数的兼容性问题
    vec2 rotatedResult;
    rotatedResult.x = cos_r * rotatedUv.x - sin_r * rotatedUv.y;
    rotatedResult.y = sin_r * rotatedUv.x + cos_r * rotatedUv.y;
    
    vUvPattern = rotatedResult + center;
}

void main() {
    // 根据正规化设备坐标计算UV
    vec2 uv = position.xy * 0.5 + 0.5;
    
    // 调用辅助函数处理UV
    mainSupport(uv);
    
    // 设置顶点位置
    gl_Position = vec4(position.xy, 1.0, 1.0);
}
