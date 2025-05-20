import { Vector3, Matrix4, MathUtils } from "three";

/**
 * 天空大气效果工具类
 * 提供太阳/月亮位置计算、预设和其他实用函数
 */
export class SkyAtmosphereUtils {

	/**
     * 计算太阳位置
     * @param {Object} sunParams - 太阳高度角和方位角参数
     * @param {Number} sunParams.elevation - 高度角（度）
     * @param {Number} sunParams.azimuth - 方位角（度）
     * @returns {Vector3} 归一化的太阳位置向量
     */
	static calculateSunPosition(sunParams) {

		const phi = MathUtils.degToRad(90 - sunParams.elevation);
		const theta = MathUtils.degToRad(sunParams.azimuth);

		const x = Math.sin(phi) * Math.cos(theta);
		const y = Math.cos(phi);
		const z = Math.sin(phi) * Math.sin(theta);

		return new Vector3(x, y, z).normalize();

	}

	/**
     * 计算月亮位置
     * @param {Object} moonParams - 月亮高度角和方位角参数
     * @param {Number} moonParams.elevation - 高度角（度）
     * @param {Number} moonParams.azimuth - 方位角（度）
     * @param {Vector3} [moonOffset=new Vector3(0,0,0)] - 月亮位置偏移量（弧度）
     * @returns {Vector3} 归一化的月亮位置向量
     */
	static calculateMoonPosition(moonParams, moonOffset = new Vector3(0, 0, 0)) {

		const phi = MathUtils.degToRad(90 - moonParams.elevation);
		const theta = MathUtils.degToRad(moonParams.azimuth);

		const x = Math.sin(phi) * Math.cos(theta);
		const y = Math.cos(phi);
		const z = Math.sin(phi) * Math.sin(theta);

		const moonPosition = new Vector3(x, y, z);

		// 应用偏移量（如果有）
		if(moonOffset && (moonOffset.x !== 0 || moonOffset.y !== 0 || moonOffset.z !== 0)) {

			// 创建旋转矩阵
			const rotationMatrixX = new Matrix4().makeRotationX(moonOffset.x);
			const rotationMatrixY = new Matrix4().makeRotationY(moonOffset.y);
			const rotationMatrixZ = new Matrix4().makeRotationZ(moonOffset.z);

			// 应用旋转
			moonPosition.applyMatrix4(rotationMatrixX);
			moonPosition.applyMatrix4(rotationMatrixY);
			moonPosition.applyMatrix4(rotationMatrixZ);

		}

		return moonPosition.normalize();

	}

	/**
     * 从太阳位置计算对应的月亮位置（反向）
     * @param {Vector3} sunPosition - 太阳位置向量
     * @param {Vector3} [moonOffset=new Vector3(0,0,0)] - 月亮位置偏移量（弧度）
     * @returns {Vector3} 月亮位置向量
     */
	static calculateMoonPositionFromSun(sunPosition, moonOffset = new Vector3(0, 0, 0)) {

		// 获取太阳的位置参数
		const sunX = sunPosition.x;
		const sunY = sunPosition.y;
		const sunZ = sunPosition.z;

		// 计算月亮位置 - 从太阳下山的地方升起
		// 保持X和Z方向，但Y方向相反
		const moonY = (sunY < 0) ? Math.abs(sunY) : -sunY;

		// 创建月亮基础位置 - 保持XZ方向，Y方向相反
		const baseMoonPosition = new Vector3(
			sunX,
			moonY,
			sunZ
		);

		// 应用偏移量（如果有）
		if(moonOffset && (moonOffset.x !== 0 || moonOffset.y !== 0 || moonOffset.z !== 0)) {

			// 创建旋转矩阵
			const rotationMatrixX = new Matrix4().makeRotationX(moonOffset.x);
			const rotationMatrixY = new Matrix4().makeRotationY(moonOffset.y);
			const rotationMatrixZ = new Matrix4().makeRotationZ(moonOffset.z);

			// 应用旋转
			baseMoonPosition.applyMatrix4(rotationMatrixX);
			baseMoonPosition.applyMatrix4(rotationMatrixY);
			baseMoonPosition.applyMatrix4(rotationMatrixZ);

		}

		return baseMoonPosition.normalize();

	}

	/**
     * 计算一年中的天数
     * @param {Number} year - 年
     * @param {Number} month - 月
     * @param {Number} day - 日
     * @return {Number} 一年中的天数（1-366）
     */
	static getDayOfYear(year, month, day) {

		const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
		const daysInMonth = [0, 31, isLeapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

		let dayOfYear = day;
		for(let i = 1; i < month; i++) {

			dayOfYear += daysInMonth[i];

		}

		return dayOfYear;

	}

	/**
     * 根据日期计算太阳位置
     * 使用简化的天文算法计算太阳位置
     * @param {Date} date - 日期时间对象
     * @param {Number} latitude - 纬度（度）
     * @param {Number} longitude - 经度（度）
     * @return {Vector3} 太阳位置方向向量
     */
	static calculateSunPositionFromDate(date, latitude, longitude) {

		// 将纬度和经度转换为弧度
		const lat = latitude * Math.PI / 180;
		const lon = longitude * Math.PI / 180;

		// 获取当前的日期信息
		const year = date.getFullYear();
		const month = date.getMonth() + 1;
		const day = date.getDate();
		const hours = date.getHours();
		const minutes = date.getMinutes();
		const seconds = date.getSeconds();

		// 计算一年中的天数
		const dayOfYear = this.getDayOfYear(year, month, day);

		// 计算当前时间（小时）
		const currentTime = hours + minutes / 60 + seconds / 3600;

		// 计算太阳的赤纬角
		// 使用更精确的太阳赤纬角计算公式
		const declination = 0.4093 * Math.sin(2 * Math.PI * (dayOfYear - 81) / 365);

		// 计算时角 - 修正时角计算，考虑地球自转方向
		// 正午时太阳在天顶，午夜时太阳在地平线下方
		// 12小时对应0时角，向前和向后每小时15度
		const hourAngle = (12 - currentTime) * 15 * Math.PI / 180;

		// 计算太阳的高度角和方位角
		const sinHeight = Math.sin(lat) * Math.sin(declination) + Math.cos(lat) * Math.cos(declination) * Math.cos(hourAngle);
		const height = Math.asin(sinHeight);

		const sinAzimuth = Math.cos(declination) * Math.sin(hourAngle) / Math.cos(height);
		const cosAzimuth = (Math.sin(declination) - Math.sin(lat) * sinHeight) / (Math.cos(lat) * Math.cos(height));
		let azimuth = Math.atan2(sinAzimuth, cosAzimuth);

		// 将方位角转换为0-2π范围
		if(azimuth < 0) { azimuth += 2 * Math.PI; }

		// 转换为笛卡尔坐标系
		const x = Math.cos(height) * Math.sin(azimuth);
		const y = Math.sin(height);
		const z = Math.cos(height) * Math.cos(azimuth);

		return new Vector3(x, y, z).normalize();

	}

	/**
     * 获取太阳位置的高度角和方位角
     * @param {Vector3} sunPosition - 太阳位置向量
     * @returns {Object} 包含elevation（高度角）和azimuth（方位角）的对象
     */
	static getSunAngles(sunPosition) {

		// 确保位置向量已归一化
		const position = sunPosition.clone().normalize();

		// 计算高度角（弧度）
		const elevation = Math.asin(position.y);

		// 计算方位角（弧度）
		let azimuth = Math.atan2(position.x, position.z);

		// 将方位角转换为0-2π范围
		if(azimuth < 0) { azimuth += 2 * Math.PI; }

		// 将弧度转换为度
		return {
			elevation: 90 - MathUtils.radToDeg(Math.acos(position.y)), // 高度角
			azimuth: MathUtils.radToDeg(azimuth) // 方位角
		};

	}

	/**
     * 根据太阳高度自动调整场景参数
     * @param {Object} effect - 天空大气效果实例
     * @param {Number} sunHeight - 太阳高度（-1到1之间）
     */
	static autoAdjustParameters(effect, sunHeight) {

		// 白天
		if(sunHeight > 0.1) {

			effect.enableStars = false;
			effect.enableMoon = false;
			effect.enableAurora = false;

			// 如果太阳很高，增加亮度
			if(sunHeight > 0.5) {

				effect.sunBrightness = 3.0 + (sunHeight - 0.5) * 2;

			} else {

				effect.sunBrightness = 3.0;

			}

		}
		// 日落/日出
		else if(sunHeight > -0.1) {

			effect.enableStars = sunHeight < 0.05;
			effect.enableMoon = sunHeight < 0.02;
			effect.enableAurora = false;

			// 日落/日出时太阳更亮更红
			effect.sunBrightness = 4.5;

		}
		// 夜晚
		else {

			effect.enableStars = true;
			effect.enableMoon = true;
			effect.enableAurora = sunHeight < -0.3; // 只在深夜显示极光

			// 夜晚太阳亮度降低
			effect.sunBrightness = 2.0 + (sunHeight + 0.1) * 5; // 随着太阳下降进一步降低亮度

		}

	}

	/**
     * 应用白天预设
     * @param {Object} effect - 天空大气效果实例
     * @param {Object} sunParams - 太阳参数对象，包含elevation和azimuth属性
     */
	static applyDaytimePreset(effect, sunParams) {

		// 更新太阳位置
		sunParams.elevation = 45;
		sunParams.azimuth = 180;

		// 更新效果参数
		effect.enableStars = false;
		effect.enableMoon = false;
		effect.enableAurora = false;
		effect.intensity = 12.0;
		effect.skyBlueness = 0.5;
		effect.sunBrightness = 3.0;

		return this.calculateSunPosition(sunParams);

	}

	/**
     * 应用日落预设
     * @param {Object} effect - 天空大气效果实例
     * @param {Object} sunParams - 太阳参数对象，包含elevation和azimuth属性
     */
	static applySunsetPreset(effect, sunParams) {

		// 更新太阳位置
		sunParams.elevation = 2;
		sunParams.azimuth = 260;

		// 更新效果参数
		effect.enableStars = false;
		effect.enableMoon = false;
		effect.enableAurora = false;
		effect.intensity = 15.0;
		effect.skyBlueness = 0.3;
		effect.sunBrightness = 4.5;

		return this.calculateSunPosition(sunParams);

	}

	/**
     * 应用夜晚预设
     * @param {Object} effect - 天空大气效果实例
     * @param {Object} sunParams - 太阳参数对象，包含elevation和azimuth属性
     * @param {Object} moonParams - 月亮参数对象，包含elevation和azimuth属性
     */
	static applyNightPreset(effect, sunParams, moonParams) {

		// 更新太阳位置
		sunParams.elevation = -5;
		sunParams.azimuth = 180;

		// 更新月亮位置
		moonParams.elevation = 30;
		moonParams.azimuth = 45;

		// 更新效果参数
		effect.enableStars = true;
		effect.enableMoon = true;
		effect.enableAurora = false;
		effect.intensity = 12.0;
		effect.nightIntensity = 0.2;
		effect.starIntensity = 1.5;
		effect.moonIntensity = 1.2;
		effect.sunBrightness = 2.0;

		return {
			sunPosition: this.calculateSunPosition(sunParams),
			moonPosition: this.calculateMoonPosition(moonParams)
		};

	}

	/**
     * 应用极光预设
     * @param {Object} effect - 天空大气效果实例
     * @param {Object} sunParams - 太阳参数对象，包含elevation和azimuth属性
     * @param {Object} moonParams - 月亮参数对象，包含elevation和azimuth属性
     * @param {Object} auroraParams - 极光参数对象，包含red、green和blue属性
     */
	static applyAuroraPreset(effect, sunParams, moonParams, auroraParams) {

		// 更新太阳位置
		sunParams.elevation = -8;
		sunParams.azimuth = 180;

		// 更新月亮位置
		moonParams.elevation = 20;
		moonParams.azimuth = 35;

		// 更新极光颜色
		auroraParams.red = 2.15;
		auroraParams.green = -1.0;
		auroraParams.blue = 1.0;
		effect.auroraColor.set(auroraParams.red, auroraParams.green, auroraParams.blue);

		// 更新效果参数
		effect.enableStars = true;
		effect.enableMoon = true;
		effect.enableAurora = true;
		effect.intensity = 12.0;
		effect.nightIntensity = 0.15;
		effect.starIntensity = 1.2;
		effect.moonIntensity = 0.8;
		effect.auroraIntensity = 1.5;
		effect.auroraDensity = 1.0;
		effect.sunBrightness = 1.5;

		return {
			sunPosition: this.calculateSunPosition(sunParams),
			moonPosition: this.calculateMoonPosition(moonParams)
		};

	}

}
