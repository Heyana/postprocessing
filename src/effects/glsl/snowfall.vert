uniform vec2 texelSize;

varying vec2 vUv;
varying vec2 vUvPattern;

void mainSupport(const in vec2 uv) {
    // 基本UV坐标
    vUv = uv;
    
    // 用于雪花图案的稍微旋转的UV坐标
    float angle = 0.15; // 轻微旋转
    mat2 rotation = mat2(
        cos(angle), -sin(angle),
        sin(angle), cos(angle)
    );
    
    // 旋转并稍微缩放UV以获得更多变化
    vUvPattern = (rotation * (uv - 0.5) * 1.1) + 0.5;
}

void main() {
    // 根据正规化设备坐标计算UV
    vec2 uv = position.xy * 0.5 + 0.5;
    
    // 调用辅助函数处理UV
    mainSupport(uv);
    
    // 设置顶点位置
    gl_Position = vec4(position.xy, 1.0, 1.0);
} 