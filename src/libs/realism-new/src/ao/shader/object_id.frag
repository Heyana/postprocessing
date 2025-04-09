uniform float objectId;

void main() {
    // 简单地输出一个固定值作为对象ID
    // 对于被选中的对象，会输出1.0，其他对象为0.0
    gl_FragColor = vec4(objectId, 0.0, 0.0, 1.0);
} 