import { createRequire } from "module";
import { glsl } from "esbuild-plugin-glsl";
import esbuild from "esbuild";
import fs from "fs";

const require = createRequire(import.meta.url);
const pkg = require("./package");

const plugins = [glsl({ minify: false })];
const external = ["spatial-controls", "run-scene-core", "tweakpane"];
const alias = {
    "three": "run-scene-core",
    "postprocessing": "./src/index.js"
};

console.log("🔍 开始分析打包体积...\n");

const result = await esbuild.build({
    entryPoints: ["./src/index.js"],
    outfile: "./build/analysis.js",
    logLevel: "info",
    format: "esm",
    target: "es2019",
    bundle: true,
    external,
    plugins,
    alias,
    metafile: true
});

// 保存 metafile
fs.writeFileSync('build/meta.json', JSON.stringify(result.metafile, null, 2));

// 分析输出
const outputs = result.metafile.outputs;
const inputs = result.metafile.inputs;

console.log("\n📊 打包分析结果:\n");

// 按大小排序输入文件
const sortedInputs = Object.entries(inputs)
    .map(([path, info]) => ({
        path,
        bytes: info.bytes
    }))
    .sort((a, b) => b.bytes - a.bytes);

console.log("🔝 前 20 个最大的源文件:\n");
sortedInputs.slice(0, 20).forEach((item, index) => {
    const kb = (item.bytes / 1024).toFixed(2);
    console.log(`${index + 1}. ${item.path.padEnd(60)} ${kb.padStart(10)} KB`);
});

// 统计各类文件
const stats = {
    glsl: 0,
    js: 0,
    total: 0
};

Object.entries(inputs).forEach(([path, info]) => {
    stats.total += info.bytes;
    if (path.includes('.frag') || path.includes('.vert') || path.includes('glsl')) {
        stats.glsl += info.bytes;
    } else {
        stats.js += info.bytes;
    }
});

console.log("\n📈 文件类型统计:\n");
console.log(`GLSL 着色器: ${(stats.glsl / 1024).toFixed(2)} KB (${((stats.glsl / stats.total) * 100).toFixed(1)}%)`);
console.log(`JavaScript:  ${(stats.js / 1024).toFixed(2)} KB (${((stats.js / stats.total) * 100).toFixed(1)}%)`);
console.log(`总计:        ${(stats.total / 1024).toFixed(2)} KB`);

// 输出文件大小
Object.entries(outputs).forEach(([path, info]) => {
    console.log(`\n📦 输出文件: ${path}`);
    console.log(`   大小: ${(info.bytes / 1024).toFixed(2)} KB`);
});

console.log("\n✅ 分析完成！");
console.log("📄 详细数据已保存到: build/meta.json");
console.log("🌐 在线查看: https://esbuild.github.io/analyze/");
