#ifdef FRAMEBUFFER_PRECISION_HIGH

	uniform mediump sampler2D map;

#else

	uniform lowp sampler2D map;

#endif

uniform float intensity;
uniform vec3 bloomColor;

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {

	// 获取泛光纹理
	// composite shader 的输出已经包含了 bloomStrength 和 bloomTintColors
	// 格式：bloomStrength * (lerpBloomFactor * tintColor * blurTexture for each MIP)
	vec4 bloomTexel = texture2D(map, uv);
	
	// 应用额外的颜色和强度调整（如果需要）
	// composite shader 已经应用了 bloomStrength，所以这里只做微调
	vec3 bloom = bloomTexel.rgb * bloomColor * intensity;

	// 使用深度信息来限制泛光，避免穿透到被遮挡的区域
	// 比较选中对象的深度和场景深度，只让泛光出现在选中对象的深度范围内
	#ifdef USE_DEPTH
		float sceneDepth = texture2D(depthBuffer, uv).r;
		// 如果场景深度接近1.0（背景/天空），则允许泛光
		// 如果场景深度较近（有对象在选中对象前面），则减少泛光
		// 这样可以避免泛光穿透到前景对象前面
		float depthFactor = smoothstep(0.95, 1.0, sceneDepth);
		bloom *= depthFactor;
	#endif

	// 输出泛光纹理，让 blendFunction 来处理混合
	// 使用 ADD blendFunction 时，会执行：inputColor + bloom
	// 这完全模拟了 UnrealBloomPass 的 AdditiveBlending 行为
	outputColor = vec4(bloom, bloomTexel.a);

}

