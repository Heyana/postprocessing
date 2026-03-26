import { createRequire } from "module";
import { glsl } from "esbuild-plugin-glsl";
import esbuild from "esbuild";
import fs from "fs";
import path from "path";

const require = createRequire(import.meta.url);
const pkg = require("./package");

const plugins = [glsl({ minify: false })];
const external = ["spatial-controls", "run-scene-core", "tweakpane"];
const alias = {
    "three": "run-scene-core",
    "postprocessing": "./src/index.js"
};

console.log("🔍 生成可视化分析...\n");

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

// 生成可视化 HTML
const inputs = result.metafile.inputs;

// 构建树形结构
const tree = {};
let totalSize = 0;

Object.entries(inputs).forEach(([filePath, info]) => {
    totalSize += info.bytes;
    const parts = filePath.split(/[/\\]/);
    let current = tree;

    parts.forEach((part, index) => {
        if (!current[part]) {
            current[part] = {
                name: part,
                size: 0,
                children: {}
            };
        }

        if (index === parts.length - 1) {
            current[part].size = info.bytes;
            current[part].path = filePath;
        }

        current = current[part].children;
    });
});

// 递归计算文件夹大小
function calculateFolderSize(node) {
    if (Object.keys(node.children).length === 0) {
        return node.size;
    }

    let total = node.size;
    Object.values(node.children).forEach(child => {
        total += calculateFolderSize(child);
    });
    node.size = total;
    return total;
}

Object.values(tree).forEach(calculateFolderSize);

// 转换为 D3 层次结构格式
function convertToHierarchy(node, name = "root") {
    const result = {
        name: name,
        value: node.size,
        path: node.path
    };

    const children = Object.entries(node.children).map(([key, child]) =>
        convertToHierarchy(child, key)
    );

    if (children.length > 0) {
        result.children = children;
    }

    return result;
}

const hierarchyData = {
    name: "postprocessing",
    children: Object.entries(tree).map(([key, node]) => convertToHierarchy(node, key))
};

// 生成 HTML
const html = `<!DOCTYPE html>
<html>
<head>
	<meta charset="utf-8">
	<title>Bundle Visualizer - postprocessing</title>
	<script src="https://d3js.org/d3.v7.min.js"></script>
	<style>
		* { margin: 0; padding: 0; box-sizing: border-box; }
		body {
			font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
			background: #1e1e1e;
			color: #d4d4d4;
		}
		#header {
			background: #252526;
			padding: 20px;
			border-bottom: 1px solid #3e3e42;
		}
		h1 { font-size: 24px; margin-bottom: 10px; }
		#stats {
			display: flex;
			gap: 30px;
			margin-top: 15px;
			font-size: 14px;
		}
		.stat { display: flex; flex-direction: column; }
		.stat-label { color: #858585; font-size: 12px; }
		.stat-value { font-size: 20px; font-weight: 600; margin-top: 5px; }
		#container {
			display: flex;
			height: calc(100vh - 140px);
		}
		#chart {
			flex: 1;
			position: relative;
		}
		#sidebar {
			width: 350px;
			background: #252526;
			border-left: 1px solid #3e3e42;
			padding: 20px;
			overflow-y: auto;
		}
		#info h3 {
			font-size: 16px;
			margin-bottom: 15px;
			color: #4ec9b0;
		}
		.info-item {
			margin-bottom: 15px;
			padding-bottom: 15px;
			border-bottom: 1px solid #3e3e42;
		}
		.info-label {
			color: #858585;
			font-size: 12px;
			margin-bottom: 5px;
		}
		.info-value {
			font-size: 14px;
			word-break: break-all;
		}
		.breadcrumb {
			background: #2d2d30;
			padding: 10px 20px;
			font-size: 13px;
			color: #858585;
			border-bottom: 1px solid #3e3e42;
		}
		.breadcrumb span {
			color: #4ec9b0;
		}
		text {
			font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
			font-size: 11px;
			pointer-events: none;
		}
		.node {
			cursor: pointer;
			transition: opacity 0.2s;
		}
		.node:hover {
			opacity: 0.8;
		}
		#tooltip {
			position: absolute;
			background: #252526;
			border: 1px solid #3e3e42;
			padding: 10px;
			border-radius: 4px;
			pointer-events: none;
			opacity: 0;
			transition: opacity 0.2s;
			font-size: 12px;
			box-shadow: 0 4px 12px rgba(0,0,0,0.5);
		}
	</style>
</head>
<body>
	<div id="header">
		<h1>📦 Bundle Visualizer</h1>
		<div id="stats">
			<div class="stat">
				<span class="stat-label">Total Size</span>
				<span class="stat-value">${(totalSize / 1024).toFixed(2)} KB</span>
			</div>
			<div class="stat">
				<span class="stat-label">Files</span>
				<span class="stat-value">${Object.keys(inputs).length}</span>
			</div>
			<div class="stat">
				<span class="stat-label">Largest File</span>
				<span class="stat-value" id="largest-file"></span>
			</div>
		</div>
	</div>
	<div class="breadcrumb">
		<span id="breadcrumb">postprocessing</span>
	</div>
	<div id="container">
		<div id="chart"></div>
		<div id="sidebar">
			<div id="info">
				<h3>📊 Details</h3>
				<div class="info-item">
					<div class="info-label">Click on any block to zoom in</div>
				</div>
			</div>
		</div>
	</div>
	<div id="tooltip"></div>

	<script>
		const data = ${JSON.stringify(hierarchyData)};
		
		const width = window.innerWidth - 350;
		const height = window.innerHeight - 140;
		
		const color = d3.scaleOrdinal(d3.schemeCategory10);
		
		const treemap = d3.treemap()
			.size([width, height])
			.paddingInner(2)
			.paddingOuter(4)
			.round(true);
		
		const svg = d3.select("#chart")
			.append("svg")
			.attr("width", width)
			.attr("height", height);
		
		const tooltip = d3.select("#tooltip");
		
		let root = d3.hierarchy(data)
			.sum(d => d.value)
			.sort((a, b) => b.value - a.value);
		
		treemap(root);
		
		// 找到最大文件
		const largestFile = root.leaves().reduce((max, node) => 
			node.value > max.value ? node : max
		);
		document.getElementById("largest-file").textContent = 
			(largestFile.value / 1024).toFixed(2) + " KB";
		
		function render(node) {
			svg.selectAll("*").remove();
			
			const nodes = node.descendants();
			
			const cell = svg.selectAll("g")
				.data(nodes)
				.join("g")
				.attr("class", "node")
				.attr("transform", d => \`translate(\${d.x0},\${d.y0})\`);
			
			cell.append("rect")
				.attr("width", d => d.x1 - d.x0)
				.attr("height", d => d.y1 - d.y0)
				.attr("fill", d => {
					if (d === node) return "#2d2d30";
					const depth = d.depth - node.depth;
					return d3.interpolateRgb("#4ec9b0", "#569cd6")(depth / 5);
				})
				.attr("stroke", "#1e1e1e")
				.attr("stroke-width", 1);
			
			cell.append("text")
				.attr("x", 4)
				.attr("y", 16)
				.attr("fill", "white")
				.text(d => {
					const width = d.x1 - d.x0;
					const height = d.y1 - d.y0;
					if (width < 50 || height < 20) return "";
					const name = d.data.name;
					const size = (d.value / 1024).toFixed(1) + "KB";
					return width > 100 ? \`\${name} (\${size})\` : name;
				});
			
			cell.on("click", (event, d) => {
				if (d.children) {
					render(d);
					updateBreadcrumb(d);
					updateInfo(d);
				}
			});
			
			cell.on("mouseover", (event, d) => {
				tooltip
					.style("opacity", 1)
					.style("left", (event.pageX + 10) + "px")
					.style("top", (event.pageY + 10) + "px")
					.html(\`
						<strong>\${d.data.name}</strong><br>
						Size: \${(d.value / 1024).toFixed(2)} KB<br>
						Percentage: \${((d.value / root.value) * 100).toFixed(2)}%
					\`);
			});
			
			cell.on("mouseout", () => {
				tooltip.style("opacity", 0);
			});
		}
		
		function updateBreadcrumb(node) {
			const path = [];
			let current = node;
			while (current) {
				path.unshift(current.data.name);
				current = current.parent;
			}
			document.getElementById("breadcrumb").textContent = path.join(" / ");
		}
		
		function updateInfo(node) {
			const info = document.getElementById("info");
			const children = node.children || [];
			const sorted = children.sort((a, b) => b.value - a.value).slice(0, 10);
			
			info.innerHTML = \`
				<h3>📊 \${node.data.name}</h3>
				<div class="info-item">
					<div class="info-label">Total Size</div>
					<div class="info-value">\${(node.value / 1024).toFixed(2)} KB</div>
				</div>
				<div class="info-item">
					<div class="info-label">Percentage</div>
					<div class="info-value">\${((node.value / root.value) * 100).toFixed(2)}%</div>
				</div>
				\${node.data.path ? \`
					<div class="info-item">
						<div class="info-label">Path</div>
						<div class="info-value">\${node.data.path}</div>
					</div>
				\` : ''}
				\${sorted.length > 0 ? \`
					<div class="info-item">
						<div class="info-label">Top Children</div>
						\${sorted.map(child => \`
							<div style="margin-top: 8px;">
								<div style="font-size: 13px;">\${child.data.name}</div>
								<div style="color: #858585; font-size: 11px;">
									\${(child.value / 1024).toFixed(2)} KB 
									(\${((child.value / node.value) * 100).toFixed(1)}%)
								</div>
							</div>
						\`).join('')}
					</div>
				\` : ''}
			\`;
		}
		
		render(root);
		updateInfo(root);
	</script>
</body>
</html>`;

fs.writeFileSync('build/visualizer.html', html);

console.log("\n✅ 可视化文件已生成！");
console.log("\n📊 打开方式：");
console.log("   1. 在浏览器中打开: build/visualizer.html");
console.log("   2. 或访问: https://esbuild.github.io/analyze/ 并上传 build/meta.json");
console.log("\n💡 提示：");
console.log("   - 点击任意区块可以放大查看");
console.log("   - 鼠标悬停查看详细信息");
console.log("   - 颜色深浅表示文件大小");
