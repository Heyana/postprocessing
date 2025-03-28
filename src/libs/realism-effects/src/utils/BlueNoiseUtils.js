/* eslint-disable camelcase */
import { NearestFilter, NoColorSpace, RepeatWrapping, TextureLoader, Vector2, DataTexture, RGBAFormat } from "three"
import blue_noise from "./shader/blue_noise.glsl"
import { blueNoiseBase64 } from "./TextureAssets"
const blueNoiseSize = 128
const highestSignedInt = 0x7fffffff

// 创建内联蓝噪声纹理
function createBlueNoiseTexture() {
	// 这里我们创建一个随机的蓝噪声纹理作为备用
	// 实际的蓝噪声应该使用更复杂的算法，但这里我们使用随机数据作为替代
	const size = blueNoiseSize;
	const data = new Uint8Array(size * size * 4);

	// 填充随机RGBA值
	for (let i = 0; i < size * size * 4; i += 4) {
		// 随机的蓝噪声模式
		const value = Math.floor(Math.random() * 255);
		data[i] = value;     // R
		data[i + 1] = value; // G
		data[i + 2] = value; // B
		data[i + 3] = 255;   // A (完全不透明)
	}

	const texture = new DataTexture(data, size, size, RGBAFormat);
	texture.minFilter = NearestFilter;
	texture.magFilter = NearestFilter;
	texture.wrapS = RepeatWrapping;
	texture.wrapT = RepeatWrapping;
	texture.colorSpace = NoColorSpace;
	texture.needsUpdate = true;

	return texture;
}

// 首先尝试加载外部纹理，如果失败则使用内联纹理
let blueNoiseTexture = null;
const blueNoiseTexturePromise = new Promise((resolve) => {
	// 创建内联纹理作为默认值
	blueNoiseTexture = createBlueNoiseTexture();

	// 使用与ssr-effect.js相同的路径格式
	// const texturePath = document.baseURI + "img/textures/noise/blue_noise_rgba.png";


	// 尝试加载外部纹理
	new TextureLoader().load(blueNoiseBase64,
		// 成功加载
		(texture) => {
			console.log("成功加载蓝噪声纹理");
			texture.minFilter = NearestFilter;
			texture.magFilter = NearestFilter;
			texture.wrapS = RepeatWrapping;
			texture.wrapT = RepeatWrapping;
			texture.colorSpace = NoColorSpace;
			blueNoiseTexture = texture;
			resolve(texture);
		},
		// 加载进度
		undefined,
		// 加载失败
		(error) => {
			console.warn("加载蓝噪声纹理失败，使用内联纹理:", error);
			resolve(blueNoiseTexture);
		}
	);
});

let isBlueNoiseLoaded = false;
let pendingMaterials = [];

blueNoiseTexturePromise.then(() => {
	isBlueNoiseLoaded = true;
	pendingMaterials.forEach(material => {
		updateMaterialWithBlueNoise(material);
	});
	pendingMaterials = [];
});

export const setupBlueNoise = fragmentShader => {
	let blueNoiseIndex = 0
	const startIndex = Math.floor(Math.random() * highestSignedInt)

	const uniforms = {
		blueNoiseTexture: { value: blueNoiseTexture },
		blueNoiseSize: { value: new Vector2(blueNoiseSize, blueNoiseSize) },
		blueNoiseIndex: {
			get value() {
				blueNoiseIndex = (startIndex + blueNoiseIndex + 1) % highestSignedInt
				return blueNoiseIndex
			},
			set value(v) {
				blueNoiseIndex = v
			}
		}
	}

	fragmentShader = fragmentShader.replace("uniform vec2 resolution;", "uniform vec2 resolution;\n" + blue_noise)

	return { uniforms, fragmentShader }
}

function updateMaterialWithBlueNoise(material) {
	const { fragmentShader, uniforms } = setupBlueNoise(material.fragmentShader);
	material.fragmentShader = fragmentShader;
	material.uniforms = { ...material.uniforms, ...uniforms };
	material.needsUpdate = true;
}

export const useBlueNoise = material => {
	if (isBlueNoiseLoaded) {
		updateMaterialWithBlueNoise(material);
	} else {
		pendingMaterials.push(material);
	}
}
