/**
 * A require shim for external bundles.
 */

export function require(name) {

	// 所有模块都从window.VENDOR对象中获取
	return window.VENDOR;

}
