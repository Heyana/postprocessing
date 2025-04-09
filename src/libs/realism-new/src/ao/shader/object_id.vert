void main() {
    // 直接传递顶点位置
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
} 